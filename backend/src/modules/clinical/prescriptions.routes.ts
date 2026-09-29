import PDFDocument from "pdfkit";
import { DrugSchedule, InteractionSeverity, PrescriptionStatus, Role, UserStatus } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { authenticate, reverifyRole, requireRole } from "../../middleware/auth";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../lib/errors";
import { wrap } from "../../lib/async";
import { audit } from "../../lib/audit";
import { signPrescription, verifyPrescriptionSignature } from "../../lib/prescription-signature";

const router = Router();
const prescriberRoles = [Role.DOCTOR];
const catalogRoles = [Role.ADMIN, Role.PHARMACIST];
const prescriptionReaders = [Role.ADMIN, Role.DOCTOR, Role.PHARMACIST, Role.PATIENT];

const genericSchema = z.object({
  genericName: z.string().trim().min(2).max(120),
  strength: z.string().trim().min(1).max(60),
  dosageForm: z.string().trim().min(2).max(60),
  route: z.string().trim().min(2).max(60),
  schedule: z.nativeEnum(DrugSchedule).default(DrugSchedule.UNSCHEDULED),
});
const dosageSchema = z.object({
  drugGenericId: z.string().min(1),
  drugBrandId: z.string().optional(),
  dose: z.string().trim().min(1).max(80),
  route: z.string().trim().min(2).max(60),
  frequency: z.string().trim().min(2).max(100),
  durationDays: z.number().int().min(1).max(365),
  quantity: z.string().trim().min(1).max(40),
  instructions: z.string().trim().max(500).optional(),
});
const prescriptionSchema = z.object({
  encounterId: z.string().optional(),
  diagnosis: z.string().trim().max(250).optional(),
  notes: z.string().trim().max(2000).optional(),
  acknowledgeWarnings: z.boolean().default(false),
  items: z.array(dosageSchema).min(1).max(50),
});

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const allergyCrossReactivity: Record<string, string[]> = {
  penicillin: ["penicillin", "amoxicillin", "ampicillin", "piperacillin", "flucloxacillin"],
  sulfa: ["sulfamethoxazole", "sulfasalazine", "sulfonamide"],
  cephalosporin: ["cephalexin", "cefuroxime", "ceftriaxone", "cefixime"],
  nsaid: ["ibuprofen", "naproxen", "diclofenac", "aspirin", "ketorolac"],
};

async function prescriptionDoctor(req: import("express").Request) {
  const doctor = await prisma.doctorProfile.findFirst({
    where: { tenantId: req.tenantId!, userId: req.user!.sub },
    select: { id: true, registrationNumber: true, user: { select: { name: true } } },
  });
  if (!doctor) throw new AppError(403, "DOCTOR_PROFILE_REQUIRED", "A doctor profile is required to prescribe medication.");
  return doctor;
}

async function evaluateSafety(tenantId: string, patientId: string, drugGenericIds: string[]) {
  const [allergies, drugs, interactions] = await Promise.all([
    prisma.patientAllergy.findMany({ where: { patientId }, select: { substance: true, reaction: true, severity: true } }),
    prisma.drugGeneric.findMany({
      where: { tenantId, id: { in: [...new Set(drugGenericIds)] }, isActive: true },
      include: { brands: { where: { isActive: true }, select: { brandName: true } } },
    }),
    prisma.drugInteraction.findMany({
      where: {
        tenantId,
        OR: [
          { drugAId: { in: drugGenericIds }, drugBId: { in: drugGenericIds } },
        ],
      },
      include: { drugA: { select: { genericName: true } }, drugB: { select: { genericName: true } } },
    }),
  ]);
  if (drugs.length !== new Set(drugGenericIds).size) throw new AppError(422, "DRUG_NOT_AVAILABLE", "One or more selected drugs are unavailable.");

  const allergyWarnings = allergies.flatMap((allergy) => {
    const allergen = normalize(allergy.substance);
    const crossGroup = Object.entries(allergyCrossReactivity).find(([group]) => allergen.includes(group))?.[1] ?? [];
    const matched = drugs.filter((drug) => {
      const names = [drug.genericName, ...drug.brands.map((brand) => brand.brandName)].map(normalize);
      return names.some((name) => name.includes(allergen) || allergen.includes(name) || crossGroup.some((term) => name.includes(term)));
    });
    return matched.map((drug) => ({
      type: "ALLERGY",
      severity: allergy.severity || "HIGH",
      drug: drug.genericName,
      allergen: allergy.substance,
      reaction: allergy.reaction,
      message: `${drug.genericName} may conflict with the recorded ${allergy.substance} allergy.`,
    }));
  });
  const interactionWarnings = interactions.map((interaction) => ({
    type: "INTERACTION",
    severity: interaction.severity,
    drugs: [interaction.drugA.genericName, interaction.drugB.genericName],
    message: interaction.description,
    recommendation: interaction.recommendation,
  }));
  const controlledWarnings = drugs.filter((drug) => [DrugSchedule.SCHEDULE_H1, DrugSchedule.SCHEDULE_X, DrugSchedule.NDPS].some((schedule) => schedule === drug.schedule)).map((drug) => ({
    type: "CONTROLLED_SCHEDULE",
    severity: "REVIEW",
    drug: drug.genericName,
    message: `${drug.genericName} is classified ${drug.schedule.replaceAll("_", " ")}; verify applicable prescribing and dispensing requirements.`,
  }));
  return { drugs, warnings: [...allergyWarnings, ...interactionWarnings, ...controlledWarnings] };
}

router.get("/clinical/drugs", authenticate, requireRole(Role.ADMIN, Role.DOCTOR, Role.PHARMACIST), reverifyRole(Role.ADMIN, Role.DOCTOR, Role.PHARMACIST), wrap(async (req, res) => {
  const { q } = z.object({ q: z.string().trim().max(100).optional() }).parse(req.query);
  const drugs = await prisma.drugGeneric.findMany({
    where: { tenantId: req.tenantId!, isActive: true, ...(q ? { OR: [{ genericName: { contains: q, mode: "insensitive" } }, { brands: { some: { brandName: { contains: q, mode: "insensitive" }, isActive: true } } }] } : {}) },
    include: { brands: { where: { isActive: true }, orderBy: { brandName: "asc" } } },
    orderBy: { genericName: "asc" }, take: 300,
  });
  res.json({ success: true, data: { drugs } });
}));

router.post("/clinical/drugs", authenticate, requireRole(...catalogRoles), reverifyRole(...catalogRoles), wrap(async (req, res) => {
  const body = genericSchema.parse(req.body);
  const drug = await prisma.drugGeneric.create({ data: { ...body, tenantId: req.tenantId! } });
  await audit(req, "DRUG_GENERIC_CREATED", "DrugGeneric", drug.id);
  res.status(201).json({ success: true, data: { drug } });
}));

router.post("/clinical/drugs/:id/brands", authenticate, requireRole(...catalogRoles), reverifyRole(...catalogRoles), wrap(async (req, res) => {
  const body = z.object({ brandName: z.string().trim().min(2).max(120), manufacturer: z.string().trim().max(120).optional() }).parse(req.body);
  const generic = await prisma.drugGeneric.findFirst({ where: { id: req.params.id, tenantId: req.tenantId!, isActive: true }, select: { id: true } });
  if (!generic) throw new AppError(404, "DRUG_NOT_FOUND", "Drug generic not found.");
  const brand = await prisma.drugBrand.create({ data: { ...body, tenantId: req.tenantId!, drugGenericId: generic.id } });
  await audit(req, "DRUG_BRAND_MAPPED", "DrugBrand", brand.id);
  res.status(201).json({ success: true, data: { brand } });
}));

router.get("/clinical/drug-interactions", authenticate, requireRole(Role.ADMIN, Role.DOCTOR, Role.PHARMACIST), reverifyRole(Role.ADMIN, Role.DOCTOR, Role.PHARMACIST), wrap(async (req, res) => {
  const interactions = await prisma.drugInteraction.findMany({
    where: { tenantId: req.tenantId! },
    include: { drugA: { select: { id: true, genericName: true } }, drugB: { select: { id: true, genericName: true } } },
    orderBy: [{ severity: "desc" }, { createdAt: "desc" }], take: 300,
  });
  res.json({ success: true, data: { interactions } });
}));

router.post("/clinical/drug-interactions", authenticate, requireRole(...catalogRoles), reverifyRole(...catalogRoles), wrap(async (req, res) => {
  const body = z.object({
    drugAId: z.string().min(1), drugBId: z.string().min(1), severity: z.nativeEnum(InteractionSeverity),
    description: z.string().trim().min(5).max(500), recommendation: z.string().trim().max(500).optional(),
  }).refine((value) => value.drugAId !== value.drugBId, "Choose two different drugs.").parse(req.body);
  const ids = [body.drugAId, body.drugBId].sort();
  const drugs = await prisma.drugGeneric.findMany({ where: { tenantId: req.tenantId!, id: { in: ids }, isActive: true }, select: { id: true } });
  if (drugs.length !== 2) throw new AppError(404, "DRUG_NOT_FOUND", "Both interaction drugs must be active in this hospital.");
  const interaction = await prisma.drugInteraction.create({
    data: { tenantId: req.tenantId!, drugAId: ids[0], drugBId: ids[1], severity: body.severity, description: body.description, recommendation: body.recommendation || null },
  });
  await audit(req, "DRUG_INTERACTION_RULE_CREATED", "DrugInteraction", interaction.id);
  res.status(201).json({ success: true, data: { interaction } });
}));

router.patch("/clinical/doctor-profile", authenticate, requireRole(Role.DOCTOR), reverifyRole(Role.DOCTOR), wrap(async (req, res) => {
  const body = z.object({ registrationNumber: z.string().trim().min(2).max(80) }).parse(req.body);
  const doctor = await prisma.doctorProfile.findFirst({ where: { tenantId: req.tenantId!, userId: req.user!.sub }, select: { id: true } });
  if (!doctor) throw new AppError(403, "DOCTOR_PROFILE_REQUIRED", "A doctor profile is required.");
  await prisma.doctorProfile.update({ where: { id: doctor.id }, data: body });
  await audit(req, "DOCTOR_REGISTRATION_UPDATED", "DoctorProfile", doctor.id);
  res.json({ success: true, data: { updated: true } });
}));

router.get("/clinical/doctor-profile", authenticate, requireRole(Role.DOCTOR), reverifyRole(Role.DOCTOR), wrap(async (req, res) => {
  const doctor = await prisma.doctorProfile.findFirst({ where: { tenantId: req.tenantId!, userId: req.user!.sub }, select: { id: true, registrationNumber: true } });
  if (!doctor) throw new AppError(403, "DOCTOR_PROFILE_REQUIRED", "A doctor profile is required.");
  res.json({ success: true, data: { doctor } });
}));

router.get("/clinical/prescription-favorites", authenticate, requireRole(...prescriberRoles), reverifyRole(...prescriberRoles), wrap(async (req, res) => {
  const doctor = await prescriptionDoctor(req);
  const favorites = await prisma.prescriptionFavorite.findMany({ where: { doctorId: doctor.id }, include: { drugGeneric: true }, orderBy: { createdAt: "desc" } });
  res.json({ success: true, data: { favorites } });
}));

router.post("/clinical/prescription-favorites", authenticate, requireRole(...prescriberRoles), reverifyRole(...prescriberRoles), wrap(async (req, res) => {
  const body = z.object({
    drugGenericId: z.string().min(1), defaultDose: z.string().trim().min(1).max(80),
    defaultRoute: z.string().trim().min(2).max(60), defaultFrequency: z.string().trim().min(2).max(100),
    defaultDurationDays: z.number().int().min(1).max(365), defaultQuantity: z.string().trim().min(1).max(40),
    instructions: z.string().trim().max(500).optional(),
  }).parse(req.body);
  const [doctor, generic] = await Promise.all([
    prescriptionDoctor(req),
    prisma.drugGeneric.findFirst({ where: { id: body.drugGenericId, tenantId: req.tenantId!, isActive: true }, select: { id: true } }),
  ]);
  if (!generic) throw new AppError(404, "DRUG_NOT_FOUND", "Drug generic not found.");
  const favorite = await prisma.prescriptionFavorite.upsert({
    where: { doctorId_drugGenericId: { doctorId: doctor.id, drugGenericId: generic.id } },
    create: { ...body, doctorId: doctor.id, instructions: body.instructions || null },
    update: { ...body, instructions: body.instructions || null },
  });
  res.status(201).json({ success: true, data: { favorite } });
}));

router.delete("/clinical/prescription-favorites/:id", authenticate, requireRole(...prescriberRoles), reverifyRole(...prescriberRoles), wrap(async (req, res) => {
  const doctor = await prescriptionDoctor(req);
  const deleted = await prisma.prescriptionFavorite.deleteMany({ where: { id: req.params.id, doctorId: doctor.id } });
  if (!deleted.count) throw new AppError(404, "FAVORITE_NOT_FOUND", "Prescription favorite not found.");
  res.json({ success: true, data: { deleted: true } });
}));

router.get("/clinical/prescription-templates", authenticate, requireRole(...prescriberRoles), reverifyRole(...prescriberRoles), wrap(async (req, res) => {
  const doctor = await prescriptionDoctor(req);
  const templates = await prisma.prescriptionTemplate.findMany({ where: { tenantId: req.tenantId!, doctorId: doctor.id }, orderBy: { name: "asc" } });
  res.json({ success: true, data: { templates } });
}));

router.post("/clinical/prescription-templates", authenticate, requireRole(...prescriberRoles), reverifyRole(...prescriberRoles), wrap(async (req, res) => {
  const body = z.object({
    name: z.string().trim().min(2).max(100), specialty: z.string().trim().max(80).optional(),
    diagnosis: z.string().trim().max(250).optional(), items: z.array(dosageSchema).min(1).max(50),
  }).parse(req.body);
  const doctor = await prescriptionDoctor(req);
  const template = await prisma.prescriptionTemplate.create({ data: { ...body, specialty: body.specialty || null, diagnosis: body.diagnosis || null, tenantId: req.tenantId!, doctorId: doctor.id } });
  await audit(req, "PRESCRIPTION_TEMPLATE_CREATED", "PrescriptionTemplate", template.id);
  res.status(201).json({ success: true, data: { template } });
}));

router.post("/clinical/prescriptions/safety-check", authenticate, requireRole(...prescriberRoles), reverifyRole(...prescriberRoles), wrap(async (req, res) => {
  const body = z.object({ patientId: z.string().min(1), drugGenericIds: z.array(z.string().min(1)).min(1).max(50) }).parse(req.body);
  const patient = await prisma.patient.findFirst({ where: { id: body.patientId, tenantId: req.tenantId! }, select: { id: true } });
  if (!patient) throw new AppError(404, "PATIENT_NOT_FOUND", "Patient not found.");
  const result = await evaluateSafety(req.tenantId!, patient.id, body.drugGenericIds);
  res.json({ success: true, data: { warnings: result.warnings } });
}));

router.post("/clinical/patients/:patientId/prescriptions", authenticate, requireRole(...prescriberRoles), reverifyRole(...prescriberRoles), wrap(async (req, res) => {
  const body = prescriptionSchema.parse(req.body);
  const doctor = await prescriptionDoctor(req);
  const patient = await prisma.patient.findFirst({
    where: { id: req.params.patientId, tenantId: req.tenantId!, user: { is: { status: UserStatus.ACTIVE } } },
    include: { user: { select: { id: true, name: true } }, allergies: { select: { substance: true } } },
  });
  if (!patient) throw new AppError(404, "PATIENT_NOT_FOUND", "Patient not found.");
  if (!doctor.registrationNumber) throw new AppError(422, "DOCTOR_REGISTRATION_REQUIRED", "Add your medical registration number before issuing an e-prescription.");
  if (body.encounterId && !await prisma.encounter.findFirst({ where: { id: body.encounterId, tenantId: req.tenantId!, patientId: patient.id, doctorId: doctor.id }, select: { id: true } })) {
    throw new AppError(404, "ENCOUNTER_NOT_FOUND", "Encounter not found for this patient and doctor.");
  }
  const safety = await evaluateSafety(req.tenantId!, patient.id, body.items.map((item) => item.drugGenericId));
  const controlledSchedules = new Set<DrugSchedule>([DrugSchedule.SCHEDULE_H1, DrugSchedule.SCHEDULE_X, DrugSchedule.NDPS]);
  const controlled = safety.drugs.filter((drug) => controlledSchedules.has(drug.schedule));
  if ((safety.warnings.length || controlled.length) && !body.acknowledgeWarnings) {
    throw new AppError(422, "PRESCRIPTION_ACKNOWLEDGEMENT_REQUIRED", "Review and acknowledge allergy, interaction, and controlled-schedule warnings before issuing.", {
      warnings: safety.warnings,
      controlledDrugs: controlled.map((drug) => ({ genericName: drug.genericName, schedule: drug.schedule })),
    });
  }
  const genericById = new Map(safety.drugs.map((drug) => [drug.id, drug]));
  const snapshotItems = await Promise.all(body.items.map(async (item) => {
    const drug = genericById.get(item.drugGenericId);
    if (!drug) throw new AppError(422, "DRUG_NOT_AVAILABLE", "One or more selected drugs are unavailable.");
    const brand = item.drugBrandId ? await prisma.drugBrand.findFirst({ where: { id: item.drugBrandId, tenantId: req.tenantId!, drugGenericId: drug.id, isActive: true } }) : null;
    if (item.drugBrandId && !brand) throw new AppError(422, "DRUG_BRAND_MISMATCH", "Selected brand does not map to the chosen generic drug.");
    return {
      drugGenericId: drug.id, drugBrandId: brand?.id ?? null,
      genericName: drug.genericName, brandName: brand?.brandName ?? null,
      strength: drug.strength, dosageForm: drug.dosageForm, schedule: drug.schedule,
      dose: item.dose, route: item.route, frequency: item.frequency, durationDays: item.durationDays,
      quantity: item.quantity, instructions: item.instructions || null,
    };
  }));
  const issuedAt = new Date();
  const notes = body.notes || null;
  const diagnosis = body.diagnosis || null;
  const signatureDigest = signPrescription({
    tenantId: req.tenantId!, patientId: patient.id, doctorId: doctor.id, encounterId: body.encounterId || null,
    diagnosis, notes, safetyWarnings: safety.warnings, issuedAt, items: snapshotItems,
  });
  const prescription = await prisma.prescription.create({
    data: {
      tenantId: req.tenantId!, patientId: patient.id, doctorId: doctor.id,
      encounterId: body.encounterId || null, status: PrescriptionStatus.ISSUED,
      diagnosis, notes, safetyWarnings: safety.warnings, signatureDigest, issuedAt, signedAt: issuedAt,
      items: { create: snapshotItems },
    },
    include: { items: true, doctor: { include: { user: { select: { name: true } } } } },
  });
  await prisma.clinicalRecord.create({ data: {
    patientId: patient.id, type: "PRESCRIPTION", title: `Prescription ${prescription.id.slice(-8)}`,
    summary: `${prescription.items.length} prescribed item(s)`, status: "ISSUED", occurredAt: issuedAt,
  } });
  await audit(req, "E_PRESCRIPTION_ISSUED", "Prescription", prescription.id);
  res.status(201).json({ success: true, data: { prescription, warnings: safety.warnings } });
}));

router.get("/clinical/prescriptions", authenticate, requireRole(...prescriptionReaders), reverifyRole(...prescriptionReaders), wrap(async (req, res) => {
  const where: import("@prisma/client").Prisma.PrescriptionWhereInput = { tenantId: req.tenantId! };
  if (req.user!.roles.includes(Role.PATIENT)) {
    where.patient = { userId: req.user!.sub };
  } else if (req.user!.roles.includes(Role.DOCTOR) && !req.user!.roles.some((role) => role === Role.ADMIN || role === Role.PHARMACIST)) {
    const doctor = await prisma.doctorProfile.findFirst({ where: { tenantId: req.tenantId!, userId: req.user!.sub }, select: { id: true } });
    if (!doctor) throw new AppError(403, "DOCTOR_PROFILE_REQUIRED", "A doctor profile is required.");
    where.doctorId = doctor.id;
  }
  const prescriptions = await prisma.prescription.findMany({
    where, include: { patient: { select: { mrn: true, user: { select: { name: true } } } }, doctor: { include: { user: { select: { name: true } } } }, items: true },
    orderBy: { issuedAt: "desc" }, take: 200,
  });
  res.json({ success: true, data: { prescriptions } });
}));

router.get("/clinical/prescriptions/:id/pdf", authenticate, requireRole(...prescriptionReaders), reverifyRole(...prescriptionReaders), wrap(async (req, res, next) => {
  try {
    const prescription = await prisma.prescription.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId!, status: PrescriptionStatus.ISSUED },
      include: {
        tenant: { select: { name: true, legalName: true, billingAddress: true } },
        patient: { include: { user: { select: { name: true, email: true } } } },
        doctor: { include: { user: { select: { name: true } } } },
        encounter: { select: { chiefComplaint: true } },
        items: true,
      },
    });
    if (!prescription) throw new AppError(404, "PRESCRIPTION_NOT_FOUND", "Issued prescription not found.");
    const roles = req.user!.roles;
    const isPatient = roles.includes(Role.PATIENT) && prescription.patient.userId === req.user!.sub;
    const isDoctor = roles.includes(Role.DOCTOR) && prescription.doctor.userId === req.user!.sub;
    if (!isPatient && !isDoctor && !roles.some((role) => role === Role.ADMIN || role === Role.PHARMACIST)) throw new AppError(403, "FORBIDDEN", "You cannot access this prescription.");
    if (!verifyPrescriptionSignature(prescription)) {
      throw new AppError(409, "PRESCRIPTION_SIGNATURE_INVALID", "Prescription integrity verification failed.");
    }
    const doc = new PDFDocument({ size: "A4", margin: 48, info: { Title: `Prescription ${prescription.id}`, Author: prescription.doctor.user.name } });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="prescription-${prescription.id}.pdf"`);
    doc.on("error", (error) => { if (res.headersSent) res.destroy(error); else next(error); });
    doc.pipe(res);
    doc.fontSize(20).fillColor("#0e7c86").text(prescription.tenant.legalName || prescription.tenant.name);
    if (prescription.tenant.billingAddress) doc.fontSize(9).fillColor("#5b6f76").text(prescription.tenant.billingAddress);
    doc.moveDown();
    doc.fontSize(16).fillColor("#14262c").text("E-PRESCRIPTION");
    doc.fontSize(10).text(`Issued: ${prescription.issuedAt!.toISOString().slice(0, 10)}`);
    doc.text(`Patient: ${prescription.patient.user.name} · ${prescription.patient.mrn}`);
    if (prescription.patient.user.email) doc.text(`Patient email: ${prescription.patient.user.email}`);
    doc.text(`Prescriber: ${prescription.doctor.user.name}`);
    doc.text(`Medical registration: ${prescription.doctor.registrationNumber || "Not recorded"}`);
    doc.text(`Diagnosis: ${prescription.diagnosis || prescription.encounter?.chiefComplaint || "—"}`);
    const safetyWarnings = Array.isArray(prescription.safetyWarnings) ? prescription.safetyWarnings as { severity?: string; message?: string }[] : [];
    if (safetyWarnings.length) {
      doc.moveDown(0.5).fontSize(9).fillColor("#a15c00").text("Safety warnings reviewed by prescriber:");
      safetyWarnings.forEach((warning) => doc.text(`${warning.severity || "Review"}: ${warning.message || "Clinical safety warning"}`, { indent: 8 }));
    }
    doc.moveDown();
    doc.fontSize(10).fillColor("#5b6f76").text("Medication", 48, doc.y, { width: 190, continued: true });
    doc.text("Dose and route", { width: 120, continued: true });
    doc.text("Schedule", { width: 80, continued: true });
    doc.text("Duration", { align: "right" });
    doc.moveTo(48, doc.y + 4).lineTo(547, doc.y + 4).strokeColor("#dbe4e8").stroke();
    doc.moveDown(0.8).fillColor("#14262c");
    for (const item of prescription.items) {
      doc.fontSize(10).text(`${item.brandName ? `${item.brandName} (${item.genericName})` : item.genericName} ${item.strength} ${item.dosageForm}`, 48, doc.y, { width: 190, continued: true });
      doc.text(`${item.dose} · ${item.route} · ${item.frequency}`, { width: 120, continued: true });
      doc.text(item.schedule.replaceAll("_", " "), { width: 80, continued: true });
      doc.text(`${item.durationDays} days`, { align: "right" });
      doc.fontSize(8).fillColor("#5b6f76").text(`Quantity: ${item.quantity}${item.instructions ? ` · ${item.instructions}` : ""}`, 48);
      doc.moveDown(0.4).fillColor("#14262c");
    }
    if (prescription.notes) { doc.moveDown(0.5); doc.fontSize(10).text(`Notes: ${prescription.notes}`); }
    doc.moveDown(1.5).fontSize(10).text(`Digitally signed by ${prescription.doctor.user.name}`);
    doc.text(`Registration number: ${prescription.doctor.registrationNumber || "Not recorded"}`);
    doc.text(`Signed at: ${prescription.signedAt!.toISOString()}`);
    doc.fontSize(7).fillColor("#5b6f76").text(`Integrity digest (HMAC-SHA256): ${prescription.signatureDigest}`, { width: 499 });
    doc.end();
  } catch (error) { next(error); }
}));

export default router;