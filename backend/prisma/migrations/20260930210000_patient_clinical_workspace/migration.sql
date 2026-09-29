CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE "Patient"
ADD COLUMN "sex" TEXT,
ADD COLUMN "address" TEXT;

CREATE TYPE "ClinicalRecordType" AS ENUM ('PRESCRIPTION', 'REPORT', 'ADMISSION');

CREATE TABLE "PatientAllergy" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "substance" TEXT NOT NULL,
    "reaction" TEXT,
    "severity" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PatientAllergy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PatientInsurance" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "policyNumber" TEXT NOT NULL,
    "memberId" TEXT,
    "coverageStart" TIMESTAMP(3),
    "coverageEnd" TIMESTAMP(3),
    CONSTRAINT "PatientInsurance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmergencyContact" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    CONSTRAINT "EmergencyContact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Encounter" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "specialty" TEXT,
    "chiefComplaint" TEXT NOT NULL,
    "subjective" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "assessment" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "icd10Code" TEXT,
    "diagnosis" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Encounter_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VitalEntry" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "enteredById" TEXT NOT NULL,
    "systolic" DOUBLE PRECISION,
    "diastolic" DOUBLE PRECISION,
    "pulse" DOUBLE PRECISION,
    "temperature" DOUBLE PRECISION,
    "respiratoryRate" DOUBLE PRECISION,
    "oxygenSaturation" DOUBLE PRECISION,
    "height" DOUBLE PRECISION,
    "weight" DOUBLE PRECISION,
    "abnormal" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VitalEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClinicalRecord" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "type" "ClinicalRecordType" NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "status" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClinicalRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "User_name_trgm_idx" ON "User" USING GIN ("name" gin_trgm_ops);
CREATE INDEX "User_email_trgm_idx" ON "User" USING GIN ("email" gin_trgm_ops);
CREATE INDEX "User_phone_trgm_idx" ON "User" USING GIN ("phone" gin_trgm_ops);
CREATE INDEX "Patient_mrn_trgm_idx" ON "Patient" USING GIN ("mrn" gin_trgm_ops);
CREATE INDEX "PatientAllergy_patientId_idx" ON "PatientAllergy"("patientId");
CREATE INDEX "PatientInsurance_patientId_idx" ON "PatientInsurance"("patientId");
CREATE INDEX "EmergencyContact_patientId_idx" ON "EmergencyContact"("patientId");
CREATE INDEX "Encounter_tenantId_patientId_createdAt_idx" ON "Encounter"("tenantId", "patientId", "createdAt");
CREATE INDEX "Encounter_doctorId_createdAt_idx" ON "Encounter"("doctorId", "createdAt");
CREATE INDEX "VitalEntry_patientId_recordedAt_idx" ON "VitalEntry"("patientId", "recordedAt");
CREATE INDEX "ClinicalRecord_patientId_occurredAt_idx" ON "ClinicalRecord"("patientId", "occurredAt");

ALTER TABLE "PatientAllergy" ADD CONSTRAINT "PatientAllergy_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PatientInsurance" ADD CONSTRAINT "PatientInsurance_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmergencyContact" ADD CONSTRAINT "EmergencyContact_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "DoctorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VitalEntry" ADD CONSTRAINT "VitalEntry_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VitalEntry" ADD CONSTRAINT "VitalEntry_enteredById_fkey" FOREIGN KEY ("enteredById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClinicalRecord" ADD CONSTRAINT "ClinicalRecord_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
