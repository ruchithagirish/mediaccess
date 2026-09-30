import {
  AdmissionStatus, AppointmentStatus, BedStatus, ChecklistPhase, InputOutputType,
  InvoiceStatus, MedicationAdministrationResult, OTCaseStatus, Role, TaxTreatment, UserStatus,
  WardType,
} from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middleware/auth";
import { reverifyRole, requireRole } from "../../middleware/rbac";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../lib/errors";
import { wrap } from "../../lib/async";
import { audit } from "../../middleware/audit";

const router = Router();
const readRoles = [Role.ADMIN, Role.RECEPTION, Role.DOCTOR, Role.NURSE, Role.ACCOUNTANT];
const wardRoles = [Role.ADMIN];
const admissionRoles = [Role.ADMIN, Role.RECEPTION];
const careRoles = [Role.ADMIN, Role.DOCTOR, Role.NURSE];
const nursingRoles = [Role.ADMIN, Role.NURSE];
const otRoles = [Role.ADMIN, Role.RECEPTION, Role.DOCTOR, Role.NURSE];

const checklistSeed: { key: string; label: string; phase: ChecklistPhase }[] = [
  { key: "identity", label: "Confirm patient identity, procedure, site, and consent", phase: ChecklistPhase.SIGN_IN },
  { key: "site-marked", label: "Confirm surgical site is marked", phase: ChecklistPhase.SIGN_IN },
  { key: "anaesthesia-safety", label: "Complete anaesthesia machine and medication checks", phase: ChecklistPhase.SIGN_IN },
  { key: "pulse-oximeter", label: "Confirm pulse oximeter is attached and functioning", phase: ChecklistPhase.SIGN_IN },
  { key: "allergies", label: "Confirm known allergies and airway/aspiration risks", phase: ChecklistPhase.SIGN_IN },
  { key: "team-introductions", label: "Team members introduce themselves by name and role", phase: ChecklistPhase.TIME_OUT },
  { key: "team-confirmation", label: "Verbally confirm patient, site, and procedure", phase: ChecklistPhase.TIME_OUT },
  { key: "critical-events", label: "Discuss anticipated critical events and duration", phase: ChecklistPhase.TIME_OUT },
  { key: "antibiotic-prophylaxis", label: "Confirm antibiotic prophylaxis when indicated", phase: ChecklistPhase.TIME_OUT },
  { key: "imaging", label: "Confirm essential imaging is displayed", phase: ChecklistPhase.TIME_OUT },
  { key: "procedure-recorded", label: "Confirm procedure name is recorded", phase: ChecklistPhase.SIGN_OUT },
  { key: "counts", label: "Confirm instrument, sponge, and needle counts", phase: ChecklistPhase.SIGN_OUT },
  { key: "specimen", label: "Confirm specimen labels are read aloud", phase: ChecklistPhase.SIGN_OUT },
  { key: "equipment", label: "Identify equipment issues for follow-up", phase: ChecklistPhase.SIGN_OUT },
  { key: "recovery", label: "Discuss recovery and post-operative concerns", phase: ChecklistPhase.SIGN_OUT },
];

const admissionInclude = {
  patient: { select: { id: true, mrn: true, user: { select: { name: true } } } },
  attendingDoctor: { select: { id: true, user: { select: { name: true } } } },
  bed: { include: { ward: { select: { id: true, name: true, code: true, type: true } } } },
  invoice: { select: { id: true, invoiceNumber: true, totalPaise: true, status: true, payments: { select: { amountPaise: true } } } },
} satisfies import("@prisma/client").Prisma.AdmissionInclude;

const isDate = (value: string) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isDate, "Enter a valid date.");
const timeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const dateTimeForSlot = (date: string, time: string) => new Date(`${date}T${time}:00.000Z`);
const minutes = (time: string) => {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
};
const clock = (value: number) => `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
function splitTax(stateCode: string, supplyStateCode: string, taxPaise: number) {
  if (stateCode !== supplyStateCode) return { cgstPaise: 0, sgstPaise: 0, igstPaise: taxPaise };
  const cgstPaise = Math.floor(taxPaise / 2);
  return { cgstPaise, sgstPaise: taxPaise - cgstPaise, igstPaise: 0 };
}

function assertOpen(admission: { status: AdmissionStatus }) {
  if (admission.status !== AdmissionStatus.ADMITTED) throw new AppError(409, "ADMISSION_CLOSED", "This admission is no longer active.");
}

router.get("/ipd/wards", authenticate, requireRole(...readRoles), reverifyRole(...readRoles), wrap(async (req, res) => {
  const wards = await prisma.ward.findMany({
    where: { tenantId: req.tenantId!, isActive: true },
    include: { beds: { where: { isActive: true }, include: {
      admissions: { where: { status: AdmissionStatus.ADMITTED }, take: 1, include: { patient: { select: { mrn: true, user: { select: { name: true } } } } } },
    } } },
    orderBy: [{ name: "asc" }, { code: "asc" }],
  });
  res.json({ success: true, data: { wards } });
}));

router.post("/ipd/wards", authenticate, requireRole(...wardRoles), reverifyRole(...wardRoles), wrap(async (req, res) => {
  const body = z.object({ code: z.string().trim().min(1).max(20), name: z.string().trim().min(2).max(100), type: z.nativeEnum(WardType).default(WardType.GENERAL) }).parse(req.body);
  const ward = await prisma.ward.create({ data: { ...body, tenantId: req.tenantId! } });
  await audit(req, "IPD_WARD_CREATED", "Ward", ward.id);
  res.status(201).json({ success: true, data: { ward } });
}));

router.post("/ipd/wards/:id/beds", authenticate, requireRole(...wardRoles), reverifyRole(...wardRoles), wrap(async (req, res) => {
  const body = z.object({ bedNumbers: z.array(z.string().trim().min(1).max(20)).min(1).max(100) }).parse(req.body);
  if (new Set(body.bedNumbers).size !== body.bedNumbers.length) throw new AppError(422, "DUPLICATE_BED_NUMBER", "Bed numbers must be unique within the ward.");
  const ward = await prisma.ward.findFirst({ where: { id: req.params.id, tenantId: req.tenantId!, isActive: true }, select: { id: true } });
  if (!ward) throw new AppError(404, "WARD_NOT_FOUND", "Ward not found.");
  const beds = await prisma.bed.createMany({ data: body.bedNumbers.map((bedNumber) => ({ tenantId: req.tenantId!, wardId: ward.id, bedNumber })) });
  await audit(req, "IPD_BEDS_CREATED", "Ward", ward.id);
  res.status(201).json({ success: true, data: { count: beds.count } });
}));

router.patch("/ipd/beds/:id/status", authenticate, requireRole(...wardRoles), reverifyRole(...wardRoles), wrap(async (req, res) => {
  const { status } = z.object({ status: z.enum([BedStatus.AVAILABLE, BedStatus.CLEANING, BedStatus.OUT_OF_SERVICE]) }).parse(req.body);
  const bed = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Bed" WHERE "id" = ${req.params.id} AND "tenantId" = ${req.tenantId!} FOR UPDATE`;
    const current = await tx.bed.findFirst({ where: { id: req.params.id, tenantId: req.tenantId!, isActive: true } });
    if (!current) throw new AppError(404, "BED_NOT_FOUND", "Bed not found.");
    if (await tx.admission.findFirst({ where: { bedId: current.id, status: AdmissionStatus.ADMITTED }, select: { id: true } })) throw new AppError(409, "BED_OCCUPIED", "An occupied bed cannot be marked available or taken out of service.");
    return tx.bed.update({ where: { id: current.id }, data: { status } });
  });
  await audit(req, "IPD_BED_STATUS_CHANGED", "Bed", bed.id);
  res.json({ success: true, data: { bed } });
}));

router.get("/ipd/doctors", authenticate, requireRole(...readRoles), reverifyRole(...readRoles), wrap(async (req, res) => {
  const doctors = await prisma.doctorProfile.findMany({
    where: { tenantId: req.tenantId!, user: { is: { status: UserStatus.ACTIVE, roles: { has: Role.DOCTOR } } } },
    select: { id: true, registrationNumber: true, user: { select: { name: true } } },
    orderBy: { user: { name: "asc" } },
  });
  res.json({ success: true, data: { doctors } });
}));

router.get("/ipd/patients", authenticate, requireRole(...admissionRoles), reverifyRole(...admissionRoles), wrap(async (req, res) => {
  const { search } = z.object({ search: z.string().trim().min(1).max(100) }).parse(req.query);
  const patients = await prisma.patient.findMany({
    where: { tenantId: req.tenantId!, OR: [
      { mrn: { contains: search, mode: "insensitive" } },
      { user: { is: { name: { contains: search, mode: "insensitive" } } } },
    ] },
    select: { id: true, mrn: true, user: { select: { name: true } }, admissions: { where: { status: AdmissionStatus.ADMITTED }, select: { id: true }, take: 1 } },
    orderBy: { user: { name: "asc" } }, take: 30,
  });
  res.json({ success: true, data: { patients } });
}));

router.get("/ipd/admissions", authenticate, requireRole(...readRoles), reverifyRole(...readRoles), wrap(async (req, res) => {
  const { status } = z.object({ status: z.enum(["ADMITTED", "DISCHARGED", "ALL"]).default("ADMITTED") }).parse(req.query);
  const admissions = await prisma.admission.findMany({
    where: { tenantId: req.tenantId!, ...(status === "ALL" ? {} : { status }) },
    include: { ...admissionInclude, progressNotes: { orderBy: { version: "desc" }, take: 1, select: { version: true, content: true, createdAt: true } } },
    orderBy: [{ status: "asc" }, { admittedAt: "desc" }], take: 300,
  });
  const withBalances = admissions.map((admission) => ({
    ...admission,
    billBalancePaise: Math.max(0, (admission.invoice?.totalPaise ?? 0) - (admission.invoice?.payments.reduce((sum, payment) => sum + payment.amountPaise, 0) ?? 0)),
  }));
  res.json({ success: true, data: { admissions: withBalances } });
}));

router.post("/ipd/admissions", authenticate, requireRole(...admissionRoles), reverifyRole(...admissionRoles), wrap(async (req, res) => {
  const body = z.object({ patientId: z.string().min(1), attendingDoctorId: z.string().min(1), bedId: z.string().min(1), diagnosis: z.string().trim().min(2).max(500) }).parse(req.body);
  const admission = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Bed" WHERE "id" = ${body.bedId} AND "tenantId" = ${req.tenantId!} FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "Patient" WHERE "id" = ${body.patientId} AND "tenantId" = ${req.tenantId!} FOR UPDATE`;
    const [bed, patient, doctor] = await Promise.all([
      tx.bed.findFirst({ where: { id: body.bedId, tenantId: req.tenantId!, isActive: true, status: BedStatus.AVAILABLE }, select: { id: true } }),
      tx.patient.findFirst({ where: { id: body.patientId, tenantId: req.tenantId! }, select: { id: true, admissions: { where: { status: AdmissionStatus.ADMITTED }, select: { id: true }, take: 1 } } }),
      tx.doctorProfile.findFirst({ where: { id: body.attendingDoctorId, tenantId: req.tenantId!, user: { is: { status: UserStatus.ACTIVE, roles: { has: Role.DOCTOR } } } }, select: { id: true } }),
    ]);
    if (!bed) throw new AppError(409, "BED_NOT_AVAILABLE", "Selected bed is not available.");
    if (!patient) throw new AppError(404, "PATIENT_NOT_FOUND", "Patient not found.");
    if (patient.admissions.length) throw new AppError(409, "PATIENT_ALREADY_ADMITTED", "This patient already has an active admission.");
    if (!doctor) throw new AppError(404, "DOCTOR_NOT_FOUND", "Attending doctor not found.");
    await tx.$queryRaw`SELECT "id" FROM "Tenant" WHERE "id" = ${req.tenantId!} FOR UPDATE`;
    const year = new Date().getUTCFullYear();
    const number = await tx.admission.count({ where: { tenantId: req.tenantId! } }) + 1;
    const created = await tx.admission.create({
      data: { tenantId: req.tenantId!, patientId: patient.id, attendingDoctorId: doctor.id, bedId: bed.id, diagnosis: body.diagnosis, admissionNumber: `IPD-${year}-${String(number).padStart(6, "0")}` },
    });
    const invoiceSequence = ((await tx.invoice.aggregate({ where: { tenantId: req.tenantId! }, _max: { sequence: true } }))._max.sequence ?? 0) + 1;
    await tx.invoice.create({ data: {
      tenantId: req.tenantId!, patientId: patient.id, admissionId: created.id,
      invoiceNumber: `MA-INV-${year}-${String(invoiceSequence).padStart(6, "0")}`,
      sequence: invoiceSequence, subtotalPaise: 0, discountPaise: 0, taxPaise: 0, totalPaise: 0,
      status: InvoiceStatus.ISSUED,
    } });
    await tx.bed.update({ where: { id: bed.id }, data: { status: BedStatus.OCCUPIED } });
    await tx.clinicalRecord.create({ data: { patientId: patient.id, type: "ADMISSION", title: `Admission ${created.admissionNumber}`, summary: body.diagnosis, status: "ADMITTED", occurredAt: created.admittedAt } });
    return tx.admission.findUniqueOrThrow({ where: { id: created.id }, include: admissionInclude });
  });
  await audit(req, "IPD_ADMISSION_CREATED", "Admission", admission.id);
  res.status(201).json({ success: true, data: { admission } });
}));

router.get("/ipd/admissions/:id", authenticate, requireRole(...readRoles), reverifyRole(...readRoles), wrap(async (req, res) => {
  const admission = await prisma.admission.findFirst({
    where: { id: req.params.id, tenantId: req.tenantId! },
    include: {
      ...admissionInclude,
      vitals: { orderBy: { recordedAt: "desc" }, take: 100, include: { enteredBy: { select: { name: true } } } },
      inputOutputEntries: { orderBy: { recordedAt: "desc" }, take: 100, include: { recordedBy: { select: { name: true } } } },
      medicationOrders: { where: { isActive: true }, include: { administrations: { orderBy: { administeredAt: "desc" }, take: 5, include: { administeredBy: { select: { name: true } } } } }, orderBy: { createdAt: "desc" } },
      progressNotes: { orderBy: { version: "desc" }, take: 100, include: { author: { select: { name: true, roles: true } } } },
      transfers: { orderBy: { createdAt: "desc" }, include: { fromBed: { include: { ward: true } }, toBed: { include: { ward: true } }, transferredBy: { select: { name: true } } } },
    },
  });
  if (!admission) throw new AppError(404, "ADMISSION_NOT_FOUND", "Admission not found.");
  const paidPaise = admission.invoice?.payments.reduce((sum, payment) => sum + payment.amountPaise, 0) ?? 0;
  res.json({ success: true, data: { admission: { ...admission, billBalancePaise: Math.max(0, (admission.invoice?.totalPaise ?? 0) - paidPaise) } } });
}));

router.post("/ipd/admissions/:id/transfer", authenticate, requireRole(...admissionRoles), reverifyRole(...admissionRoles), wrap(async (req, res) => {
  const body = z.object({ bedId: z.string().min(1), reason: z.string().trim().min(3).max(300) }).parse(req.body);
  const transfer = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Admission" WHERE "id" = ${req.params.id} AND "tenantId" = ${req.tenantId!} FOR UPDATE`;
    const admission = await tx.admission.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
    if (!admission) throw new AppError(404, "ADMISSION_NOT_FOUND", "Admission not found.");
    assertOpen(admission);
    await tx.$queryRaw`SELECT "id" FROM "Bed" WHERE "tenantId" = ${req.tenantId!} AND "id" IN (${admission.bedId}, ${body.bedId}) ORDER BY "id" FOR UPDATE`;
    const destination = await tx.bed.findFirst({ where: { id: body.bedId, tenantId: req.tenantId!, isActive: true, status: BedStatus.AVAILABLE } });
    if (!destination) throw new AppError(409, "BED_NOT_AVAILABLE", "Destination bed is not available.");
    if (destination.id === admission.bedId) throw new AppError(422, "SAME_BED", "Choose a different destination bed.");
    const source = await tx.bed.findFirst({ where: { id: admission.bedId, tenantId: req.tenantId! }, select: { id: true } });
    await tx.bed.update({ where: { id: destination.id }, data: { status: BedStatus.OCCUPIED } });
    const result = await tx.bedTransfer.create({ data: { tenantId: req.tenantId!, admissionId: admission.id, fromBedId: admission.bedId, toBedId: destination.id, transferredById: req.user!.sub, reason: body.reason } });
    await tx.admission.update({ where: { id: admission.id }, data: { bedId: destination.id } });
    if (source) await tx.bed.update({ where: { id: source.id }, data: { status: BedStatus.CLEANING } });
    return result;
  });
  await audit(req, "IPD_BED_TRANSFERRED", "BedTransfer", transfer.id);
  res.status(201).json({ success: true, data: { transfer } });
}));

router.post("/ipd/admissions/:id/charges", authenticate, requireRole(Role.ADMIN, Role.RECEPTION, Role.ACCOUNTANT), reverifyRole(Role.ADMIN, Role.RECEPTION, Role.ACCOUNTANT), wrap(async (req, res) => {
  const body = z.object({ serviceItemId: z.string().min(1), quantity: z.number().int().min(1).max(1000) }).parse(req.body);
  const line = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Admission" WHERE "id" = ${req.params.id} AND "tenantId" = ${req.tenantId!} FOR UPDATE`;
    const admission = await tx.admission.findFirst({ where: { id: req.params.id, tenantId: req.tenantId!, status: AdmissionStatus.ADMITTED }, include: { invoice: true } });
    if (!admission?.invoice) throw new AppError(404, "ACTIVE_ADMISSION_NOT_FOUND", "Active admission bill not found.");
    const [service, tenant, patient] = await Promise.all([
      tx.serviceItem.findFirst({ where: { id: body.serviceItemId, tenantId: req.tenantId!, isActive: true } }),
      tx.tenant.findUnique({ where: { id: req.tenantId! }, select: { stateCode: true, gstin: true } }),
      tx.patient.findFirst({ where: { id: admission.patientId, tenantId: req.tenantId! }, select: { stateCode: true } }),
    ]);
    if (!service) throw new AppError(404, "SERVICE_NOT_FOUND", "Active billing service not found.");
    if (!tenant) throw new AppError(404, "TENANT_NOT_FOUND", "Hospital settings were not found.");
    const placeOfSupply = admission.invoice.placeOfSupplyStateCode ?? patient?.stateCode ?? tenant.stateCode;
    const lineTotalPaise = body.quantity * service.unitPricePaise;
    const taxablePaise = service.taxTreatment === TaxTreatment.TAXABLE ? lineTotalPaise : 0;
    const taxPaise = service.taxTreatment === TaxTreatment.TAXABLE ? Math.round(taxablePaise * service.gstRateBps / 10000) : 0;
    if (taxPaise > 0 && (!tenant.gstin || !tenant.stateCode || !placeOfSupply)) throw new AppError(422, "GST_CONFIGURATION_REQUIRED", "Set hospital GST details and patient place of supply before adding a taxable charge.");
    if (!Number.isSafeInteger(lineTotalPaise) || admission.invoice.totalPaise + lineTotalPaise + taxPaise > 2_000_000_000) throw new AppError(422, "BILL_TOTAL_TOO_LARGE", "This charge exceeds the supported running-bill total.");
    const taxSplit = taxPaise && placeOfSupply && tenant.stateCode ? splitTax(tenant.stateCode, placeOfSupply, taxPaise) : { cgstPaise: 0, sgstPaise: 0, igstPaise: 0 };
    const created = await tx.invoiceLine.create({ data: {
      invoiceId: admission.invoice.id, description: service.name, quantity: body.quantity,
      unitPricePaise: service.unitPricePaise, lineTotalPaise, serviceItemId: service.id,
      hsnSacCode: service.hsnSacCode, taxTreatment: service.taxTreatment, gstRateBps: service.gstRateBps,
      taxablePaise, cgstPaise: taxSplit.cgstPaise, sgstPaise: taxSplit.sgstPaise, igstPaise: taxSplit.igstPaise,
    } });
    await tx.invoice.update({ where: { id: admission.invoice.id }, data: {
      subtotalPaise: { increment: lineTotalPaise }, taxPaise: { increment: taxPaise }, totalPaise: { increment: lineTotalPaise + taxPaise },
      ...(placeOfSupply && !admission.invoice.placeOfSupplyStateCode ? { placeOfSupplyStateCode: placeOfSupply } : {}),
    } });
    return created;
  });
  await audit(req, "IPD_RUNNING_BILL_CHARGED", "InvoiceLine", line.id);
  res.status(201).json({ success: true, data: { line } });
}));

router.post("/ipd/admissions/:id/vitals", authenticate, requireRole(...nursingRoles), reverifyRole(...nursingRoles), wrap(async (req, res) => {
  const body = z.object({ systolic: z.number().min(40).max(300).optional(), diastolic: z.number().min(20).max(200).optional(), pulse: z.number().min(10).max(300).optional(), temperature: z.number().min(25).max(45).optional(), respiratoryRate: z.number().min(1).max(100).optional(), oxygenSaturation: z.number().min(0).max(100).optional(), height: z.number().positive().max(300).optional(), weight: z.number().positive().max(500).optional(), notes: z.string().trim().max(500).optional() }).refine((value) => Object.values(value).some((item) => item !== undefined), "Enter at least one observation.").parse(req.body);
  const admission = await prisma.admission.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
  if (!admission) throw new AppError(404, "ADMISSION_NOT_FOUND", "Admission not found.");
  assertOpen(admission);
  const abnormal = (body.systolic !== undefined && (body.systolic < 90 || body.systolic > 140)) || (body.diastolic !== undefined && (body.diastolic < 60 || body.diastolic > 90)) || (body.pulse !== undefined && (body.pulse < 50 || body.pulse > 100)) || (body.temperature !== undefined && (body.temperature < 36 || body.temperature > 38)) || (body.respiratoryRate !== undefined && (body.respiratoryRate < 12 || body.respiratoryRate > 20)) || (body.oxygenSaturation !== undefined && body.oxygenSaturation < 95);
  const vital = await prisma.vitalEntry.create({ data: { ...body, patientId: admission.patientId, admissionId: admission.id, enteredById: req.user!.sub, abnormal } });
  await audit(req, "IPD_VITALS_RECORDED", "VitalEntry", vital.id);
  res.status(201).json({ success: true, data: { vital } });
}));

router.post("/ipd/admissions/:id/intake-output", authenticate, requireRole(...nursingRoles), reverifyRole(...nursingRoles), wrap(async (req, res) => {
  const body = z.object({ type: z.nativeEnum(InputOutputType), volumeMl: z.number().int().min(1).max(100_000), route: z.string().trim().max(80).optional(), description: z.string().trim().min(2).max(250) }).parse(req.body);
  const admission = await prisma.admission.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
  if (!admission) throw new AppError(404, "ADMISSION_NOT_FOUND", "Admission not found.");
  assertOpen(admission);
  const entry = await prisma.inputOutputEntry.create({ data: { ...body, tenantId: req.tenantId!, admissionId: admission.id, recordedById: req.user!.sub } });
  await audit(req, "IPD_INTAKE_OUTPUT_RECORDED", "InputOutputEntry", entry.id);
  res.status(201).json({ success: true, data: { entry } });
}));

router.post("/ipd/admissions/:id/medications", authenticate, requireRole(Role.ADMIN, Role.DOCTOR), reverifyRole(Role.ADMIN, Role.DOCTOR), wrap(async (req, res) => {
  const body = z.object({ medication: z.string().trim().min(2).max(160), dose: z.string().trim().min(1).max(80), route: z.string().trim().min(2).max(80), frequency: z.string().trim().min(2).max(100), nextDueAt: z.string().datetime().optional() }).parse(req.body);
  const admission = await prisma.admission.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
  if (!admission) throw new AppError(404, "ADMISSION_NOT_FOUND", "Admission not found.");
  assertOpen(admission);
  const order = await prisma.inpatientMedicationOrder.create({ data: { ...body, nextDueAt: body.nextDueAt ? new Date(body.nextDueAt) : null, tenantId: req.tenantId!, admissionId: admission.id, prescribedById: req.user!.sub } });
  await audit(req, "IPD_MEDICATION_ORDERED", "InpatientMedicationOrder", order.id);
  res.status(201).json({ success: true, data: { order } });
}));

router.post("/ipd/admissions/:id/mar", authenticate, requireRole(...nursingRoles), reverifyRole(...nursingRoles), wrap(async (req, res) => {
  const body = z.object({ medicationOrderId: z.string().min(1), result: z.nativeEnum(MedicationAdministrationResult), reason: z.string().trim().min(2).max(300).optional(), notes: z.string().trim().max(500).optional() }).refine((value) => value.result === MedicationAdministrationResult.GIVEN || Boolean(value.reason), "A reason is required when a dose is not given.").parse(req.body);
  const [admission, order] = await Promise.all([
    prisma.admission.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } }),
    prisma.inpatientMedicationOrder.findFirst({ where: { id: body.medicationOrderId, admissionId: req.params.id, tenantId: req.tenantId!, isActive: true } }),
  ]);
  if (!admission) throw new AppError(404, "ADMISSION_NOT_FOUND", "Admission not found.");
  assertOpen(admission);
  if (!order) throw new AppError(404, "MEDICATION_ORDER_NOT_FOUND", "Active medication order not found.");
  const administration = await prisma.medicationAdministration.create({ data: { ...body, tenantId: req.tenantId!, admissionId: admission.id, administeredById: req.user!.sub } });
  await audit(req, "IPD_MEDICATION_ADMINISTERED", "MedicationAdministration", administration.id);
  res.status(201).json({ success: true, data: { administration } });
}));

router.post("/ipd/admissions/:id/progress-notes", authenticate, requireRole(...careRoles), reverifyRole(...careRoles), wrap(async (req, res) => {
  const body = z.object({ expectedVersion: z.number().int().nonnegative(), content: z.string().trim().min(3).max(5000) }).parse(req.body);
  const note = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Admission" WHERE "id" = ${req.params.id} AND "tenantId" = ${req.tenantId!} FOR UPDATE`;
    const admission = await tx.admission.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
    if (!admission) throw new AppError(404, "ADMISSION_NOT_FOUND", "Admission not found.");
    assertOpen(admission);
    if (admission.progressVersion !== body.expectedVersion) throw new AppError(409, "PROGRESS_NOTE_CONFLICT", "Another clinician saved a newer note. Refresh the history before adding yours.");
    const version = admission.progressVersion + 1;
    const created = await tx.progressNote.create({ data: { tenantId: req.tenantId!, admissionId: admission.id, authorId: req.user!.sub, version, content: body.content } });
    await tx.admission.update({ where: { id: admission.id }, data: { progressVersion: version } });
    return created;
  });
  await audit(req, "IPD_PROGRESS_NOTE_APPENDED", "ProgressNote", note.id);
  res.status(201).json({ success: true, data: { note } });
}));

router.post("/ipd/admissions/:id/discharge", authenticate, requireRole(...admissionRoles), reverifyRole(...admissionRoles), wrap(async (req, res) => {
  const body = z.object({
    course: z.string().trim().min(10).max(5000),
    medications: z.array(z.object({ medication: z.string().trim().min(1).max(160), dose: z.string().trim().max(80), route: z.string().trim().max(80), frequency: z.string().trim().max(100), decision: z.enum(["CONTINUE", "CHANGE", "STOP"]), instructions: z.string().trim().max(300).optional() })).max(50),
    acknowledgePendingBill: z.boolean().default(false),
    followUp: z.object({ doctorId: z.string().min(1), date: dateSchema, startTime: timeSchema, reason: z.string().trim().min(3).max(200) }).optional(),
  }).parse(req.body);
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Admission" WHERE "id" = ${req.params.id} AND "tenantId" = ${req.tenantId!} FOR UPDATE`;
    const admission = await tx.admission.findFirst({ where: { id: req.params.id, tenantId: req.tenantId!, status: AdmissionStatus.ADMITTED }, include: { invoice: { include: { payments: { select: { amountPaise: true } } } }, bed: true } });
    if (!admission?.invoice) throw new AppError(404, "ACTIVE_ADMISSION_NOT_FOUND", "Active admission not found.");
    const paidPaise = admission.invoice.payments.reduce((sum, payment) => sum + payment.amountPaise, 0);
    const balancePaise = Math.max(0, admission.invoice.totalPaise - paidPaise);
    if (balancePaise > 0 && !body.acknowledgePendingBill) throw new AppError(409, "PENDING_BILL_ACK_REQUIRED", `Outstanding balance is ₹${(balancePaise / 100).toFixed(2)}. Acknowledge the pending bill to complete discharge.`);
    let followUpAppointmentId: string | null = null;
    if (body.followUp) {
      const slotDate = new Date(`${body.followUp.date}T00:00:00.000Z`);
      const doctor = await tx.doctorProfile.findFirst({ where: { id: body.followUp.doctorId, tenantId: req.tenantId!, isBookable: true, user: { is: { status: UserStatus.ACTIVE, roles: { has: Role.DOCTOR } } } }, include: { schedules: { where: { isActive: true } } } });
      if (!doctor) throw new AppError(404, "DOCTOR_NOT_FOUND", "Follow-up doctor is not available for booking.");
      const endTime = clock(minutes(body.followUp.startTime) + doctor.consultationMinutes);
      const weekday = slotDate.getUTCDay();
      if (!doctor.schedules.some((schedule) => schedule.weekday === weekday && minutes(body.followUp!.startTime) >= minutes(schedule.startTime) && minutes(endTime) <= minutes(schedule.endTime))) throw new AppError(422, "FOLLOW_UP_OUTSIDE_SCHEDULE", "Choose a follow-up time inside the doctor's active schedule.");
      await tx.$queryRaw`SELECT "id" FROM "DoctorProfile" WHERE "id" = ${doctor.id} FOR UPDATE`;
      const conflict = await tx.appointment.findFirst({ where: { tenantId: req.tenantId!, doctorId: doctor.id, scheduledFor: slotDate, startTime: { lt: endTime }, endTime: { gt: body.followUp.startTime }, cancelledAt: null, status: { notIn: [AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW] } }, select: { id: true } });
      if (conflict) throw new AppError(409, "FOLLOW_UP_SLOT_TAKEN", "That follow-up time is no longer available.");
      const appointment = await tx.appointment.create({ data: { tenantId: req.tenantId!, patientId: admission.patientId, doctorId: doctor.id, scheduledFor: slotDate, startTime: body.followUp.startTime, endTime, reason: body.followUp.reason } });
      followUpAppointmentId = appointment.id;
    }
    const now = new Date();
    const medicationText = body.medications.length ? body.medications.map((item) => `${item.decision}: ${item.medication} ${item.dose} ${item.route} ${item.frequency}${item.instructions ? ` (${item.instructions})` : ""}`).join("; ") : "No discharge medications prescribed";
    const summary = `Admission ${admission.admissionNumber}. Admitted ${admission.admittedAt.toISOString()}; discharged ${now.toISOString()}. Diagnosis: ${admission.diagnosis}. Hospital course: ${body.course}. Medication reconciliation: ${medicationText}.${body.followUp ? ` Follow-up booked for ${body.followUp.date} at ${body.followUp.startTime}.` : " No follow-up appointment booked."}`;
    const updated = await tx.admission.update({ where: { id: admission.id }, data: { status: AdmissionStatus.DISCHARGED, dischargedAt: now, dischargeSummary: summary, dischargeMedications: body.medications, pendingBillAcknowledged: balancePaise > 0 && body.acknowledgePendingBill, followUpAppointmentId } });
    await tx.bed.update({ where: { id: admission.bedId }, data: { status: BedStatus.CLEANING } });
    await tx.clinicalRecord.create({ data: { patientId: admission.patientId, type: "ADMISSION", title: `Discharge ${admission.admissionNumber}`, summary, status: "DISCHARGED", occurredAt: now } });
    return { admission: updated, balancePaise, followUpAppointmentId };
  });
  await audit(req, "IPD_ADMISSION_DISCHARGED", "Admission", result.admission.id);
  res.json({ success: true, data: result });
}));

router.get("/ipd/theatres", authenticate, requireRole(...readRoles), reverifyRole(...readRoles), wrap(async (req, res) => {
  const theatres = await prisma.theatre.findMany({ where: { tenantId: req.tenantId!, isActive: true }, orderBy: { name: "asc" } });
  res.json({ success: true, data: { theatres } });
}));

router.post("/ipd/theatres", authenticate, requireRole(...wardRoles), reverifyRole(...wardRoles), wrap(async (req, res) => {
  const body = z.object({ code: z.string().trim().min(1).max(20), name: z.string().trim().min(2).max(100) }).parse(req.body);
  const theatre = await prisma.theatre.create({ data: { ...body, tenantId: req.tenantId! } });
  await audit(req, "OT_THEATRE_CREATED", "Theatre", theatre.id);
  res.status(201).json({ success: true, data: { theatre } });
}));

router.get("/ipd/procedure-templates", authenticate, requireRole(...readRoles), reverifyRole(...readRoles), wrap(async (req, res) => {
  const templates = await prisma.procedureTemplate.findMany({ where: { tenantId: req.tenantId!, isActive: true }, orderBy: { name: "asc" } });
  res.json({ success: true, data: { templates } });
}));

router.post("/ipd/procedure-templates", authenticate, requireRole(...wardRoles), reverifyRole(...wardRoles), wrap(async (req, res) => {
  const body = z.object({ name: z.string().trim().min(2).max(100), procedureName: z.string().trim().min(2).max(160), operativeTemplate: z.string().trim().min(10).max(5000), anaesthesiaTemplate: z.string().trim().min(10).max(5000) }).parse(req.body);
  const template = await prisma.procedureTemplate.create({ data: { ...body, tenantId: req.tenantId! } });
  await audit(req, "OT_PROCEDURE_TEMPLATE_CREATED", "ProcedureTemplate", template.id);
  res.status(201).json({ success: true, data: { template } });
}));

router.get("/ipd/ot/cases", authenticate, requireRole(...otRoles), reverifyRole(...otRoles), wrap(async (req, res) => {
  const includeCancelled = req.query.includeCancelled === "true";
  const cases = await prisma.oTCase.findMany({
    where: { tenantId: req.tenantId!, ...(!includeCancelled && { status: { not: OTCaseStatus.CANCELLED } }) },
    include: { theatre: true, patient: { select: { mrn: true, user: { select: { name: true } } } }, surgeon: { select: { user: { select: { name: true } } } }, anaesthetist: { select: { user: { select: { name: true } } } }, procedureTemplate: true, checklistItems: { orderBy: [{ phase: "asc" }, { key: "asc" }] }, operationNote: true },
    orderBy: { scheduledStart: "asc" }, take: 300,
  });
  res.json({ success: true, data: { cases } });
}));

router.post("/ipd/ot/cases", authenticate, requireRole(...otRoles), reverifyRole(...otRoles), wrap(async (req, res) => {
  const body = z.object({ theatreId: z.string().min(1), patientId: z.string().min(1), surgeonId: z.string().min(1), anaesthetistId: z.string().min(1), procedureTemplateId: z.string().optional(), procedureName: z.string().trim().min(2).max(160), scheduledStart: z.string().datetime(), scheduledEnd: z.string().datetime() }).refine((value) => new Date(value.scheduledStart) < new Date(value.scheduledEnd), "End time must be after start time.").refine((value) => value.surgeonId !== value.anaesthetistId, "Surgeon and anaesthetist must be different clinicians.").parse(req.body);
  const created = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Theatre" WHERE "id" = ${body.theatreId} AND "tenantId" = ${req.tenantId!} FOR UPDATE`;
    const clinicianIds = [body.surgeonId, body.anaesthetistId].sort();
    await tx.$queryRaw`SELECT "id" FROM "DoctorProfile" WHERE "tenantId" = ${req.tenantId!} AND "id" IN (${clinicianIds[0]}, ${clinicianIds[1]}) ORDER BY "id" FOR UPDATE`;
    const [theatre, patient, doctors, template] = await Promise.all([
      tx.theatre.findFirst({ where: { id: body.theatreId, tenantId: req.tenantId!, isActive: true }, select: { id: true } }),
      tx.patient.findFirst({ where: { id: body.patientId, tenantId: req.tenantId! }, select: { id: true } }),
      tx.doctorProfile.findMany({ where: { id: { in: clinicianIds }, tenantId: req.tenantId!, user: { is: { status: UserStatus.ACTIVE, roles: { has: Role.DOCTOR } } } }, select: { id: true } }),
      body.procedureTemplateId ? tx.procedureTemplate.findFirst({ where: { id: body.procedureTemplateId, tenantId: req.tenantId!, isActive: true }, select: { id: true, procedureName: true } }) : Promise.resolve(null),
    ]);
    if (!theatre) throw new AppError(404, "THEATRE_NOT_FOUND", "Theatre not found.");
    if (!patient) throw new AppError(404, "PATIENT_NOT_FOUND", "Patient not found.");
    if (doctors.length !== 2) throw new AppError(404, "OT_CLINICIAN_NOT_FOUND", "Surgeon and anaesthetist must be active doctors.");
    if (body.procedureTemplateId && !template) throw new AppError(404, "PROCEDURE_TEMPLATE_NOT_FOUND", "Procedure template not found.");
    const conflict = await tx.oTCase.findFirst({ where: { tenantId: req.tenantId!, status: { notIn: [OTCaseStatus.CANCELLED, OTCaseStatus.COMPLETED] }, scheduledStart: { lt: new Date(body.scheduledEnd) }, scheduledEnd: { gt: new Date(body.scheduledStart) }, OR: [{ theatreId: theatre.id }, { surgeonId: body.surgeonId }, { anaesthetistId: body.anaesthetistId }] }, select: { id: true, theatreId: true, surgeonId: true, anaesthetistId: true } });
    if (conflict) {
      const resource = conflict.theatreId === theatre.id ? "theatre" : conflict.surgeonId === body.surgeonId ? "surgeon" : "anaesthetist";
      throw new AppError(409, "OT_SCHEDULE_CONFLICT", `The selected ${resource} already has an overlapping case.`);
    }
    const otCase = await tx.oTCase.create({ data: { tenantId: req.tenantId!, theatreId: theatre.id, patientId: patient.id, surgeonId: body.surgeonId, anaesthetistId: body.anaesthetistId, procedureTemplateId: template?.id ?? null, scheduledById: req.user!.sub, procedureName: body.procedureName, scheduledStart: new Date(body.scheduledStart), scheduledEnd: new Date(body.scheduledEnd), checklistItems: { create: checklistSeed } }, include: { checklistItems: true } });
    return otCase;
  });
  await audit(req, "OT_CASE_SCHEDULED", "OTCase", created.id);
  res.status(201).json({ success: true, data: { otCase: created } });
}));

router.patch("/ipd/ot/cases/:id/checklist", authenticate, requireRole(...otRoles), reverifyRole(...otRoles), wrap(async (req, res) => {
  const body = z.object({ key: z.string().min(1), checked: z.boolean() }).parse(req.body);
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "OTCase" WHERE "id" = ${req.params.id} AND "tenantId" = ${req.tenantId!} FOR UPDATE`;
    const otCase = await tx.oTCase.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! }, select: { id: true, status: true } });
    if (!otCase) throw new AppError(404, "OT_CASE_NOT_FOUND", "OT case not found.");
    if (otCase.status === OTCaseStatus.COMPLETED || otCase.status === OTCaseStatus.CANCELLED) throw new AppError(409, "OT_CASE_CLOSED", "Checklist is closed for this case.");
    const item = await tx.surgicalChecklistItem.findFirst({ where: { otCaseId: otCase.id, key: body.key } });
    if (!item) throw new AppError(404, "CHECKLIST_ITEM_NOT_FOUND", "Checklist item not found.");
    return tx.surgicalChecklistItem.update({ where: { id: item.id }, data: { checked: body.checked, checkedById: body.checked ? req.user!.sub : null, checkedAt: body.checked ? new Date() : null } });
  });
  await audit(req, "OT_SAFETY_CHECKLIST_UPDATED", "SurgicalChecklistItem", result.id);
  res.json({ success: true, data: { item: result } });
}));

router.patch("/ipd/ot/cases/:id/status", authenticate, requireRole(...otRoles), reverifyRole(...otRoles), wrap(async (req, res) => {
  const { status } = z.object({ status: z.nativeEnum(OTCaseStatus) }).parse(req.body);
  const updated = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "OTCase" WHERE "id" = ${req.params.id} AND "tenantId" = ${req.tenantId!} FOR UPDATE`;
    const otCase = await tx.oTCase.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! }, include: { checklistItems: true, operationNote: true } });
    if (!otCase) throw new AppError(404, "OT_CASE_NOT_FOUND", "OT case not found.");
    if (otCase.status === OTCaseStatus.COMPLETED || otCase.status === OTCaseStatus.CANCELLED) throw new AppError(409, "OT_CASE_CLOSED", "This OT case is already closed.");
    if (status === OTCaseStatus.IN_PROGRESS) {
      const preOp = otCase.checklistItems.filter((item) => item.phase !== ChecklistPhase.SIGN_OUT);
      if (!preOp.length || preOp.some((item) => !item.checked)) throw new AppError(409, "WHO_CHECKLIST_INCOMPLETE", "Complete every WHO sign-in and time-out item before starting surgery.");
    }
    if (status === OTCaseStatus.COMPLETED) {
      if (!otCase.operationNote) throw new AppError(409, "OPERATION_NOTE_REQUIRED", "Capture operative and anaesthesia notes before completing the case.");
      const signOut = otCase.checklistItems.filter((item) => item.phase === ChecklistPhase.SIGN_OUT);
      if (!signOut.length || signOut.some((item) => !item.checked)) throw new AppError(409, "WHO_SIGN_OUT_INCOMPLETE", "Complete every WHO sign-out item before closing the case.");
    }
    if (status === OTCaseStatus.SCHEDULED) throw new AppError(422, "INVALID_OT_TRANSITION", "A case cannot be moved back to scheduled.");
    return tx.oTCase.update({ where: { id: otCase.id }, data: { status } });
  });
  await audit(req, `OT_CASE_${status}`, "OTCase", updated.id);
  res.json({ success: true, data: { otCase: updated } });
}));

router.post("/ipd/ot/cases/:id/notes", authenticate, requireRole(Role.ADMIN, Role.DOCTOR), reverifyRole(Role.ADMIN, Role.DOCTOR), wrap(async (req, res) => {
  const body = z.object({ procedureTemplateId: z.string().optional(), operativeNote: z.string().trim().min(10).max(10000), anaesthesiaNote: z.string().trim().min(10).max(10000) }).parse(req.body);
  const note = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "OTCase" WHERE "id" = ${req.params.id} AND "tenantId" = ${req.tenantId!} FOR UPDATE`;
    const otCase = await tx.oTCase.findFirst({ where: { id: req.params.id, tenantId: req.tenantId!, status: OTCaseStatus.IN_PROGRESS }, select: { id: true, surgeonId: true, anaesthetistId: true } });
    if (!otCase) throw new AppError(404, "ACTIVE_OT_CASE_NOT_FOUND", "In-progress OT case not found.");
    if (!req.user!.roles.includes(Role.ADMIN)) {
      const doctor = await tx.doctorProfile.findFirst({ where: { tenantId: req.tenantId!, userId: req.user!.sub }, select: { id: true } });
      if (!doctor || (doctor.id !== otCase.surgeonId && doctor.id !== otCase.anaesthetistId)) throw new AppError(403, "FORBIDDEN", "Only the assigned surgeon or anaesthetist can capture this note.");
    }
    if (body.procedureTemplateId && !await tx.procedureTemplate.findFirst({ where: { id: body.procedureTemplateId, tenantId: req.tenantId!, isActive: true }, select: { id: true } })) throw new AppError(404, "PROCEDURE_TEMPLATE_NOT_FOUND", "Procedure template not found.");
    return tx.operationNote.create({ data: { otCaseId: otCase.id, procedureTemplateId: body.procedureTemplateId ?? null, operativeNote: body.operativeNote, anaesthesiaNote: body.anaesthesiaNote } });
  });
  await audit(req, "OT_OPERATION_NOTE_CAPTURED", "OperationNote", note.id);
  res.status(201).json({ success: true, data: { note } });
}));

export default router;