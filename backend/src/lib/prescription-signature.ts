import crypto from "crypto";
import { DrugSchedule } from "@prisma/client";
import { config } from "../config";

type SignatureItem = {
  drugGenericId: string; drugBrandId: string | null; genericName: string; brandName: string | null;
  strength: string; dosageForm: string; schedule: DrugSchedule; dose: string; route: string;
  frequency: string; durationDays: number; quantity: string; instructions: string | null;
};

type SignaturePayload = {
  tenantId: string; patientId: string; doctorId: string; encounterId: string | null;
  diagnosis: string | null; notes: string | null; safetyWarnings: unknown; issuedAt: Date;
  items: SignatureItem[];
};

type SignedPrescription = Omit<SignaturePayload, "issuedAt"> & {
  issuedAt: Date | null; signedAt: Date | null; signatureDigest: string | null;
};

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, stableValue(item)]));
  }
  return value;
}

function canonicalSignature(input: SignaturePayload) {
  const items = input.items.map((item) => ({
    drugGenericId: item.drugGenericId, drugBrandId: item.drugBrandId, genericName: item.genericName,
    brandName: item.brandName, strength: item.strength, dosageForm: item.dosageForm, schedule: item.schedule,
    dose: item.dose, route: item.route, frequency: item.frequency, durationDays: item.durationDays,
    quantity: item.quantity, instructions: item.instructions,
  })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return JSON.stringify(stableValue({
    tenantId: input.tenantId, patientId: input.patientId, doctorId: input.doctorId,
    encounterId: input.encounterId, diagnosis: input.diagnosis, notes: input.notes,
    safetyWarnings: input.safetyWarnings, issuedAt: input.issuedAt.toISOString(), items,
  }));
}

export function signPrescription(input: SignaturePayload) {
  return crypto.createHmac("sha256", process.env.PRESCRIPTION_SIGNING_SECRET ?? config.jwtAccessSecret).update(canonicalSignature(input)).digest("hex");
}

export function verifyPrescriptionSignature(prescription: SignedPrescription) {
  if (!prescription.issuedAt || !prescription.signedAt || !prescription.signatureDigest) return false;
  const expected = Buffer.from(signPrescription({ ...prescription, issuedAt: prescription.issuedAt }), "hex");
  const stored = Buffer.from(prescription.signatureDigest, "hex");
  return expected.length === stored.length && crypto.timingSafeEqual(expected, stored);
}