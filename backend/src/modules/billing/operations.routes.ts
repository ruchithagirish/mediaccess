import crypto from "crypto";
import Razorpay from "razorpay";
import { AppointmentStatus, DiscountStatus, InvoiceStatus, PaymentAttemptStatus, PaymentMode, Role, TaxTreatment, UserStatus } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middleware/auth";
import { reverifyRole, requireRole } from "../../middleware/rbac";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../lib/errors";
import { wrap } from "../../lib/async";
import { audit } from "../../middleware/audit";
import { deliverPaymentReceipts } from "./receipts";

const router = Router();
const billingRoles = [Role.ADMIN, Role.ACCOUNTANT, Role.RECEPTION];
const invoiceRead = { patient: { select: { id: true, mrn: true, user: { select: { name: true, email: true, phone: true } } } } };

function flattenBillingPatient<T extends { patient: { id: string; mrn: string; user: { name: string; email: string; phone: string | null } } }>(invoice: T) {
  const { user, ...patient } = invoice.patient;
  return { ...invoice, patient: { ...patient, name: user.name, email: user.email, phone: user.phone } };
}

const rupees = z.string().regex(/^\d{1,7}(?:\.\d{1,2})?$/, "Enter an amount with up to two decimal places.").transform((amount) => {
  const [whole, fraction = ""] = amount.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
});
const taxRate = z.number().int().refine((value) => [0, 500, 1200, 1800, 2800].includes(value), "Choose a supported GST rate.");
const serviceShape = z.object({
  code: z.string().trim().toUpperCase().min(2).max(30).regex(/^[A-Z0-9_-]+$/),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional(),
  category: z.enum(["SERVICE", "PROCEDURE"]),
  hsnSacCode: z.string().trim().regex(/^\d{4,8}$/),
  unitPriceRupees: rupees,
  taxTreatment: z.nativeEnum(TaxTreatment),
  gstRateBps: taxRate,
  isActive: z.boolean().optional(),
});
const serviceSchema = serviceShape.refine((value) => value.taxTreatment === TaxTreatment.TAXABLE || value.gstRateBps === 0, "Exempt items must have a zero GST rate.");
const servicePatchSchema = serviceShape.partial().refine((value) => value.taxTreatment !== TaxTreatment.EXEMPT || value.gstRateBps === undefined || value.gstRateBps === 0, "Exempt items must have a zero GST rate.");

const invoiceSchema = z.object({
  appointmentId: z.string().min(1),
  counterId: z.string().optional(),
  placeOfSupplyStateCode: z.string().regex(/^(?:0[1-9]|[1-2][0-9]|3[0-8])$/).optional(),
  discountPercentBps: z.number().int().min(0).max(10000).default(0),
  discountReason: z.string().trim().max(300).optional(),
  items: z.array(z.object({ serviceItemId: z.string().min(1), quantity: z.number().int().min(1).max(100) })).min(1).max(30),
});
const paymentSchema = z.object({
  counterId: z.string().optional(),
  payments: z.array(z.object({
    mode: z.enum(["CASH", "CARD", "UPI", "BANK_TRANSFER", "INSURANCE"]),
    amountRupees: rupees,
    reference: z.string().trim().max(100).optional(),
  })).min(1).max(5),
});
const dateQuery = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}).optional();

function assertSameStateTax(stateCode: string, supplyStateCode: string, taxAmount: number) {
  if (stateCode === supplyStateCode) {
    const cgstPaise = Math.floor(taxAmount / 2);
    return { cgstPaise, sgstPaise: taxAmount - cgstPaise, igstPaise: 0 };
  }
  return { cgstPaise: 0, sgstPaise: 0, igstPaise: taxAmount };
}

function localMidnight(date: string, timeZone: string) {
  const [year, month, day] = date.split("-").map(Number);
  let timestamp = Date.UTC(year, month - 1, day);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date(timestamp));
    const value = (type: string) => Number(parts.find((part) => part.type === type)!.value);
    const represented = Date.UTC(value("year"), value("month") - 1, value("day"), value("hour"), value("minute"), value("second"));
    timestamp -= represented - timestamp;
  }
  return new Date(timestamp);
}

function dateInTimezone(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const part = (type: string) => parts.find((item) => item.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function getDateRange(date: string, timeZone: string) {
  const nextDate = new Date(`${date}T00:00:00.000Z`);
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  return { gte: localMidnight(date, timeZone), lt: localMidnight(nextDate.toISOString().slice(0, 10), timeZone) };
}

function invoiceBalance(invoice: { totalPaise: number; payments: { amountPaise: number }[]; razorpayOrders?: { amountPaise: number; status: PaymentAttemptStatus }[] }, reserveOnline = false) {
  const paid = invoice.payments.reduce((sum, payment) => sum + payment.amountPaise, 0);
  const reserved = reserveOnline ? (invoice.razorpayOrders ?? []).filter((order) => order.status === PaymentAttemptStatus.CREATED).reduce((sum, order) => sum + order.amountPaise, 0) : 0;
  return Math.max(0, invoice.totalPaise - paid - reserved);
}

const razorpayWebhook = wrap(async (req, res) => {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const rawBody = (req as typeof req & { rawBody?: Buffer }).rawBody;
  const signature = req.get("x-razorpay-signature");
  if (!webhookSecret || !rawBody || !signature) throw new AppError(400, "WEBHOOK_SIGNATURE_REQUIRED", "Razorpay webhook signature is missing.");
  const expected = crypto.createHmac("sha256", webhookSecret).update(rawBody).digest();
  const received = Buffer.from(signature, "hex");
  if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) throw new AppError(400, "INVALID_WEBHOOK_SIGNATURE", "Razorpay webhook signature is invalid.");

  const payload = z.object({
    event: z.string(),
    payload: z.object({ payment: z.object({ entity: z.object({ id: z.string(), order_id: z.string(), amount: z.number().int(), currency: z.string() }) }) }).optional(),
  }).parse(req.body);
  if (!payload.payload || !["payment.captured", "payment.failed"].includes(payload.event)) {
    res.json({ success: true, data: { received: true, ignored: true } });
    return;
  }
  const paymentEntity = payload.payload.payment.entity;
  const attempt = await prisma.razorpayOrder.findUnique({ where: { providerOrderId: paymentEntity.order_id } });
  if (!attempt || attempt.tenantId !== req.tenantId) throw new AppError(404, "RAZORPAY_ORDER_NOT_FOUND", "Online order not found.");
  if (paymentEntity.currency !== "INR" || paymentEntity.amount !== attempt.amountPaise) throw new AppError(400, "RAZORPAY_AMOUNT_MISMATCH", "Captured amount does not match the online order.");
  if (payload.event === "payment.failed") {
    if (attempt.status !== PaymentAttemptStatus.PAID) await prisma.razorpayOrder.update({ where: { id: attempt.id }, data: { status: PaymentAttemptStatus.FAILED, providerPaymentId: paymentEntity.id } });
    res.json({ success: true, data: { received: true } });
    return;
  }
  if (attempt.status === PaymentAttemptStatus.PAID) {
    res.json({ success: true, data: { received: true, idempotentReplay: true } });
    return;
  }
  const recorder = await prisma.user.findFirst({ where: { tenantId: attempt.tenantId, status: UserStatus.ACTIVE, roles: { hasSome: [Role.ADMIN, Role.ACCOUNTANT, Role.RECEPTION] } }, select: { id: true } });
  if (!recorder) throw new AppError(409, "BILLING_USER_REQUIRED", "No active billing user is available to record this payment.");
  const payment = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "RazorpayOrder" WHERE "id" = ${attempt.id} FOR UPDATE`;
    const current = await tx.razorpayOrder.findUnique({ where: { id: attempt.id } });
    if (!current) throw new AppError(404, "RAZORPAY_ORDER_NOT_FOUND", "Online order not found.");
    if (current.status === PaymentAttemptStatus.PAID) return tx.payment.findUnique({ where: { attemptId: current.id } });
    await tx.razorpayOrder.update({ where: { id: current.id }, data: { status: PaymentAttemptStatus.PAID, providerPaymentId: paymentEntity.id } });
    return tx.payment.create({
      data: {
        tenantId: current.tenantId, invoiceId: current.invoiceId, recordedById: recorder.id, attemptId: current.id,
        idempotencyKey: `razorpay:${paymentEntity.id}`, mode: PaymentMode.RAZORPAY,
        amountPaise: current.amountPaise, reference: paymentEntity.id,
      },
    });
  });
  if (payment) void deliverPaymentReceipts(payment.id).catch((error) => console.error("payment receipt delivery failed", error));
  res.json({ success: true, data: { received: true } });
});

router.post("/billing/webhooks/razorpay", razorpayWebhook);
router.use("/billing", authenticate, requireRole(...billingRoles), reverifyRole(...billingRoles));

router.get("/billing/services", wrap(async (req, res) => {
  const services = await prisma.serviceItem.findMany({ where: { tenantId: req.tenantId!, isActive: true }, orderBy: [{ category: "asc" }, { name: "asc" }] });
  res.json({ success: true, data: { services } });
}));

router.post("/billing/services", requireRole(Role.ADMIN, Role.ACCOUNTANT), reverifyRole(Role.ADMIN, Role.ACCOUNTANT), wrap(async (req, res) => {
  const body = serviceSchema.parse(req.body);
  const { unitPriceRupees, ...serviceData } = body;
  const service = await prisma.serviceItem.create({
    data: {
      ...serviceData,
      tenantId: req.tenantId!,
      unitPricePaise: unitPriceRupees,
      description: body.description || null,
    },
  });
  await audit(req, "BILLING_SERVICE_CREATED", "ServiceItem", service.id);
  res.status(201).json({ success: true, data: { service } });
}));

router.patch("/billing/services/:id", requireRole(Role.ADMIN, Role.ACCOUNTANT), reverifyRole(Role.ADMIN, Role.ACCOUNTANT), wrap(async (req, res) => {
  const body = servicePatchSchema.parse(req.body);
  const { unitPriceRupees, ...serviceData } = body;
  const service = await prisma.serviceItem.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! }, select: { id: true } });
  if (!service) throw new AppError(404, "SERVICE_NOT_FOUND", "Service item not found.");
  const updated = await prisma.serviceItem.update({
    where: { id: service.id },
    data: {
      ...serviceData,
      ...(unitPriceRupees !== undefined ? { unitPricePaise: unitPriceRupees } : {}),
      ...(body.description !== undefined ? { description: body.description || null } : {}),
    },
  });
  await audit(req, "BILLING_SERVICE_UPDATED", "ServiceItem", updated.id);
  res.json({ success: true, data: { service: updated } });
}));

router.get("/billing/counters", wrap(async (req, res) => {
  let counters = await prisma.billingCounter.findMany({ where: { tenantId: req.tenantId!, isActive: true }, orderBy: { name: "asc" } });
  if (!counters.length) {
    try {
      const counter = await prisma.billingCounter.create({ data: { tenantId: req.tenantId!, code: "MAIN", name: "Main counter" } });
      counters = [counter];
    } catch {
      counters = await prisma.billingCounter.findMany({ where: { tenantId: req.tenantId!, isActive: true }, orderBy: { name: "asc" } });
    }
  }
  res.json({ success: true, data: { counters } });
}));

router.post("/billing/counters", requireRole(Role.ADMIN, Role.ACCOUNTANT), reverifyRole(Role.ADMIN, Role.ACCOUNTANT), wrap(async (req, res) => {
  const body = z.object({ code: z.string().trim().toUpperCase().min(2).max(20).regex(/^[A-Z0-9_-]+$/), name: z.string().trim().min(2).max(80) }).parse(req.body);
  const counter = await prisma.billingCounter.create({ data: { ...body, tenantId: req.tenantId! } });
  await audit(req, "BILLING_COUNTER_CREATED", "BillingCounter", counter.id);
  res.status(201).json({ success: true, data: { counter } });
}));

router.get("/billing/patients/search", wrap(async (req, res) => {
  const { q } = z.object({ q: z.string().trim().min(2).max(100) }).parse(req.query);
  const patients = await prisma.patient.findMany({
    where: {
      tenantId: req.tenantId!,
      OR: [
        { mrn: { contains: q, mode: "insensitive" } },
        { user: { is: { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }] } } },
      ],
    },
    select: { id: true, mrn: true, stateCode: true, user: { select: { name: true, phone: true } } },
    take: 15,
    orderBy: { createdAt: "desc" },
  });
  res.json({ success: true, data: { patients: patients.map(({ user, ...patient }) => ({ ...patient, name: user.name, phone: user.phone })) } });
}));

router.get("/billing/appointments", wrap(async (req, res) => {
  const { patientId } = z.object({ patientId: z.string().min(1) }).parse(req.query);
  const appointments = await prisma.appointment.findMany({
    where: { tenantId: req.tenantId!, patientId, cancelledAt: null, invoice: null, status: { notIn: [AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW] } },
    select: { id: true, scheduledFor: true, startTime: true, status: true, reason: true },
    orderBy: [{ scheduledFor: "desc" }, { startTime: "desc" }],
    take: 30,
  });
  res.json({ success: true, data: { appointments } });
}));

router.get("/billing/gst-settings", wrap(async (req, res) => {
  const tenant = await prisma.tenant.findUnique({ where: { id: req.tenantId! }, select: { name: true, legalName: true, gstin: true, stateCode: true, billingAddress: true, discountApprovalBps: true } });
  res.json({ success: true, data: { settings: tenant } });
}));

router.patch("/billing/gst-settings", requireRole(Role.ADMIN), reverifyRole(Role.ADMIN), wrap(async (req, res) => {
  const body = z.object({
    legalName: z.string().trim().max(160).optional(),
    gstin: z.string().trim().toUpperCase().regex(/^(?:[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z])?$/).optional(),
    stateCode: z.string().trim().regex(/^(?:0[1-9]|[1-2][0-9]|3[0-8])?$/).optional(),
    billingAddress: z.string().trim().max(500).optional(),
    discountApprovalBps: z.number().int().min(0).max(10000).optional(),
  }).parse(req.body);
  const settings = await prisma.tenant.update({ where: { id: req.tenantId! }, data: body });
  await audit(req, "BILLING_GST_SETTINGS_UPDATED", "Tenant", req.tenantId);
  res.json({ success: true, data: { settings } });
}));

router.get("/billing/pending-discounts", wrap(async (req, res) => {
  const requests = await prisma.discountRequest.findMany({
    where: { tenantId: req.tenantId!, status: DiscountStatus.PENDING },
    include: {
      invoice: { include: { patient: { select: { mrn: true, user: { select: { name: true } } } } } },
    },
    orderBy: { requestedAt: "asc" },
    take: 100,
  });
  res.json({ success: true, data: { requests } });
}));

router.post("/billing/discount-requests/:id/:decision", requireRole(Role.ADMIN), reverifyRole(Role.ADMIN), wrap(async (req, res) => {
  const decision = z.enum(["approve", "reject"]).parse(req.params.decision);
  const request = await prisma.discountRequest.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
  if (!request) throw new AppError(404, "DISCOUNT_REQUEST_NOT_FOUND", "Discount request not found.");
  if (request.status !== DiscountStatus.PENDING) throw new AppError(409, "DISCOUNT_ALREADY_DECIDED", "This discount request has already been decided.");
  await prisma.$transaction(async (tx) => {
    await tx.discountRequest.update({ where: { id: request.id }, data: { status: decision === "approve" ? DiscountStatus.APPROVED : DiscountStatus.REJECTED, approvedById: req.user!.sub, decidedAt: new Date() } });
    await tx.invoice.update({ where: { id: request.invoiceId }, data: { status: decision === "approve" ? InvoiceStatus.ISSUED : InvoiceStatus.VOID } });
  });
  await audit(req, `BILLING_DISCOUNT_${decision.toUpperCase()}`, "DiscountRequest", request.id);
  res.json({ success: true, data: { updated: true } });
}));

router.post("/billing/opd-invoices", wrap(async (req, res) => {
  const body = invoiceSchema.parse(req.body);
  const [appointment, tenant, services] = await Promise.all([
    prisma.appointment.findFirst({
      where: { id: body.appointmentId, tenantId: req.tenantId!, cancelledAt: null, status: { notIn: [AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW] } },
      select: { id: true, patientId: true, invoice: { select: { id: true } } },
    }),
    prisma.tenant.findUnique({ where: { id: req.tenantId! }, select: { stateCode: true, gstin: true, discountApprovalBps: true } }),
    prisma.serviceItem.findMany({ where: { tenantId: req.tenantId!, isActive: true, id: { in: body.items.map((item) => item.serviceItemId) } } }),
  ]);
  if (!appointment) throw new AppError(404, "APPOINTMENT_NOT_FOUND", "Appointment not found.");
  if (appointment.invoice) throw new AppError(409, "INVOICE_EXISTS", "This appointment already has an invoice.");
  if (!tenant) throw new AppError(404, "TENANT_NOT_FOUND", "Hospital settings were not found.");
  if (services.length !== new Set(body.items.map((item) => item.serviceItemId)).size) throw new AppError(422, "SERVICE_NOT_FOUND", "One or more selected services are unavailable.");

  const serviceById = new Map(services.map((service) => [service.id, service]));
  const patient = await prisma.patient.findFirst({ where: { id: appointment.patientId, tenantId: req.tenantId! }, select: { stateCode: true } });
  const placeOfSupply = body.placeOfSupplyStateCode ?? patient?.stateCode ?? tenant.stateCode;
  const subtotalPaise = body.items.reduce((sum, item) => sum + serviceById.get(item.serviceItemId)!.unitPricePaise * item.quantity, 0);
  if (!Number.isSafeInteger(subtotalPaise) || subtotalPaise > 2_000_000_000) throw new AppError(422, "INVOICE_TOTAL_TOO_LARGE", "The invoice total is too large.");
  if (body.discountPercentBps > 0 && !body.discountReason) throw new AppError(422, "DISCOUNT_REASON_REQUIRED", "Enter a reason for the discount.");
  const hasTaxableCharges = body.items.some(({ serviceItemId }) => serviceById.get(serviceItemId)!.taxTreatment === TaxTreatment.TAXABLE && serviceById.get(serviceItemId)!.gstRateBps > 0);
  if (hasTaxableCharges && (!tenant.gstin || !tenant.stateCode || !placeOfSupply)) {
    throw new AppError(422, "GST_CONFIGURATION_REQUIRED", "Set the hospital GSTIN and state code and the patient's place of supply before billing taxable services.");
  }

  const discountPaise = Math.round(subtotalPaise * body.discountPercentBps / 10000);
  let discountAllocated = 0;
  let taxPaise = 0;
  const invoiceLines = body.items.map((item, index) => {
    const service = serviceById.get(item.serviceItemId)!;
    const lineTotalPaise = service.unitPricePaise * item.quantity;
    const lineDiscount = index === body.items.length - 1
      ? discountPaise - discountAllocated
      : Math.floor(lineTotalPaise * body.discountPercentBps / 10000);
    discountAllocated += lineDiscount;
    const taxablePaise = lineTotalPaise - lineDiscount;
    const lineTaxPaise = service.taxTreatment === TaxTreatment.TAXABLE ? Math.round(taxablePaise * service.gstRateBps / 10000) : 0;
    taxPaise += lineTaxPaise;
    const split = tenant.stateCode && placeOfSupply ? assertSameStateTax(tenant.stateCode, placeOfSupply, lineTaxPaise) : { cgstPaise: 0, sgstPaise: 0, igstPaise: 0 };
    return {
      description: service.name,
      quantity: item.quantity,
      unitPricePaise: service.unitPricePaise,
      lineTotalPaise,
      serviceItemId: service.id,
      hsnSacCode: service.hsnSacCode,
      taxTreatment: service.taxTreatment,
      gstRateBps: service.gstRateBps,
      discountPaise: lineDiscount,
      taxablePaise,
      ...split,
    };
  });
  const totalPaise = subtotalPaise - discountPaise + taxPaise;
  const requiresApproval = body.discountPercentBps > (tenant.discountApprovalBps ?? 500) && !req.user!.roles.includes(Role.ADMIN);
  const approverId = requiresApproval ? null : req.user!.sub;

  const invoice = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Appointment" WHERE "id" = ${appointment.id} FOR UPDATE`;
    if (await tx.invoice.findUnique({ where: { appointmentId: appointment.id }, select: { id: true } })) throw new AppError(409, "INVOICE_EXISTS", "This appointment already has an invoice.");
    const sequence = ((await tx.invoice.aggregate({ where: { tenantId: req.tenantId! }, _max: { sequence: true } }))._max.sequence ?? 0) + 1;
    const year = new Date().getUTCFullYear();
    const invoiceNumber = `MA-INV-${year}-${String(sequence).padStart(6, "0")}`;
    return tx.invoice.create({
      data: {
        tenantId: req.tenantId!, patientId: appointment.patientId, appointmentId: appointment.id,
        treatmentId: null, invoiceNumber, sequence, subtotalPaise, discountPaise, taxPaise, totalPaise,
        discountPercentBps: body.discountPercentBps, placeOfSupplyStateCode: placeOfSupply,
        status: requiresApproval ? InvoiceStatus.DISCOUNT_PENDING : InvoiceStatus.ISSUED,
        lines: { create: invoiceLines },
        ...(body.discountPercentBps > 0 ? { discountRequest: { create: {
          tenantId: req.tenantId!, requestedById: req.user!.sub, approvedById: approverId,
          requestedPaise: discountPaise, reason: body.discountReason || "OPD discount", status: requiresApproval ? DiscountStatus.PENDING : DiscountStatus.APPROVED,
          decidedAt: requiresApproval ? null : new Date(),
        } } } : {}),
      },
      include: { ...invoiceRead, lines: true },
    });
  });
  await audit(req, "OPD_INVOICE_CREATED", "Invoice", invoice.id);
  res.status(201).json({ success: true, data: { invoice, requiresApproval } });
}));

router.get("/billing/invoices", wrap(async (req, res) => {
  const invoices = await prisma.invoice.findMany({
    where: { tenantId: req.tenantId!, status: { not: InvoiceStatus.VOID } },
    include: {
      ...invoiceRead,
      appointment: { select: {
        scheduledFor: true,
        doctor: { select: { user: { select: { name: true } }, specialties: { select: { specialty: { select: { name: true } } } } } },
      } },
      admission: { select: {
        admissionNumber: true,
        attendingDoctor: { select: { user: { select: { name: true } } } },
        bed: { select: { ward: { select: { name: true } } } },
      } },
      payments: { select: {
        id: true, mode: true, amountPaise: true, receivedAt: true, reference: true,
        counter: { select: { name: true } },
        receiptDeliveries: { select: { channel: true, status: true, lastError: true, sentAt: true } },
      } },
    },
    orderBy: { issuedAt: "desc" }, take: 300,
  });
  res.json({ success: true, data: { invoices: invoices.map((invoice) => flattenBillingPatient({
    ...invoice,
    paidPaise: invoice.payments.reduce((sum, payment) => sum + payment.amountPaise, 0),
    outstandingPaise: invoiceBalance(invoice),
  })) } });
}));

router.get("/billing/dashboard", wrap(async (req, res) => {
  const { date } = z.object({ date: dateQuery }).parse(req.query);
  const tenant = await prisma.tenant.findUnique({ where: { id: req.tenantId! }, select: { timezone: true } });
  const timeZone = tenant?.timezone ?? "Asia/Kolkata";
  const day = date ?? dateInTimezone(new Date(), timeZone);
  const range = getDateRange(day, timeZone);
  const [collected, modeSplit, paymentsByCounter, counters, receivableSummary, receivableIds, pendingDiscounts, reconciliations] = await Promise.all([
    prisma.payment.aggregate({ where: { tenantId: req.tenantId!, receivedAt: range }, _sum: { amountPaise: true }, _count: { id: true } }),
    prisma.payment.groupBy({ by: ["mode"], where: { tenantId: req.tenantId!, receivedAt: range }, _sum: { amountPaise: true } }),
    prisma.payment.groupBy({ by: ["counterId"], where: { tenantId: req.tenantId!, receivedAt: range }, _sum: { amountPaise: true }, _count: { id: true } }),
    prisma.billingCounter.findMany({ where: { tenantId: req.tenantId!, isActive: true }, orderBy: { name: "asc" } }),
    prisma.$queryRaw<Array<{ totalPaise: bigint; invoiceCount: bigint }>>`
      SELECT
        COALESCE(SUM(GREATEST(i."totalPaise" - COALESCE(p."paidPaise", 0), 0)), 0)::BIGINT AS "totalPaise",
        COUNT(*) FILTER (WHERE i."totalPaise" > COALESCE(p."paidPaise", 0))::BIGINT AS "invoiceCount"
      FROM "Invoice" i
      LEFT JOIN (
        SELECT "invoiceId", SUM("amountPaise") AS "paidPaise"
        FROM "Payment" WHERE "tenantId" = ${req.tenantId!}
        GROUP BY "invoiceId"
      ) p ON p."invoiceId" = i."id"
      WHERE i."tenantId" = ${req.tenantId!} AND i."status" = 'ISSUED'
    `,
    prisma.$queryRaw<Array<{ id: string }>>`
      SELECT i."id"
      FROM "Invoice" i
      LEFT JOIN (
        SELECT "invoiceId", SUM("amountPaise") AS "paidPaise"
        FROM "Payment" WHERE "tenantId" = ${req.tenantId!}
        GROUP BY "invoiceId"
      ) p ON p."invoiceId" = i."id"
      WHERE i."tenantId" = ${req.tenantId!} AND i."status" = 'ISSUED'
        AND i."totalPaise" > COALESCE(p."paidPaise", 0)
      ORDER BY i."issuedAt" DESC LIMIT 100
    `,
    prisma.discountRequest.count({ where: { tenantId: req.tenantId!, status: DiscountStatus.PENDING } }),
    prisma.counterReconciliation.findMany({ where: { tenantId: req.tenantId!, workDate: new Date(`${day}T00:00:00.000Z`) } }),
  ]);
  const receivableRecords = await prisma.invoice.findMany({
    where: { id: { in: receivableIds.map(({ id }) => id) } },
    include: { ...invoiceRead, payments: { select: { amountPaise: true } }, appointment: { select: { scheduledFor: true } } },
  });
  const receivablesById = new Map(receivableRecords.map((invoice) => [invoice.id, invoice]));
  const receivables = receivableIds.flatMap(({ id }) => {
    const invoice = receivablesById.get(id);
    if (!invoice) return [];
    const paidPaise = invoice.payments.reduce((sum, payment) => sum + payment.amountPaise, 0);
    return [flattenBillingPatient({ ...invoice, paidPaise, outstandingPaise: invoiceBalance(invoice) })];
  });
  const summary = receivableSummary[0];
  res.json({ success: true, data: {
    date: day,
    collectedPaise: collected._sum.amountPaise ?? 0,
    paymentCount: collected._count.id,
    outstandingPaise: Number(summary?.totalPaise ?? 0n),
    outstandingCount: Number(summary?.invoiceCount ?? 0n),
    pendingDiscounts,
    modeSplit: modeSplit.map(({ mode, _sum }) => ({ mode, amountPaise: _sum.amountPaise ?? 0 })),
    counters: counters.map((counter) => {
      const row = paymentsByCounter.find((item) => item.counterId === counter.id);
      const reconciliation = reconciliations.find((item) => item.counterId === counter.id);
      return {
        id: counter.id, name: counter.name, code: counter.code,
        amountPaise: row?._sum.amountPaise ?? 0, paymentCount: row?._count.id ?? 0,
        reconciliation: reconciliation ? { countedPaise: reconciliation.countedPaise, variancePaise: reconciliation.variancePaise, closedAt: reconciliation.closedAt, note: reconciliation.note } : null,
      };
    }),
    unassignedCounter: paymentsByCounter.find((item) => item.counterId === null)?._sum.amountPaise ?? 0,
    receivables,
  } });
}));

router.post("/billing/counters/:id/reconcile", requireRole(Role.ADMIN, Role.ACCOUNTANT), reverifyRole(Role.ADMIN, Role.ACCOUNTANT), wrap(async (req, res) => {
  const body = z.object({
    workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
      const parsed = new Date(`${value}T00:00:00.000Z`);
      return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
    }),
    countedRupees: rupees,
    note: z.string().trim().max(300).optional(),
  }).parse(req.body);
  const counter = await prisma.billingCounter.findFirst({ where: { id: req.params.id, tenantId: req.tenantId!, isActive: true }, select: { id: true } });
  if (!counter) throw new AppError(404, "COUNTER_NOT_FOUND", "Billing counter not found.");
  const tenant = await prisma.tenant.findUnique({ where: { id: req.tenantId! }, select: { timezone: true } });
  const range = getDateRange(body.workDate, tenant?.timezone ?? "Asia/Kolkata");
  const collected = await prisma.payment.aggregate({ where: { tenantId: req.tenantId!, counterId: counter.id, receivedAt: range }, _sum: { amountPaise: true } });
  const expectedPaise = collected._sum.amountPaise ?? 0;
  const reconciliation = await prisma.counterReconciliation.upsert({
    where: { tenantId_counterId_workDate: { tenantId: req.tenantId!, counterId: counter.id, workDate: new Date(`${body.workDate}T00:00:00.000Z`) } },
    create: {
      tenantId: req.tenantId!, counterId: counter.id, closedById: req.user!.sub,
      workDate: new Date(`${body.workDate}T00:00:00.000Z`), expectedPaise, countedPaise: body.countedRupees,
      variancePaise: body.countedRupees - expectedPaise, note: body.note || null,
    },
    update: {
      closedById: req.user!.sub, expectedPaise, countedPaise: body.countedRupees,
      variancePaise: body.countedRupees - expectedPaise, note: body.note || null, closedAt: new Date(),
    },
  });
  await audit(req, "BILLING_COUNTER_RECONCILED", "CounterReconciliation", reconciliation.id);
  res.json({ success: true, data: { reconciliation } });
}));

router.post("/invoices/:id/payments", authenticate, requireRole(...billingRoles), reverifyRole(...billingRoles), wrap(async (req, res) => {
  const body = paymentSchema.parse(req.body);
  const requestKey = req.get("Idempotency-Key")?.trim();
  if (!requestKey || requestKey.length > 100) throw new AppError(400, "IDEMPOTENCY_KEY_REQUIRED", "Provide an Idempotency-Key header for this payment capture.");
  const existing = await prisma.payment.findMany({ where: { tenantId: req.tenantId!, idempotencyKey: { startsWith: `${requestKey}:` } } });
  if (existing.length) {
    res.json({ success: true, data: { payments: existing, idempotentReplay: true } });
    return;
  }
  const created = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Invoice" WHERE "id" = ${req.params.id} AND "tenantId" = ${req.tenantId!} FOR UPDATE`;
    const invoice = await tx.invoice.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! }, include: { payments: { select: { amountPaise: true } }, razorpayOrders: { select: { amountPaise: true, status: true } } } });
    if (!invoice) throw new AppError(404, "INVOICE_NOT_FOUND", "Invoice not found.");
    if (invoice.status !== InvoiceStatus.ISSUED) throw new AppError(409, "INVOICE_NOT_PAYABLE", "This invoice is not available for payment.");
    const remaining = invoiceBalance(invoice, true);
    const amount = body.payments.reduce((sum, payment) => sum + payment.amountRupees, 0);
    if (amount <= 0 || amount > remaining) throw new AppError(422, "PAYMENT_AMOUNT_INVALID", "Payment total must be greater than zero and no more than the outstanding balance.");
    if (body.counterId && !await tx.billingCounter.findFirst({ where: { id: body.counterId, tenantId: req.tenantId!, isActive: true }, select: { id: true } })) {
      throw new AppError(404, "COUNTER_NOT_FOUND", "Billing counter not found.");
    }
    return Promise.all(body.payments.map((payment, index) => tx.payment.create({
      data: {
        tenantId: req.tenantId!, invoiceId: invoice.id, counterId: body.counterId ?? null, recordedById: req.user!.sub,
        idempotencyKey: `${requestKey}:${index}`, mode: payment.mode, amountPaise: payment.amountRupees,
        reference: payment.reference || null,
      },
    })));
  });
  await audit(req, "INVOICE_PAYMENT_CAPTURED", "Invoice", req.params.id);
  void Promise.all(created.map((payment) => deliverPaymentReceipts(payment.id)));
  res.status(201).json({ success: true, data: { payments: created } });
}));

router.post("/invoices/:id/razorpay-order", authenticate, requireRole(...billingRoles), reverifyRole(...billingRoles), wrap(async (req, res) => {
  const requestKey = req.get("Idempotency-Key")?.trim();
  if (!requestKey || requestKey.length > 100) throw new AppError(400, "IDEMPOTENCY_KEY_REQUIRED", "Provide an Idempotency-Key header to create an online order.");
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw new AppError(503, "RAZORPAY_NOT_CONFIGURED", "Online payments are not configured for this hospital.");
  const existing = await prisma.razorpayOrder.findUnique({ where: { tenantId_idempotencyKey: { tenantId: req.tenantId!, idempotencyKey: requestKey } } });
  if (existing) {
    if (existing.providerOrderId.startsWith("pending:")) throw new AppError(409, "RAZORPAY_ORDER_PENDING", "The online order is still being created. Retry shortly.");
    res.json({ success: true, data: { order: { id: existing.providerOrderId, amount: existing.amountPaise, currency: "INR" }, keyId, idempotentReplay: true } });
    return;
  }
  const invoice = await prisma.invoice.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! }, include: { payments: { select: { amountPaise: true } }, razorpayOrders: { select: { amountPaise: true, status: true } } } });
  if (!invoice) throw new AppError(404, "INVOICE_NOT_FOUND", "Invoice not found.");
  if (invoice.status !== InvoiceStatus.ISSUED) throw new AppError(409, "INVOICE_NOT_PAYABLE", "This invoice is not available for payment.");
  const amountPaise = invoiceBalance(invoice, true);
  if (amountPaise <= 0) throw new AppError(409, "INVOICE_PAID", "There is no outstanding balance.");
  const placeholder = `pending:${crypto.randomUUID()}`;
  const attempt = await prisma.razorpayOrder.create({ data: { tenantId: req.tenantId!, invoiceId: invoice.id, idempotencyKey: requestKey, providerOrderId: placeholder, amountPaise } });
  try {
    const order = await new Razorpay({ key_id: keyId, key_secret: keySecret }).orders.create({
      amount: amountPaise, currency: "INR", receipt: invoice.invoiceNumber,
      notes: { invoiceId: invoice.id, tenantId: req.tenantId! },
    });
    await prisma.razorpayOrder.update({ where: { id: attempt.id }, data: { providerOrderId: order.id } });
    res.status(201).json({ success: true, data: { order: { id: order.id, amount: order.amount, currency: order.currency }, keyId } });
  } catch (error) {
    await prisma.razorpayOrder.update({ where: { id: attempt.id }, data: { status: PaymentAttemptStatus.FAILED } });
    throw error;
  }
}));

router.post("/payments/:id/receipts/resend", authenticate, requireRole(...billingRoles), reverifyRole(...billingRoles), wrap(async (req, res) => {
  const payment = await prisma.payment.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! }, select: { id: true } });
  if (!payment) throw new AppError(404, "PAYMENT_NOT_FOUND", "Payment not found.");
  await deliverPaymentReceipts(payment.id);
  res.json({ success: true, data: { requested: true } });
}));

export default router;