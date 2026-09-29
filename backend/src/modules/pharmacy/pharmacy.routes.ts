import { Prisma, PrescriptionStatus, Role, UserStatus, InventoryMovementType, DispenseStatus } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { authenticate, reverifyRole, requireRole } from "../../middleware/auth";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../lib/errors";
import { wrap } from "../../lib/async";
import { audit } from "../../lib/audit";
import { verifyPrescriptionSignature } from "../../lib/prescription-signature";

const router = Router();
const pharmacyRoles = [Role.PHARMACIST, Role.ADMIN];
const receiveSchema = z.object({
  batchNumber: z.string().trim().min(1).max(80),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  quantity: z.number().int().positive().max(1_000_000),
  unitCostPaise: z.number().int().nonnegative().max(1_000_000_000).optional(),
  note: z.string().trim().max(300).optional(),
});
const dispenseSchema = z.object({
  allocations: z.array(z.object({
    prescriptionItemId: z.string().min(1),
    batches: z.array(z.object({ batchId: z.string().min(1), quantity: z.number().int().positive() })).min(1).max(50),
    substitutionReason: z.string().trim().min(5).max(500).optional(),
  }).refine((line) => new Set(line.batches.map((batch) => batch.batchId)).size === line.batches.length, "Do not repeat a batch within a line."))
    .min(1).max(50)
    .refine((lines) => new Set(lines.map((line) => line.prescriptionItemId)).size === lines.length, "Each prescription item can appear only once."),
});

function todayUtcDate() {
  return new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
}

function dateOnlyIsValid(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function expiryWindow(days = 90) {
  const from = todayUtcDate();
  const through = new Date(from);
  through.setUTCDate(through.getUTCDate() + days);
  return { from, through };
}

router.get("/pharmacy/dispense-queue", authenticate, requireRole(...pharmacyRoles), reverifyRole(...pharmacyRoles), wrap(async (req, res) => {
  const query = z.object({ status: z.enum(["ISSUED", "PARTIALLY_DISPENSED", "ALL"]).default("ALL"), search: z.string().trim().max(100).optional() }).parse(req.query);
  const prescriptions = await prisma.prescription.findMany({
    where: {
      tenantId: req.tenantId!,
      status: query.status === "ALL" ? { in: [PrescriptionStatus.ISSUED, PrescriptionStatus.PARTIALLY_DISPENSED] } : query.status,
      ...(query.search ? { patient: { is: { OR: [
        { mrn: { contains: query.search, mode: "insensitive" } },
        { user: { is: { name: { contains: query.search, mode: "insensitive" } } } },
      ] } } } : {}),
    },
    include: {
      patient: { select: { id: true, mrn: true, user: { select: { name: true } } } },
      doctor: { include: { user: { select: { name: true } } } },
      encounter: { select: { chiefComplaint: true, diagnosis: true } },
      items: { include: { dispenseLines: { select: { quantity: true } }, drugGeneric: { select: { id: true, genericName: true, strength: true, dosageForm: true } } } },
      dispenses: { select: { id: true, status: true, createdAt: true, lines: { select: { quantity: true } } }, orderBy: { createdAt: "desc" } },
    },
    orderBy: { issuedAt: "asc" }, take: 300,
  });
  res.json({ success: true, data: { prescriptions: prescriptions.map((prescription) => ({
    ...prescription,
    signatureValid: verifyPrescriptionSignature(prescription),
    items: prescription.items.map((item) => ({ ...item, remainingQuantity: Math.max(0, (Number(item.quantity) || 0) - item.dispensedQuantity) })),
  })) } });
}));

router.get("/pharmacy/inventory", authenticate, requireRole(...pharmacyRoles), reverifyRole(...pharmacyRoles), wrap(async (req, res) => {
  const { search } = z.object({ search: z.string().trim().max(100).optional() }).parse(req.query);
  const items = await prisma.inventoryItem.findMany({
    where: {
      tenantId: req.tenantId!, isActive: true,
      ...(search ? { drugGeneric: { is: { OR: [
        { genericName: { contains: search, mode: "insensitive" } },
        { brands: { some: { brandName: { contains: search, mode: "insensitive" }, isActive: true } } },
      ] } } } : {}),
    },
    include: {
      drugGeneric: { include: { brands: { where: { isActive: true }, select: { brandName: true } } } },
      batches: { where: { quantityOnHand: { gt: 0 } }, orderBy: [{ expiryDate: "asc" }, { receivedAt: "asc" }] },
    },
    orderBy: { drugGeneric: { genericName: "asc" } }, take: 500,
  });
  const inventory = items.map((item) => ({
    ...item,
    quantityOnHand: item.batches.reduce((sum, batch) => sum + batch.quantityOnHand, 0),
    batches: item.batches.map((batch) => ({ ...batch, expired: batch.expiryDate < todayUtcDate() })),
  }));
  res.json({ success: true, data: { inventory } });
}));

router.get("/pharmacy/alerts", authenticate, requireRole(...pharmacyRoles), reverifyRole(...pharmacyRoles), wrap(async (_req, res) => {
  const tenantId = _req.tenantId!;
  const { from, through } = expiryWindow(90);
  const inventory = await prisma.inventoryItem.findMany({
    where: { tenantId, isActive: true },
    include: {
      drugGeneric: { select: { genericName: true, strength: true, dosageForm: true } },
      batches: { where: { quantityOnHand: { gt: 0 } }, orderBy: [{ expiryDate: "asc" }, { receivedAt: "asc" }] },
    },
  });
  const lowStock = inventory.flatMap((item) => {
    const usable = item.batches.filter((batch) => batch.expiryDate >= from);
    const total = usable.reduce((sum, batch) => sum + batch.quantityOnHand, 0);
    return total <= item.reorderLevel ? [{ inventoryItemId: item.id, drug: item.drugGeneric, quantityOnHand: total, reorderLevel: item.reorderLevel }] : [];
  });
  const nearExpiry = inventory.flatMap((item) => item.batches
    .filter((batch) => batch.expiryDate >= from && batch.expiryDate <= through)
    .map((batch) => ({ inventoryItemId: item.id, drug: item.drugGeneric, batchId: batch.id, batchNumber: batch.batchNumber, expiryDate: batch.expiryDate, quantityOnHand: batch.quantityOnHand })));
  const expired = inventory.flatMap((item) => item.batches
    .filter((batch) => batch.expiryDate < from)
    .map((batch) => ({ inventoryItemId: item.id, drug: item.drugGeneric, batchId: batch.id, batchNumber: batch.batchNumber, expiryDate: batch.expiryDate, quantityOnHand: batch.quantityOnHand })));
  res.json({ success: true, data: { lowStock, nearExpiry, expired } });
}));

router.post("/pharmacy/inventory/items", authenticate, requireRole(...pharmacyRoles), reverifyRole(...pharmacyRoles), wrap(async (req, res) => {
  const body = z.object({ drugGenericId: z.string().min(1), reorderLevel: z.number().int().nonnegative().max(1_000_000).default(0) }).parse(req.body);
  const generic = await prisma.drugGeneric.findFirst({ where: { id: body.drugGenericId, tenantId: req.tenantId!, isActive: true }, select: { id: true } });
  if (!generic) throw new AppError(404, "DRUG_NOT_FOUND", "Drug generic not found.");
  const inventoryItem = await prisma.inventoryItem.upsert({
    where: { tenantId_drugGenericId: { tenantId: req.tenantId!, drugGenericId: generic.id } },
    create: { tenantId: req.tenantId!, drugGenericId: generic.id, reorderLevel: body.reorderLevel },
    update: { reorderLevel: body.reorderLevel, isActive: true },
  });
  await audit(req, "PHARMACY_INVENTORY_ITEM_CONFIGURED", "InventoryItem", inventoryItem.id);
  res.status(201).json({ success: true, data: { inventoryItem } });
}));

router.post("/pharmacy/inventory/items/:id/batches", authenticate, requireRole(...pharmacyRoles), reverifyRole(...pharmacyRoles), wrap(async (req, res) => {
  const body = receiveSchema.parse(req.body);
  if (!dateOnlyIsValid(body.expiryDate)) throw new AppError(422, "INVALID_EXPIRY_DATE", "Enter a valid batch expiry date.");
  if (new Date(`${body.expiryDate}T00:00:00.000Z`) < todayUtcDate()) throw new AppError(422, "BATCH_ALREADY_EXPIRED", "Cannot receive an already-expired batch.");
  const result = await prisma.$transaction(async (tx) => {
    const item = await tx.inventoryItem.findFirst({ where: { id: req.params.id, tenantId: req.tenantId!, isActive: true }, select: { id: true } });
    if (!item) throw new AppError(404, "INVENTORY_ITEM_NOT_FOUND", "Inventory item not found.");
    const batch = await tx.inventoryBatch.create({
      data: {
        tenantId: req.tenantId!, inventoryItemId: item.id, batchNumber: body.batchNumber,
        expiryDate: new Date(`${body.expiryDate}T00:00:00.000Z`), quantityOnHand: body.quantity,
        unitCostPaise: body.unitCostPaise ?? null,
      },
    });
    await tx.inventoryMovement.create({
      data: { tenantId: req.tenantId!, inventoryItemId: item.id, batchId: batch.id, recordedById: req.user!.sub, type: InventoryMovementType.RECEIPT, quantityDelta: body.quantity, note: body.note || null },
    });
    return batch;
  });
  await audit(req, "PHARMACY_STOCK_RECEIVED", "InventoryBatch", result.id);
  res.status(201).json({ success: true, data: { batch: result } });
}));

router.get("/pharmacy/prescriptions/:id/fefo", authenticate, requireRole(...pharmacyRoles), reverifyRole(...pharmacyRoles), wrap(async (req, res) => {
  const prescription = await prisma.prescription.findFirst({
    where: { id: req.params.id, tenantId: req.tenantId!, status: { in: [PrescriptionStatus.ISSUED, PrescriptionStatus.PARTIALLY_DISPENSED] } },
    include: { items: { include: { dispenseLines: { select: { quantity: true } } } } },
  });
  if (!prescription) throw new AppError(404, "PRESCRIPTION_NOT_DISPENSABLE", "Issued or partially dispensed prescription not found.");
  const { from } = expiryWindow(0);
  const remainingItems = prescription.items.filter((item) => Number(item.quantity) > item.dispensedQuantity);
  const inventory = await prisma.inventoryItem.findMany({
    where: { tenantId: req.tenantId!, isActive: true, drugGenericId: { in: remainingItems.map((item) => item.drugGenericId) } },
    include: {
      drugGeneric: { select: { id: true, genericName: true } },
      batches: { where: { quantityOnHand: { gt: 0 }, expiryDate: { gte: from } }, orderBy: [{ expiryDate: "asc" }, { receivedAt: "asc" }] },
    },
  });
  const inventoryByGeneric = new Map(inventory.map((item) => [item.drugGenericId, item]));
  const suggestions = remainingItems.map((item) => ({
    prescriptionItemId: item.id,
    genericName: item.genericName,
    prescribedQuantity: Number(item.quantity),
    dispensedQuantity: item.dispensedQuantity,
    remainingQuantity: Math.max(0, Number(item.quantity) - item.dispensedQuantity),
    batches: inventoryByGeneric.get(item.drugGenericId)?.batches ?? [],
  }));
  res.json({ success: true, data: { suggestions } });
}));

router.post("/pharmacy/prescriptions/:id/dispense", authenticate, requireRole(...pharmacyRoles), reverifyRole(...pharmacyRoles), wrap(async (req, res) => {
  const body = dispenseSchema.parse(req.body);
  const idempotencyKey = req.get("Idempotency-Key")?.trim();
  if (!idempotencyKey || idempotencyKey.length > 100) throw new AppError(400, "IDEMPOTENCY_KEY_REQUIRED", "Provide an Idempotency-Key for the dispense transaction.");
  const previous = await prisma.dispense.findUnique({
    where: { tenantId_idempotencyKey: { tenantId: req.tenantId!, idempotencyKey } },
    include: { lines: true },
  });
  if (previous) {
    if (previous.prescriptionId !== req.params.id) throw new AppError(409, "IDEMPOTENCY_KEY_REUSED", "This idempotency key was already used for another prescription.");
    res.json({ success: true, data: { dispense: previous, idempotentReplay: true } });
    return;
  }

  const allocationBatchIds = body.allocations.flatMap((item) => item.batches.map((batch) => batch.batchId));
  const dispensed = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Prescription" WHERE "id" = ${req.params.id} AND "tenantId" = ${req.tenantId!} FOR UPDATE`;
    const duplicate = await tx.dispense.findUnique({ where: { tenantId_idempotencyKey: { tenantId: req.tenantId!, idempotencyKey } }, include: { lines: true } });
    if (duplicate) {
      if (duplicate.prescriptionId !== req.params.id) throw new AppError(409, "IDEMPOTENCY_KEY_REUSED", "This idempotency key was already used for another prescription.");
      return { dispense: duplicate, idempotentReplay: true };
    }
    const prescription = await tx.prescription.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId!, status: { in: [PrescriptionStatus.ISSUED, PrescriptionStatus.PARTIALLY_DISPENSED] } },
      include: { items: true },
    });
    if (!prescription) throw new AppError(404, "PRESCRIPTION_NOT_DISPENSABLE", "Issued or partially dispensed prescription not found.");
    if (!verifyPrescriptionSignature(prescription)) throw new AppError(409, "PRESCRIPTION_SIGNATURE_INVALID", "Prescription integrity verification failed; contact the prescriber before dispensing.");

    await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "InventoryBatch" WHERE "tenantId" = ${req.tenantId!} AND "id" IN (${Prisma.join(allocationBatchIds)}) ORDER BY "id" FOR UPDATE`;
    const batches = await tx.inventoryBatch.findMany({
      where: { id: { in: allocationBatchIds }, tenantId: req.tenantId! },
      include: { inventoryItem: { include: { drugGeneric: { select: { id: true, genericName: true, strength: true } } } } },
    });
    if (batches.length !== new Set(allocationBatchIds).size) throw new AppError(404, "INVENTORY_BATCH_NOT_FOUND", "One or more inventory batches were not found.");
    const batchById = new Map(batches.map((batch) => [batch.id, batch]));
    const itemById = new Map(prescription.items.map((item) => [item.id, item]));
    const groupedQuantity = new Map<string, number>();
    const planned: { prescriptionItemId: string; batchId: string; quantity: number; substitutionReason: string | null }[] = [];

    for (const allocation of body.allocations) {
      const prescriptionItem = itemById.get(allocation.prescriptionItemId);
      if (!prescriptionItem) throw new AppError(422, "PRESCRIPTION_ITEM_MISMATCH", "Selected medication does not belong to this prescription.");
      const prescribedTotal = Number(prescriptionItem.quantity);
      if (!Number.isSafeInteger(prescribedTotal) || prescribedTotal < 1) throw new AppError(422, "PRESCRIPTION_QUANTITY_INVALID", "This prescription quantity is not a whole number and cannot be dispensed from unit stock.");
      const requestedTotal = allocation.batches.reduce((sum, batch) => sum + batch.quantity, 0);
      if (prescriptionItem.dispensedQuantity + requestedTotal > prescribedTotal) throw new AppError(422, "DISPENSE_EXCEEDS_REMAINING", `Cannot dispense more than the remaining quantity for ${prescriptionItem.genericName}.`);
      allocation.batches.forEach((batchAllocation) => {
        const batch = batchById.get(batchAllocation.batchId)!;
        if (batch.expiryDate < todayUtcDate()) throw new AppError(422, "EXPIRED_BATCH", `Batch ${batch.batchNumber} is expired.`);
        const substituted = batch.inventoryItem.drugGenericId !== prescriptionItem.drugGenericId;
        if (substituted && !allocation.substitutionReason) throw new AppError(422, "SUBSTITUTION_REASON_REQUIRED", `Record a reason for substituting ${prescriptionItem.genericName}.`);
        const totalForBatch = (groupedQuantity.get(batch.id) ?? 0) + batchAllocation.quantity;
        groupedQuantity.set(batch.id, totalForBatch);
        planned.push({
          prescriptionItemId: prescriptionItem.id, batchId: batch.id, quantity: batchAllocation.quantity,
          substitutionReason: substituted ? allocation.substitutionReason!.trim() : null,
        });
      });
    }
    for (const [batchId, quantity] of groupedQuantity) {
      const batch = batchById.get(batchId)!;
      if (batch.quantityOnHand < quantity) throw new AppError(409, "INSUFFICIENT_STOCK", `Batch ${batch.batchNumber} has only ${batch.quantityOnHand} units available.`);
    }

    const nextDispensed = new Map(prescription.items.map((item) => [item.id, item.dispensedQuantity]));
    for (const allocation of body.allocations) {
      nextDispensed.set(allocation.prescriptionItemId, nextDispensed.get(allocation.prescriptionItemId)! + allocation.batches.reduce((sum, batch) => sum + batch.quantity, 0));
    }
    const complete = prescription.items.every((item) => nextDispensed.get(item.id)! >= Number(item.quantity));
    const dispense = await tx.dispense.create({
      data: {
        tenantId: req.tenantId!, prescriptionId: prescription.id, pharmacistId: req.user!.sub,
        idempotencyKey, status: complete ? DispenseStatus.COMPLETE : DispenseStatus.PARTIAL,
      },
    });
    for (const allocation of planned) {
      const batch = batchById.get(allocation.batchId)!;
      const changed = await tx.inventoryBatch.updateMany({
        where: { id: batch.id, tenantId: req.tenantId!, quantityOnHand: { gte: allocation.quantity }, expiryDate: { gte: todayUtcDate() } },
        data: { quantityOnHand: { decrement: allocation.quantity } },
      });
      if (!changed.count) throw new AppError(409, "INVENTORY_STOCK_CHANGED", `Stock in batch ${batch.batchNumber} changed; refresh the dispense queue.`);
      await tx.dispenseLine.create({
        data: { dispenseId: dispense.id, prescriptionItemId: allocation.prescriptionItemId, batchId: batch.id, quantity: allocation.quantity, substitutionReason: allocation.substitutionReason },
      });
      await tx.inventoryMovement.create({
        data: {
          tenantId: req.tenantId!, inventoryItemId: batch.inventoryItemId, batchId: batch.id,
          recordedById: req.user!.sub, type: InventoryMovementType.DISPENSE, quantityDelta: -allocation.quantity,
          referenceId: dispense.id, note: allocation.substitutionReason ? `Substitution: ${allocation.substitutionReason}` : null,
        },
      });
    }
    for (const [prescriptionItemId, dispensedQuantity] of nextDispensed) {
      const oldQuantity = itemById.get(prescriptionItemId)!.dispensedQuantity;
      const increment = dispensedQuantity - oldQuantity;
      if (increment) await tx.prescriptionItem.update({ where: { id: prescriptionItemId }, data: { dispensedQuantity: { increment } } });
    }
    await tx.prescription.update({ where: { id: prescription.id }, data: { status: complete ? PrescriptionStatus.DISPENSED : PrescriptionStatus.PARTIALLY_DISPENSED } });
    return { dispense: await tx.dispense.findUniqueOrThrow({ where: { id: dispense.id }, include: { lines: true } }), idempotentReplay: false };
  });
  if (!dispensed.idempotentReplay) await audit(req, "PRESCRIPTION_DISPENSED", "Dispense", dispensed.dispense.id);
  res.status(dispensed.idempotentReplay ? 200 : 201).json({ success: true, data: dispensed });
}));

export default router;