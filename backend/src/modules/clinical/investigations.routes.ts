import { ClinicalNotificationType, ClinicalRecordType, InvestigationDepartment, InvestigationPriority, InvestigationStatus, Role, UserStatus } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middleware/auth";
import { reverifyRole, requireRole } from "../../middleware/rbac";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../lib/errors";
import { wrap } from "../../lib/async";
import { audit } from "../../middleware/audit";
import { publishClinicalNotifications, type ClinicalNotice } from "./notifications";
import { createReportDownloadUrl, createReportUploadUrl, MAX_REPORT_SIZE, verifyReportObject } from "./report-storage";

const router = Router();
const staffRoles = [Role.ADMIN, Role.DOCTOR, Role.LAB_TECH];
const testSchema = z.object({
  code: z.string().trim().toUpperCase().min(2).max(30).regex(/^[A-Z0-9_-]+$/),
  name: z.string().trim().min(2).max(160),
  department: z.nativeEnum(InvestigationDepartment),
  description: z.string().trim().max(500).optional(),
});
const reportableStatuses = new Set<InvestigationStatus>([InvestigationStatus.IN_PROGRESS, InvestigationStatus.COMPLETED]);
const nextStatuses: Record<InvestigationStatus, InvestigationStatus[]> = {
  ORDERED: [InvestigationStatus.COLLECTED, InvestigationStatus.CANCELLED],
  COLLECTED: [InvestigationStatus.IN_PROGRESS, InvestigationStatus.CANCELLED],
  IN_PROGRESS: [InvestigationStatus.COMPLETED, InvestigationStatus.CANCELLED],
  COMPLETED: [InvestigationStatus.CANCELLED],
  REPORTED: [],
  CANCELLED: [],
};
const priorityRank: Record<InvestigationPriority, number> = {
  STAT: 0,
  URGENT: 1,
  ROUTINE: 2,
};

router.get("/clinical/patient/reports", authenticate, requireRole(Role.PATIENT), reverifyRole(Role.PATIENT), wrap(async (req, res) => {
  const patient = await prisma.patient.findFirst({ where: { tenantId: req.tenantId!, userId: req.user!.sub }, select: { id: true } });
  if (!patient) throw new AppError(403, "PATIENT_PROFILE_REQUIRED", "A patient profile is required to view reports.");
  const reports = await prisma.investigationReport.findMany({
    where: { tenantId: req.tenantId!, patientId: patient.id },
    include: { investigationOrder: { include: { test: { select: { name: true, department: true } }, orderedBy: { include: { user: { select: { name: true } } } } } } },
    orderBy: { uploadedAt: "desc" }, take: 100,
  });
  res.json({ success: true, data: { reports } });
}));

router.get("/clinical/patient/notifications", authenticate, requireRole(Role.PATIENT), reverifyRole(Role.PATIENT), wrap(async (req, res) => {
  const notifications = await prisma.clinicalNotification.findMany({ where: { tenantId: req.tenantId!, userId: req.user!.sub }, orderBy: { createdAt: "desc" }, take: 50 });
  res.json({ success: true, data: { notifications } });
}));

router.patch("/clinical/patient/notifications/:id/read", authenticate, requireRole(Role.PATIENT), reverifyRole(Role.PATIENT), wrap(async (req, res) => {
  const result = await prisma.clinicalNotification.updateMany({
    where: { id: req.params.id, tenantId: req.tenantId!, userId: req.user!.sub },
    data: { readAt: new Date() },
  });
  if (!result.count) throw new AppError(404, "NOTIFICATION_NOT_FOUND", "Notification not found.");
  res.json({ success: true, data: { updated: true } });
}));

router.get("/clinical/patient/reports/:id/download-url", authenticate, requireRole(Role.PATIENT), reverifyRole(Role.PATIENT), wrap(async (req, res) => {
  const report = await prisma.investigationReport.findFirst({ where: { id: req.params.id, tenantId: req.tenantId!, patient: { userId: req.user!.sub } }, select: { objectKey: true, fileName: true } });
  if (!report) throw new AppError(404, "REPORT_NOT_FOUND", "Report not found.");
  res.json({ success: true, data: { url: await createReportDownloadUrl(report.objectKey), fileName: report.fileName } });
}));

router.get("/clinical/notifications", authenticate, requireRole(...staffRoles), reverifyRole(...staffRoles), wrap(async (req, res) => {
  const notifications = await prisma.clinicalNotification.findMany({ where: { tenantId: req.tenantId!, userId: req.user!.sub }, orderBy: { createdAt: "desc" }, take: 50 });
  res.json({ success: true, data: { notifications } });
}));

router.patch("/clinical/notifications/:id/read", authenticate, requireRole(...staffRoles), reverifyRole(...staffRoles), wrap(async (req, res) => {
  const result = await prisma.clinicalNotification.updateMany({
    where: { id: req.params.id, tenantId: req.tenantId!, userId: req.user!.sub },
    data: { readAt: new Date() },
  });
  if (!result.count) throw new AppError(404, "NOTIFICATION_NOT_FOUND", "Notification not found.");
  res.json({ success: true, data: { updated: true } });
}));

router.get("/clinical/investigation-tests", authenticate, requireRole(...staffRoles), reverifyRole(...staffRoles), wrap(async (req, res) => {
  const { department } = z.object({ department: z.nativeEnum(InvestigationDepartment).optional() }).parse(req.query);
  const tests = await prisma.investigationTest.findMany({
    where: { tenantId: req.tenantId!, isActive: true, ...(department ? { department } : {}) },
    orderBy: [{ department: "asc" }, { name: "asc" }], take: 500,
  });
  res.json({ success: true, data: { tests } });
}));

router.post("/clinical/investigation-tests", authenticate, requireRole(Role.ADMIN), reverifyRole(Role.ADMIN), wrap(async (req, res) => {
  const body = testSchema.parse(req.body);
  const test = await prisma.investigationTest.create({ data: { ...body, tenantId: req.tenantId! } });
  await audit(req, "INVESTIGATION_TEST_CREATED", "InvestigationTest", test.id);
  res.status(201).json({ success: true, data: { test } });
}));

router.post("/clinical/investigation-orders", authenticate, requireRole(Role.DOCTOR, Role.ADMIN), reverifyRole(Role.DOCTOR, Role.ADMIN), wrap(async (req, res) => {
  const body = z.object({
    patientId: z.string().min(1), testId: z.string().min(1), encounterId: z.string().optional(),
    priority: z.nativeEnum(InvestigationPriority).default(InvestigationPriority.ROUTINE),
    clinicalNotes: z.string().trim().max(1000).optional(),
  }).parse(req.body);
  const [patient, test, doctor] = await Promise.all([
    prisma.patient.findFirst({ where: { id: body.patientId, tenantId: req.tenantId!, user: { is: { status: UserStatus.ACTIVE } } }, select: { id: true } }),
    prisma.investigationTest.findFirst({ where: { id: body.testId, tenantId: req.tenantId!, isActive: true } }),
    prisma.doctorProfile.findFirst({ where: { tenantId: req.tenantId!, userId: req.user!.sub }, select: { id: true } }),
  ]);
  if (!patient) throw new AppError(404, "PATIENT_NOT_FOUND", "Patient not found.");
  if (!test) throw new AppError(404, "INVESTIGATION_TEST_NOT_FOUND", "Investigation test not found.");
  if (!doctor) throw new AppError(403, "DOCTOR_PROFILE_REQUIRED", "A doctor profile is required to order investigations.");
  if (body.encounterId && !await prisma.encounter.findFirst({ where: { id: body.encounterId, tenantId: req.tenantId!, patientId: patient.id, doctorId: doctor.id }, select: { id: true } })) {
    throw new AppError(404, "ENCOUNTER_NOT_FOUND", "Encounter not found for this patient and doctor.");
  }
  const order = await prisma.investigationOrder.create({
    data: {
      tenantId: req.tenantId!, patientId: patient.id, testId: test.id, encounterId: body.encounterId || null,
      orderedById: doctor.id, department: test.department, priority: body.priority, clinicalNotes: body.clinicalNotes || null,
    },
    include: { test: true, patient: { include: { user: { select: { name: true } } } } },
  });
  await audit(req, "INVESTIGATION_ORDER_CREATED", "InvestigationOrder", order.id);
  res.status(201).json({ success: true, data: { order } });
}));

router.get("/clinical/investigation-orders", authenticate, requireRole(...staffRoles), reverifyRole(...staffRoles), wrap(async (req, res) => {
  const query = z.object({
    department: z.nativeEnum(InvestigationDepartment).optional(),
    status: z.nativeEnum(InvestigationStatus).optional(),
  }).parse(req.query);
  const where: import("@prisma/client").Prisma.InvestigationOrderWhereInput = {
    tenantId: req.tenantId!, ...(query.department ? { department: query.department } : {}), ...(query.status ? { status: query.status } : {}),
  };
  if (req.user!.roles.includes(Role.DOCTOR) && !req.user!.roles.includes(Role.ADMIN)) {
    const doctor = await prisma.doctorProfile.findFirst({ where: { tenantId: req.tenantId!, userId: req.user!.sub }, select: { id: true } });
    if (!doctor) throw new AppError(403, "DOCTOR_PROFILE_REQUIRED", "A doctor profile is required.");
    where.orderedById = doctor.id;
  }
  const orders = await prisma.investigationOrder.findMany({
    where,
    include: {
      test: true,
      patient: { select: { id: true, mrn: true, user: { select: { name: true } } } },
      orderedBy: { include: { user: { select: { name: true } } } },
      encounter: { select: { id: true, chiefComplaint: true } },
      reports: { select: { id: true, fileName: true, summary: true, isCritical: true, uploadedAt: true } },
    },
    orderBy: { orderedAt: "asc" }, take: 500,
  });
  orders.sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority] || a.orderedAt.getTime() - b.orderedAt.getTime());
  res.json({ success: true, data: { orders } });
}));

router.get("/clinical/worklists/:department", authenticate, requireRole(Role.ADMIN, Role.LAB_TECH), reverifyRole(Role.ADMIN, Role.LAB_TECH), wrap(async (req, res) => {
  const department = z.nativeEnum(InvestigationDepartment).parse(req.params.department.toUpperCase());
  const { status } = z.object({ status: z.nativeEnum(InvestigationStatus).optional() }).parse(req.query);
  const orders = await prisma.investigationOrder.findMany({
    where: { tenantId: req.tenantId!, department, ...(status ? { status } : { status: { notIn: [InvestigationStatus.REPORTED, InvestigationStatus.CANCELLED] } }) },
    include: {
      test: true,
      patient: { select: { id: true, mrn: true, dob: true, user: { select: { name: true, phone: true } } } },
      orderedBy: { include: { user: { select: { name: true, email: true } } } },
      encounter: { select: { id: true, chiefComplaint: true } },
      reports: { select: { id: true, fileName: true, summary: true, isCritical: true, uploadedAt: true } },
    },
    orderBy: { orderedAt: "asc" }, take: 500,
  });
  orders.sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority] || a.orderedAt.getTime() - b.orderedAt.getTime());
  res.json({ success: true, data: { department, orders } });
}));

router.patch("/clinical/investigation-orders/:id/status", authenticate, requireRole(Role.ADMIN, Role.LAB_TECH), reverifyRole(Role.ADMIN, Role.LAB_TECH), wrap(async (req, res) => {
  const { status } = z.object({ status: z.nativeEnum(InvestigationStatus) }).parse(req.body);
  const order = await prisma.investigationOrder.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
  if (!order) throw new AppError(404, "INVESTIGATION_ORDER_NOT_FOUND", "Investigation order not found.");
  if (!nextStatuses[order.status].includes(status)) throw new AppError(409, "INVALID_INVESTIGATION_TRANSITION", `Cannot move an order from ${order.status} to ${status}.`);
  const updated = await prisma.investigationOrder.update({ where: { id: order.id }, data: { status } });
  await audit(req, "INVESTIGATION_STATUS_CHANGED", "InvestigationOrder", order.id);
  res.json({ success: true, data: { order: updated } });
}));

router.post("/clinical/investigation-orders/:id/upload-url", authenticate, requireRole(Role.ADMIN, Role.LAB_TECH), reverifyRole(Role.ADMIN, Role.LAB_TECH), wrap(async (req, res) => {
  const body = z.object({ fileName: z.string().trim().min(1).max(180), contentType: z.string().min(1) }).parse(req.body);
  const order = await prisma.investigationOrder.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! }, select: { id: true, status: true } });
  if (!order) throw new AppError(404, "INVESTIGATION_ORDER_NOT_FOUND", "Investigation order not found.");
  if (!reportableStatuses.has(order.status)) throw new AppError(409, "ORDER_NOT_REPORTABLE", "Start or complete the investigation before uploading its report.");
  const upload = await createReportUploadUrl({ tenantId: req.tenantId!, orderId: order.id, ...body });
  res.json({ success: true, data: upload });
}));

router.post("/clinical/investigation-orders/:id/reports", authenticate, requireRole(Role.ADMIN, Role.LAB_TECH), reverifyRole(Role.ADMIN, Role.LAB_TECH), wrap(async (req, res) => {
  const body = z.object({
    objectKey: z.string().min(1), fileName: z.string().trim().min(1).max(180), contentType: z.string().min(1),
    summary: z.string().trim().max(2000).optional(), isCritical: z.boolean().default(false),
  }).parse(req.body);
  const order = await prisma.investigationOrder.findFirst({
    where: { id: req.params.id, tenantId: req.tenantId! },
    include: {
      patient: { include: { user: { select: { id: true, name: true, email: true } } } },
      orderedBy: { include: { user: { select: { id: true, name: true, email: true } } } },
      test: { select: { name: true, department: true } },
    },
  });
  if (!order) throw new AppError(404, "INVESTIGATION_ORDER_NOT_FOUND", "Investigation order not found.");
  if (!reportableStatuses.has(order.status)) throw new AppError(409, "ORDER_NOT_REPORTABLE", "Start or complete the investigation before attaching its report.");
  const expectedPrefix = `tenants/${req.tenantId}/investigations/${order.id}/`;
  if (!body.objectKey.startsWith(expectedPrefix)) throw new AppError(403, "REPORT_KEY_INVALID", "Report object key does not belong to this investigation order.");
  const object = await verifyReportObject(body.objectKey, body.contentType);
  if (object.sizeBytes > MAX_REPORT_SIZE) throw new AppError(413, "REPORT_TOO_LARGE", "Reports must be 20 MB or smaller.");
  const report = await prisma.$transaction(async (tx) => {
    const created = await tx.investigationReport.create({
      data: {
        tenantId: req.tenantId!, investigationOrderId: order.id, patientId: order.patientId,
        encounterId: order.encounterId, uploadedById: req.user!.sub, objectKey: body.objectKey,
        fileName: body.fileName, contentType: body.contentType, sizeBytes: object.sizeBytes,
        summary: body.summary || null, isCritical: body.isCritical,
      },
    });
    await tx.investigationOrder.update({ where: { id: order.id }, data: { status: InvestigationStatus.REPORTED } });
    await tx.clinicalRecord.create({ data: {
      patientId: order.patientId, type: ClinicalRecordType.REPORT,
      title: `${order.test.name} report`, summary: body.summary || null,
      status: body.isCritical ? "CRITICAL" : "READY", occurredAt: created.uploadedAt,
    } });
    return created;
  });
  const reportNotice = {
    tenantId: req.tenantId!, userId: order.patient.user.id, email: order.patient.user.email,
    type: ClinicalNotificationType.REPORT_READY, entityId: report.id,
    title: "Investigation report ready", message: `Your ${order.test.name} report is ready in the MediAccess patient portal.`,
  };
  const notices: ClinicalNotice[] = [reportNotice];
  if (body.isCritical) notices.push({
    tenantId: req.tenantId!, userId: order.orderedBy.user.id, email: order.orderedBy.user.email,
    type: ClinicalNotificationType.CRITICAL_RESULT, entityId: report.id,
    title: `Critical ${order.test.name} result`, message: `${order.patient.user.name}'s ${order.test.name} report was marked critical. Review the investigation worklist immediately.`,
  });
  await publishClinicalNotifications(notices);
  await audit(req, body.isCritical ? "CRITICAL_INVESTIGATION_REPORT_UPLOADED" : "INVESTIGATION_REPORT_UPLOADED", "InvestigationReport", report.id);
  res.status(201).json({ success: true, data: { report } });
}));

router.get("/clinical/reports/:id/download-url", authenticate, requireRole(Role.ADMIN, Role.DOCTOR, Role.LAB_TECH), reverifyRole(Role.ADMIN, Role.DOCTOR, Role.LAB_TECH), wrap(async (req, res) => {
  const report = await prisma.investigationReport.findFirst({
    where: { id: req.params.id, tenantId: req.tenantId! },
    include: { investigationOrder: { select: { orderedBy: { select: { userId: true } } } } },
  });
  if (!report) throw new AppError(404, "REPORT_NOT_FOUND", "Investigation report not found.");
  const isDoctor = req.user!.roles.includes(Role.DOCTOR) && report.investigationOrder.orderedBy.userId === req.user!.sub;
  const isLab = req.user!.roles.includes(Role.LAB_TECH) || req.user!.roles.includes(Role.ADMIN);
  if (!isDoctor && !isLab) throw new AppError(403, "FORBIDDEN", "You cannot access this report.");
  res.json({ success: true, data: { url: await createReportDownloadUrl(report.objectKey), fileName: report.fileName } });
}));

export default router;