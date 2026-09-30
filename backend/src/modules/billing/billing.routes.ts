import PDFDocument from "pdfkit";
import { AppointmentStatus, Prisma, Role } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middleware/auth";
import { reverifyRole, requireRole } from "../../middleware/rbac";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../lib/errors";
import { wrap } from "../../lib/async";
import { audit } from "../../middleware/audit";
import { notifyQueueChanged } from "../../lib/queue-events";

const router = Router();
const invoiceRoles = [Role.PATIENT, Role.DOCTOR, Role.RECEPTION, Role.ADMIN, Role.ACCOUNTANT];

const invoiceInclude = {
  patient: { select: { id: true, mrn: true, user: { select: { name: true, email: true, phone: true } } } },
  appointment: {
    select: {
      scheduledFor: true,
      startTime: true,
      doctor: { select: { id: true, user: { select: { name: true } } } },
    },
  },
  admission: { select: { admissionNumber: true, attendingDoctorId: true } },
  treatment: {
    select: {
      summary: true,
      completedAt: true,
      items: { select: { description: true, quantity: true, unitPricePaise: true }, orderBy: { id: "asc" } },
    },
  },
  tenant: { select: { name: true, legalName: true, gstin: true, stateCode: true, billingAddress: true } },
  lines: { orderBy: { id: "asc" } },
  payments: { select: { id: true, mode: true, amountPaise: true, reference: true, receivedAt: true }, orderBy: { receivedAt: "asc" } },
} satisfies Prisma.InvoiceInclude;

type InvoiceRecord = Prisma.InvoiceGetPayload<{ include: typeof invoiceInclude }>;

const serializeInvoice = (invoice: InvoiceRecord) => ({
  id: invoice.id,
  invoiceNumber: invoice.invoiceNumber,
  issuedAt: invoice.issuedAt,
  currency: invoice.currency,
  subtotalPaise: invoice.subtotalPaise,
  discountPaise: invoice.discountPaise,
  taxPaise: invoice.taxPaise,
  totalPaise: invoice.totalPaise,
  paidPaise: invoice.payments.reduce((sum, payment) => sum + payment.amountPaise, 0),
  outstandingPaise: Math.max(0, invoice.totalPaise - invoice.payments.reduce((sum, payment) => sum + payment.amountPaise, 0)),
  status: invoice.status,
  supplier: invoice.tenant,
  placeOfSupplyStateCode: invoice.placeOfSupplyStateCode,
  patient: { id: invoice.patient.id, name: invoice.patient.user.name, email: invoice.patient.user.email, phone: invoice.patient.user.phone, mrn: invoice.patient.mrn },
  treatment: invoice.treatment ? { summary: invoice.treatment.summary, completedAt: invoice.treatment.completedAt } : null,
  appointment: invoice.appointment ? {
    date: invoice.appointment.scheduledFor.toISOString().slice(0, 10),
    startTime: invoice.appointment.startTime,
    doctor: invoice.appointment.doctor.user.name,
  } : null,
  admission: invoice.admission ? { admissionNumber: invoice.admission.admissionNumber } : null,
  lines: invoice.lines,
  payments: invoice.payments,
});

async function findAccessibleInvoice(req: import("express").Request, id: string) {
  const invoice = await prisma.invoice.findFirst({ where: { id, tenantId: req.tenantId! }, include: invoiceInclude });
  if (!invoice) throw new AppError(404, "INVOICE_NOT_FOUND", "Invoice not found.");
  if (invoice.status !== "ISSUED") throw new AppError(409, "INVOICE_NOT_ISSUED", "Only issued invoices can be downloaded.");

  const roles = req.user!.roles;
  const isPatient = roles.includes(Role.PATIENT) && invoice.patient.user.email && invoice.patient.id === (await prisma.patient.findFirst({
    where: { tenantId: req.tenantId!, userId: req.user!.sub },
    select: { id: true },
  }))?.id;
  const doctorProfile = roles.includes(Role.DOCTOR) ? await prisma.doctorProfile.findFirst({
    where: { tenantId: req.tenantId!, userId: req.user!.sub },
    select: { id: true },
  }) : null;
  const isAssignedDoctor = Boolean(doctorProfile && (doctorProfile.id === invoice.appointment?.doctor.id || doctorProfile.id === invoice.admission?.attendingDoctorId));
  const isBillingStaff = roles.includes(Role.ACCOUNTANT) || roles.includes(Role.ADMIN) || roles.includes(Role.RECEPTION);
  if (!isPatient && !isAssignedDoctor && !isBillingStaff) {
    throw new AppError(403, "FORBIDDEN", "You cannot access this invoice.");
  }
  return invoice;
}

const rupeesSchema = z.string().regex(/^\d{1,7}(?:\.\d{1,2})?$/, "Enter an amount with no more than two decimal places.")
  .transform((amount) => {
    const [rupees, paise = ""] = amount.split(".");
    return Number(rupees) * 100 + Number(paise.padEnd(2, "0"));
  });

const itemSchema = z.object({
  description: z.string().trim().min(2).max(160),
  quantity: z.number().int().min(1).max(1000),
  unitPriceRupees: rupeesSchema,
});

const treatmentSchema = z.object({
  summary: z.string().trim().min(3).max(2000),
  items: z.array(itemSchema).min(1).max(30),
});

router.post(
  "/appointments/:id/treatment",
  authenticate,
  requireRole(Role.DOCTOR),
  reverifyRole(Role.DOCTOR),
  wrap(async (req, res) => {
    const body = treatmentSchema.parse(req.body);
    const doctor = await prisma.doctorProfile.findFirst({
      where: { tenantId: req.tenantId!, userId: req.user!.sub },
      select: { id: true },
    });
    if (!doctor) throw new AppError(403, "DOCTOR_PROFILE_REQUIRED", "A doctor profile is required to record treatment.");

    const appointment = await prisma.appointment.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId!, doctorId: doctor.id },
      select: { id: true, patientId: true, doctorId: true },
    });
    if (!appointment) throw new AppError(404, "APPOINTMENT_NOT_FOUND", "Appointment not found for this doctor.");

    const subtotalPaise = body.items.reduce((sum, item) => sum + item.quantity * item.unitPriceRupees, 0);
    if (!Number.isSafeInteger(subtotalPaise) || subtotalPaise > 2_000_000_000) {
      throw new AppError(422, "INVOICE_TOTAL_TOO_LARGE", "The invoice total is too large.");
    }

    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Appointment" WHERE "id" = ${appointment.id} AND "tenantId" = ${req.tenantId!} FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "Tenant" WHERE "id" = ${req.tenantId!} FOR UPDATE`;

      const existing = await tx.invoice.findUnique({ where: { appointmentId: appointment.id }, include: invoiceInclude });
      if (existing) return { invoice: existing, created: false };

      const current = await tx.appointment.findFirst({
        where: { id: appointment.id, tenantId: req.tenantId!, doctorId: doctor.id },
        select: { id: true, patientId: true, status: true, cancelledAt: true },
      });
      if (!current || current.cancelledAt || current.status !== AppointmentStatus.IN_CONSULTATION) {
        throw new AppError(409, "TREATMENT_NOT_RECORDABLE", "Start the consultation before recording treatment and issuing an invoice.");
      }

      const sequence = ((await tx.invoice.aggregate({ where: { tenantId: req.tenantId! }, _max: { sequence: true } }))._max.sequence ?? 0) + 1;
      const year = new Date().getUTCFullYear();
      const invoiceNumber = `MA-INV-${year}-${String(sequence).padStart(6, "0")}`;
      const treatment = await tx.treatment.create({
        data: {
          tenantId: req.tenantId!,
          appointmentId: current.id,
          doctorId: doctor.id,
          summary: body.summary,
          items: { create: body.items.map(({ description, quantity, unitPriceRupees }) => ({ description, quantity, unitPricePaise: unitPriceRupees })) },
        },
        select: { id: true },
      });
      const invoice = await tx.invoice.create({
        data: {
          tenantId: req.tenantId!,
          patientId: current.patientId,
          appointmentId: current.id,
          treatmentId: treatment.id,
          invoiceNumber,
          sequence,
          subtotalPaise,
          totalPaise: subtotalPaise,
          lines: {
            create: body.items.map(({ description, quantity, unitPriceRupees }) => ({
              description,
              quantity,
              unitPricePaise: unitPriceRupees,
              lineTotalPaise: quantity * unitPriceRupees,
              hsnSacCode: "9993",
              taxTreatment: "EXEMPT",
              gstRateBps: 0,
              taxablePaise: quantity * unitPriceRupees,
            })),
          },
        },
        include: invoiceInclude,
      });
      await tx.appointment.update({ where: { id: current.id }, data: { status: AppointmentStatus.COMPLETED } });
      return { invoice, created: true };
    });

    if (result.created) {
      await audit(req, "TREATMENT_COMPLETED_INVOICE_ISSUED", "Invoice", result.invoice.id);
      notifyQueueChanged(req.tenantId!);
    }
    res.status(result.created ? 201 : 200).json({ success: true, data: { invoice: serializeInvoice(result.invoice) } });
  })
);

router.use("/invoices", authenticate, requireRole(...invoiceRoles), reverifyRole(...invoiceRoles));

router.get(
  "/invoices",
  wrap(async (req, res) => {
    const where: Prisma.InvoiceWhereInput = { tenantId: req.tenantId!, status: "ISSUED" };
    if (req.user!.roles.includes(Role.PATIENT)) {
      const patient = await prisma.patient.findFirst({ where: { tenantId: req.tenantId!, userId: req.user!.sub }, select: { id: true } });
      if (!patient) throw new AppError(403, "PATIENT_PROFILE_REQUIRED", "A patient profile is required to view invoices.");
      where.patientId = patient.id;
    } else if (req.user!.roles.includes(Role.DOCTOR) && ![Role.ADMIN, Role.ACCOUNTANT, Role.RECEPTION].some((role) => req.user!.roles.includes(role))) {
      const doctor = await prisma.doctorProfile.findFirst({ where: { tenantId: req.tenantId!, userId: req.user!.sub }, select: { id: true } });
      if (!doctor) throw new AppError(403, "DOCTOR_PROFILE_REQUIRED", "A doctor profile is required to view invoices.");
      where.appointment = { doctorId: doctor.id };
    }

    const invoices = await prisma.invoice.findMany({
      where,
      include: invoiceInclude,
      orderBy: { issuedAt: "desc" },
      take: 200,
    });
    res.json({ success: true, data: { invoices: invoices.map(serializeInvoice) } });
  })
);

router.get(
  "/invoices/:id/pdf",
  wrap(async (req, res, next) => {
    try {
      const invoice = await findAccessibleInvoice(req, req.params.id);
      const doc = new PDFDocument({ size: "A4", margin: 48, info: { Title: invoice.invoiceNumber, Author: "MediAccess" } });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${invoice.invoiceNumber}.pdf"`);
      doc.on("error", (error) => {
        if (res.headersSent) res.destroy(error);
        else next(error);
      });
      doc.pipe(res);
      const money = (paise: number) => `${invoice.currency} ${(paise / 100).toFixed(2)}`;
      const taxInvoice = invoice.taxPaise > 0;
      doc.fontSize(22).fillColor("#0e7c86").text(invoice.tenant.legalName || invoice.tenant.name, { continued: true, width: 300 });
      doc.fontSize(18).fillColor("#14262c").text(taxInvoice ? "TAX INVOICE" : "INVOICE", { align: "right" });
      doc.fontSize(9).fillColor("#5b6f76");
      if (invoice.tenant.billingAddress) doc.text(invoice.tenant.billingAddress);
      doc.text(`GSTIN: ${invoice.tenant.gstin || "Not configured"}`);
      doc.moveDown(0.6);
      doc.fontSize(11).fillColor("#14262c").text(`Invoice: ${invoice.invoiceNumber}`);
      doc.text(`Issued: ${invoice.issuedAt.toISOString().slice(0, 10)}`);
      doc.text(`Place of supply: ${invoice.placeOfSupplyStateCode || invoice.tenant.stateCode || "Not recorded"}`);
      doc.text(`Status: ${invoice.status}`);
      doc.moveDown(0.6);
      doc.fontSize(12).text("Bill to", { underline: true });
      doc.fontSize(10).text(invoice.patient.user.name);
      doc.text(`UHID: ${invoice.patient.mrn}`);
      if (invoice.patient.user.email) doc.text(invoice.patient.user.email);
      doc.moveDown(0.6);
      doc.fontSize(10).text(`Service: ${invoice.treatment?.summary ?? (invoice.admission ? "IPD services" : "OPD services")}`);
      if (invoice.appointment) {
        doc.text(`Doctor: ${invoice.appointment.doctor.user.name}`);
        doc.text(`Visit: ${invoice.appointment.scheduledFor.toISOString().slice(0, 10)} at ${invoice.appointment.startTime}`);
      } else {
        doc.text(`Admission: ${invoice.admission?.admissionNumber ?? "IPD"}`);
      }
      doc.moveDown();

      const columns = [
        { x: 48, width: 126, label: "Service" }, { x: 176, width: 48, label: "HSN/SAC" },
        { x: 225, width: 27, label: "Qty" }, { x: 253, width: 54, label: "Rate" },
        { x: 308, width: 60, label: "Tax base" }, { x: 369, width: 39, label: "GST" },
        { x: 409, width: 52, label: "Tax" }, { x: 463, width: 84, label: "Line total" },
      ];
      const headerY = doc.y;
      doc.fontSize(7.5).fillColor("#5b6f76");
      for (const column of columns) doc.text(column.label, column.x, headerY, { width: column.width, align: column.x > 220 ? "right" : "left" });
      const ruleY = headerY + 15;
      doc.moveTo(48, ruleY).lineTo(547, ruleY).strokeColor("#dbe4e8").stroke();
      doc.y = ruleY + 7;
      for (const line of invoice.lines) {
        const rowY = doc.y;
        const tax = line.cgstPaise + line.sgstPaise + line.igstPaise;
        const total = line.lineTotalPaise - line.discountPaise + tax;
        const values = [
          line.description, line.hsnSacCode || "—", String(line.quantity), money(line.unitPricePaise),
          money(line.taxablePaise), `${(line.gstRateBps / 100).toFixed(2)}%`, money(tax), money(total),
        ];
        const descriptionHeight = doc.heightOfString(values[0], { width: columns[0].width });
        doc.fontSize(8).fillColor("#14262c");
        values.forEach((value, index) => doc.text(value, columns[index].x, rowY, { width: columns[index].width, align: index > 1 ? "right" : "left" }));
        doc.y = rowY + Math.max(descriptionHeight, 12) + 5;
      }
      doc.moveDown(0.3);
      doc.fontSize(9).fillColor("#14262c");
      doc.text(`Subtotal: ${money(invoice.subtotalPaise)}`, { align: "right" });
      doc.text(`Discount: -${money(invoice.discountPaise)}`, { align: "right" });
      doc.text(`CGST: ${money(invoice.lines.reduce((sum, line) => sum + line.cgstPaise, 0))}`, { align: "right" });
      doc.text(`SGST: ${money(invoice.lines.reduce((sum, line) => sum + line.sgstPaise, 0))}`, { align: "right" });
      doc.text(`IGST: ${money(invoice.lines.reduce((sum, line) => sum + line.igstPaise, 0))}`, { align: "right" });
      doc.fontSize(12).text(`Invoice total: ${money(invoice.totalPaise)}`, { align: "right" });
      const paidPaise = invoice.payments.reduce((sum, payment) => sum + payment.amountPaise, 0);
      doc.fontSize(10).text(`Paid: ${money(paidPaise)}   Balance due: ${money(Math.max(0, invoice.totalPaise - paidPaise))}`, { align: "right" });
      if (invoice.lines.every((line) => line.taxTreatment === "EXEMPT")) {
        doc.moveDown(0.5);
        doc.fontSize(8).fillColor("#5b6f76").text("GST treatment: exemption applied as configured for the listed services. HSN/SAC is shown per line item.");
      }
      doc.end();
    } catch (error) {
      next(error);
    }
  })
);

export default router;