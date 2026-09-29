import { ClinicalRecordType, Role, UserStatus } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { authenticate, reverifyRole, requireRole } from "../../middleware/auth";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../lib/errors";
import { wrap } from "../../lib/async";
import { audit } from "../../lib/audit";

const router = Router();
const clinicalRoles = [Role.ADMIN, Role.RECEPTION, Role.DOCTOR, Role.NURSE, Role.PHARMACIST, Role.LAB_TECH];
router.use(authenticate, requireRole(...clinicalRoles), reverifyRole(...clinicalRoles));

const searchSchema = z.object({ q: z.string().trim().min(3).max(100) });
const vitalFields = {
  systolic: z.number().finite().min(40).max(300).optional(),
  diastolic: z.number().finite().min(20).max(200).optional(),
  pulse: z.number().finite().min(20).max(250).optional(),
  temperature: z.number().finite().min(25).max(45).optional(),
  respiratoryRate: z.number().finite().min(4).max(80).optional(),
  oxygenSaturation: z.number().finite().min(50).max(100).optional(),
  height: z.number().finite().min(30).max(250).optional(),
  weight: z.number().finite().min(1).max(350).optional(),
};
const vitalSchema = z.object({
  ...vitalFields,
  notes: z.string().trim().max(1000).optional(),
}).refine((value) => Object.values(vitalFields).some((field, index) => {
  const key = Object.keys(vitalFields)[index] as keyof typeof vitalFields;
  return value[key] !== undefined;
}), "Enter at least one measurement.").refine(
  (value) => (value.systolic === undefined) === (value.diastolic === undefined),
  "Enter both systolic and diastolic blood pressure.",
);

const encounterSchema = z.object({
  specialty: z.string().trim().max(80).optional(),
  chiefComplaint: z.string().trim().min(2).max(500),
  subjective: z.string().trim().min(1).max(8000),
  objective: z.string().trim().min(1).max(8000),
  assessment: z.string().trim().min(1).max(8000),
  plan: z.string().trim().min(1).max(8000),
  icd10Code: z.string().trim().regex(/^[A-Z][0-9]{2}(?:\.[A-Z0-9]{1,4})?$/).optional().or(z.literal("")),
  diagnosis: z.string().trim().max(250).optional(),
});
const dateValue = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal(""));
const patientProfileSchema = z.object({
  sex: z.string().trim().max(40).optional(),
  address: z.string().trim().max(500).optional(),
  allergy: z.object({
    substance: z.string().trim().min(2).max(120),
    reaction: z.string().trim().max(240).optional(),
    severity: z.string().trim().max(40).optional(),
    notes: z.string().trim().max(500).optional(),
  }).optional(),
  insurance: z.object({
    provider: z.string().trim().min(2).max(160),
    policyNumber: z.string().trim().min(2).max(120),
    memberId: z.string().trim().max(120).optional(),
    coverageStart: dateValue,
    coverageEnd: dateValue,
  }).optional(),
  emergencyContact: z.object({
    name: z.string().trim().min(2).max(100),
    relationship: z.string().trim().min(2).max(60),
    phone: z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/),
  }).optional(),
}).refine((value) => Object.keys(value).length > 0, "Enter at least one profile update.");

router.get("/clinical/patients/search", wrap(async (req, res) => {
  const { q } = searchSchema.parse(req.query);
  const pattern = `%${q}%`;
  const patients = await prisma.$queryRaw<Array<{
    id: string; mrn: string; dob: Date; sex: string | null; name: string; email: string; phone: string | null;
  }>>`
    WITH candidates AS (
      SELECT p."id"
      FROM "Patient" p
      WHERE p."tenantId" = ${req.tenantId!}
        AND (p."mrn" % ${q} OR p."mrn" ILIKE ${pattern})
      UNION
      SELECT p."id"
      FROM "Patient" p
      JOIN "User" u ON u."id" = p."userId"
      WHERE p."tenantId" = ${req.tenantId!}
        AND (u."name" % ${q} OR u."name" ILIKE ${pattern}
          OR u."email" % ${q} OR u."email" ILIKE ${pattern}
          OR u."phone" % ${q} OR u."phone" ILIKE ${pattern})
    )
    SELECT p."id", p."mrn", p."dob", p."sex", u."name", u."email", u."phone"
    FROM candidates c
    JOIN "Patient" p ON p."id" = c."id"
    JOIN "User" u ON u."id" = p."userId"
    WHERE p."tenantId" = ${req.tenantId!} AND u."status" = 'ACTIVE'
    ORDER BY GREATEST(
      similarity(u."name", ${q}), similarity(u."email", ${q}),
      similarity(COALESCE(u."phone", ''), ${q}), similarity(p."mrn", ${q})
    ) DESC
    LIMIT 25
  `;
  res.json({ success: true, data: { patients: patients.map((patient) => ({
    ...patient,
    dob: patient.dob.toISOString().slice(0, 10),
  })) } });
}));

router.get("/clinical/patients/:id", wrap(async (req, res) => {
  const patient = await prisma.patient.findFirst({
    where: { id: req.params.id, tenantId: req.tenantId!, user: { is: { status: UserStatus.ACTIVE } } },
    include: {
      user: { select: { name: true, email: true, phone: true } },
      allergies: { orderBy: { createdAt: "desc" } },
      insurances: true,
      emergencyContacts: true,
      encounters: { include: { doctor: { include: { user: { select: { name: true } } } } }, orderBy: { createdAt: "desc" }, take: 30 },
      appointments: {
        include: {
          doctor: { include: { user: { select: { name: true } } } },
          treatment: { select: { summary: true, completedAt: true } },
          invoice: { select: { id: true, invoiceNumber: true, totalPaise: true, issuedAt: true } },
        },
        orderBy: { scheduledFor: "desc" }, take: 50,
      },
      vitals: { orderBy: { recordedAt: "desc" }, take: 30 },
      clinicalRecords: { orderBy: { occurredAt: "desc" }, take: 50 },
      invoices: { select: { id: true, invoiceNumber: true, totalPaise: true, issuedAt: true }, orderBy: { issuedAt: "desc" }, take: 50 },
    },
  });
  if (!patient) throw new AppError(404, "PATIENT_NOT_FOUND", "Patient not found.");
  const { user, ...record } = patient;
  res.json({ success: true, data: { patient: { ...record, name: user.name, email: user.email, phone: user.phone } } });
}));

router.patch("/clinical/patients/:id/profile", requireRole(Role.RECEPTION, Role.ADMIN), reverifyRole(Role.RECEPTION, Role.ADMIN), wrap(async (req, res) => {
  const body = patientProfileSchema.parse(req.body);
  const patient = await prisma.patient.findFirst({
    where: { id: req.params.id, tenantId: req.tenantId! },
    select: { id: true },
  });
  if (!patient) throw new AppError(404, "PATIENT_NOT_FOUND", "Patient not found.");
  await prisma.$transaction(async (tx) => {
    if (body.sex !== undefined || body.address !== undefined) {
      await tx.patient.update({
        where: { id: patient.id },
        data: {
          ...(body.sex !== undefined ? { sex: body.sex || null } : {}),
          ...(body.address !== undefined ? { address: body.address || null } : {}),
        },
      });
    }
    if (body.allergy) await tx.patientAllergy.create({ data: { ...body.allergy, patientId: patient.id } });
    if (body.insurance) await tx.patientInsurance.create({
      data: {
        ...body.insurance,
        coverageStart: body.insurance.coverageStart ? new Date(body.insurance.coverageStart) : null,
        coverageEnd: body.insurance.coverageEnd ? new Date(body.insurance.coverageEnd) : null,
        memberId: body.insurance.memberId || null,
        patientId: patient.id,
      },
    });
    if (body.emergencyContact) await tx.emergencyContact.create({ data: { ...body.emergencyContact, patientId: patient.id } });
  });
  await audit(req, "PATIENT_PROFILE_UPDATED", "Patient", patient.id);
  res.json({ success: true, data: { updated: true } });
}));

router.post("/clinical/patients/:id/vitals", requireRole(Role.NURSE, Role.ADMIN), reverifyRole(Role.NURSE, Role.ADMIN), wrap(async (req, res) => {
  const body = vitalSchema.parse(req.body);
  const [patient, user] = await Promise.all([
    prisma.patient.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! }, select: { id: true } }),
    prisma.user.findFirst({ where: { id: req.user!.sub, tenantId: req.tenantId!, status: UserStatus.ACTIVE }, select: { id: true } }),
  ]);
  if (!patient) throw new AppError(404, "PATIENT_NOT_FOUND", "Patient not found.");
  if (!user) throw new AppError(401, "UNAUTHENTICATED", "Please sign in.");
  const abnormal = (body.systolic !== undefined && (body.systolic < 90 || body.systolic > 140))
    || (body.diastolic !== undefined && (body.diastolic < 60 || body.diastolic > 90))
    || (body.pulse !== undefined && (body.pulse < 50 || body.pulse > 100))
    || (body.temperature !== undefined && (body.temperature < 36 || body.temperature > 38))
    || (body.respiratoryRate !== undefined && (body.respiratoryRate < 12 || body.respiratoryRate > 20))
    || (body.oxygenSaturation !== undefined && body.oxygenSaturation < 95);
  const vital = await prisma.vitalEntry.create({
    data: { ...body, patientId: patient.id, enteredById: user.id, abnormal },
  });
  await audit(req, "PATIENT_VITALS_RECORDED", "VitalEntry", vital.id);
  res.status(201).json({ success: true, data: { vital } });
}));

router.post("/clinical/patients/:id/encounters", requireRole(Role.DOCTOR, Role.ADMIN), reverifyRole(Role.DOCTOR, Role.ADMIN), wrap(async (req, res) => {
  const body = encounterSchema.parse(req.body);
  const [patient, doctor] = await Promise.all([
    prisma.patient.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! }, select: { id: true } }),
    prisma.doctorProfile.findFirst({ where: { tenantId: req.tenantId!, userId: req.user!.sub }, select: { id: true } }),
  ]);
  if (!patient) throw new AppError(404, "PATIENT_NOT_FOUND", "Patient not found.");
  if (!doctor) throw new AppError(403, "DOCTOR_PROFILE_REQUIRED", "A doctor profile is required to record a consultation.");
  const encounter = await prisma.encounter.create({
    data: { ...body, icd10Code: body.icd10Code || null, tenantId: req.tenantId!, patientId: patient.id, doctorId: doctor.id },
    include: { doctor: { include: { user: { select: { name: true } } } } },
  });
  await audit(req, "PATIENT_ENCOUNTER_RECORDED", "Encounter", encounter.id);
  res.status(201).json({ success: true, data: { encounter } });
}));

router.get("/clinical/record-types", (_req, res) => {
  res.json({ success: true, data: { types: Object.values(ClinicalRecordType) } });
});

export default router;