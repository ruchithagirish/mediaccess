CREATE TYPE "DrugSchedule" AS ENUM ('UNSCHEDULED', 'SCHEDULE_H', 'SCHEDULE_H1', 'SCHEDULE_X', 'NDPS');
CREATE TYPE "InteractionSeverity" AS ENUM ('MODERATE', 'MAJOR', 'CONTRAINDICATED');
CREATE TYPE "PrescriptionStatus" AS ENUM ('DRAFT', 'ISSUED', 'CANCELLED');
CREATE TYPE "InvestigationDepartment" AS ENUM ('LAB', 'RADIOLOGY', 'AUDIOLOGY');
CREATE TYPE "InvestigationPriority" AS ENUM ('ROUTINE', 'URGENT', 'STAT');
CREATE TYPE "InvestigationStatus" AS ENUM ('ORDERED', 'COLLECTED', 'IN_PROGRESS', 'COMPLETED', 'REPORTED', 'CANCELLED');
CREATE TYPE "ClinicalNotificationType" AS ENUM ('REPORT_READY', 'CRITICAL_RESULT');

ALTER TABLE "DoctorProfile" ADD COLUMN "registrationNumber" TEXT;

CREATE TABLE "DrugGeneric" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "genericName" TEXT NOT NULL,
    "strength" TEXT NOT NULL,
    "dosageForm" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "schedule" "DrugSchedule" NOT NULL DEFAULT 'UNSCHEDULED',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DrugGeneric_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DrugBrand" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "drugGenericId" TEXT NOT NULL,
    "brandName" TEXT NOT NULL,
    "manufacturer" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "DrugBrand_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DrugInteraction" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "drugAId" TEXT NOT NULL,
    "drugBId" TEXT NOT NULL,
    "severity" "InteractionSeverity" NOT NULL,
    "description" TEXT NOT NULL,
    "recommendation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DrugInteraction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Prescription" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "encounterId" TEXT,
    "status" "PrescriptionStatus" NOT NULL DEFAULT 'DRAFT',
    "diagnosis" TEXT,
    "notes" TEXT,
    "safetyWarnings" JSONB,
    "signatureDigest" TEXT,
    "signedAt" TIMESTAMP(3),
    "issuedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Prescription_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PrescriptionItem" (
    "id" TEXT NOT NULL,
    "prescriptionId" TEXT NOT NULL,
    "drugGenericId" TEXT NOT NULL,
    "drugBrandId" TEXT,
    "genericName" TEXT NOT NULL,
    "brandName" TEXT,
    "strength" TEXT NOT NULL,
    "dosageForm" TEXT NOT NULL,
    "schedule" "DrugSchedule" NOT NULL,
    "dose" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "quantity" TEXT NOT NULL,
    "instructions" TEXT,
    CONSTRAINT "PrescriptionItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PrescriptionFavorite" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "drugGenericId" TEXT NOT NULL,
    "defaultDose" TEXT NOT NULL,
    "defaultRoute" TEXT NOT NULL,
    "defaultFrequency" TEXT NOT NULL,
    "defaultDurationDays" INTEGER NOT NULL,
    "defaultQuantity" TEXT NOT NULL,
    "instructions" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PrescriptionFavorite_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PrescriptionTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "specialty" TEXT,
    "diagnosis" TEXT,
    "items" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PrescriptionTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InvestigationTest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "department" "InvestigationDepartment" NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InvestigationTest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InvestigationOrder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "encounterId" TEXT,
    "testId" TEXT NOT NULL,
    "orderedById" TEXT NOT NULL,
    "department" "InvestigationDepartment" NOT NULL,
    "priority" "InvestigationPriority" NOT NULL DEFAULT 'ROUTINE',
    "status" "InvestigationStatus" NOT NULL DEFAULT 'ORDERED',
    "clinicalNotes" TEXT,
    "orderedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InvestigationOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InvestigationReport" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "investigationOrderId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "encounterId" TEXT,
    "uploadedById" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "summary" TEXT,
    "isCritical" BOOLEAN NOT NULL DEFAULT false,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InvestigationReport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClinicalNotification" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "ClinicalNotificationType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),
    CONSTRAINT "ClinicalNotification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DrugGeneric_tenantId_isActive_genericName_idx" ON "DrugGeneric"("tenantId", "isActive", "genericName");
CREATE UNIQUE INDEX "DrugGeneric_tenantId_genericName_strength_dosageForm_route_key" ON "DrugGeneric"("tenantId", "genericName", "strength", "dosageForm", "route");
CREATE INDEX "DrugBrand_tenantId_brandName_idx" ON "DrugBrand"("tenantId", "brandName");
CREATE UNIQUE INDEX "DrugBrand_drugGenericId_brandName_key" ON "DrugBrand"("drugGenericId", "brandName");
CREATE INDEX "DrugInteraction_tenantId_severity_idx" ON "DrugInteraction"("tenantId", "severity");
CREATE UNIQUE INDEX "DrugInteraction_tenantId_drugAId_drugBId_key" ON "DrugInteraction"("tenantId", "drugAId", "drugBId");
CREATE INDEX "Prescription_tenantId_patientId_issuedAt_idx" ON "Prescription"("tenantId", "patientId", "issuedAt");
CREATE INDEX "Prescription_doctorId_createdAt_idx" ON "Prescription"("doctorId", "createdAt");
CREATE INDEX "PrescriptionItem_prescriptionId_idx" ON "PrescriptionItem"("prescriptionId");
CREATE INDEX "PrescriptionFavorite_doctorId_createdAt_idx" ON "PrescriptionFavorite"("doctorId", "createdAt");
CREATE UNIQUE INDEX "PrescriptionFavorite_doctorId_drugGenericId_key" ON "PrescriptionFavorite"("doctorId", "drugGenericId");
CREATE INDEX "PrescriptionTemplate_tenantId_specialty_idx" ON "PrescriptionTemplate"("tenantId", "specialty");
CREATE UNIQUE INDEX "PrescriptionTemplate_doctorId_name_key" ON "PrescriptionTemplate"("doctorId", "name");
CREATE INDEX "InvestigationTest_tenantId_department_isActive_idx" ON "InvestigationTest"("tenantId", "department", "isActive");
CREATE UNIQUE INDEX "InvestigationTest_tenantId_code_key" ON "InvestigationTest"("tenantId", "code");
CREATE INDEX "InvestigationOrder_tenantId_department_status_priority_orde_idx" ON "InvestigationOrder"("tenantId", "department", "status", "priority", "orderedAt");
CREATE INDEX "InvestigationOrder_patientId_orderedAt_idx" ON "InvestigationOrder"("patientId", "orderedAt");
CREATE INDEX "InvestigationOrder_encounterId_idx" ON "InvestigationOrder"("encounterId");
CREATE UNIQUE INDEX "InvestigationReport_objectKey_key" ON "InvestigationReport"("objectKey");
CREATE INDEX "InvestigationReport_tenantId_patientId_uploadedAt_idx" ON "InvestigationReport"("tenantId", "patientId", "uploadedAt");
CREATE INDEX "InvestigationReport_encounterId_idx" ON "InvestigationReport"("encounterId");
CREATE INDEX "ClinicalNotification_tenantId_userId_readAt_createdAt_idx" ON "ClinicalNotification"("tenantId", "userId", "readAt", "createdAt");

ALTER TABLE "DrugGeneric" ADD CONSTRAINT "DrugGeneric_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DrugBrand" ADD CONSTRAINT "DrugBrand_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DrugBrand" ADD CONSTRAINT "DrugBrand_drugGenericId_fkey" FOREIGN KEY ("drugGenericId") REFERENCES "DrugGeneric"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DrugInteraction" ADD CONSTRAINT "DrugInteraction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DrugInteraction" ADD CONSTRAINT "DrugInteraction_drugAId_fkey" FOREIGN KEY ("drugAId") REFERENCES "DrugGeneric"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DrugInteraction" ADD CONSTRAINT "DrugInteraction_drugBId_fkey" FOREIGN KEY ("drugBId") REFERENCES "DrugGeneric"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "DoctorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PrescriptionItem" ADD CONSTRAINT "PrescriptionItem_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "Prescription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PrescriptionItem" ADD CONSTRAINT "PrescriptionItem_drugGenericId_fkey" FOREIGN KEY ("drugGenericId") REFERENCES "DrugGeneric"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PrescriptionItem" ADD CONSTRAINT "PrescriptionItem_drugBrandId_fkey" FOREIGN KEY ("drugBrandId") REFERENCES "DrugBrand"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PrescriptionFavorite" ADD CONSTRAINT "PrescriptionFavorite_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "DoctorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PrescriptionFavorite" ADD CONSTRAINT "PrescriptionFavorite_drugGenericId_fkey" FOREIGN KEY ("drugGenericId") REFERENCES "DrugGeneric"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PrescriptionTemplate" ADD CONSTRAINT "PrescriptionTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PrescriptionTemplate" ADD CONSTRAINT "PrescriptionTemplate_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "DoctorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InvestigationTest" ADD CONSTRAINT "InvestigationTest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvestigationOrder" ADD CONSTRAINT "InvestigationOrder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvestigationOrder" ADD CONSTRAINT "InvestigationOrder_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvestigationOrder" ADD CONSTRAINT "InvestigationOrder_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InvestigationOrder" ADD CONSTRAINT "InvestigationOrder_testId_fkey" FOREIGN KEY ("testId") REFERENCES "InvestigationTest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvestigationOrder" ADD CONSTRAINT "InvestigationOrder_orderedById_fkey" FOREIGN KEY ("orderedById") REFERENCES "DoctorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvestigationReport" ADD CONSTRAINT "InvestigationReport_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvestigationReport" ADD CONSTRAINT "InvestigationReport_investigationOrderId_fkey" FOREIGN KEY ("investigationOrderId") REFERENCES "InvestigationOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InvestigationReport" ADD CONSTRAINT "InvestigationReport_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvestigationReport" ADD CONSTRAINT "InvestigationReport_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ClinicalNotification" ADD CONSTRAINT "ClinicalNotification_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClinicalNotification" ADD CONSTRAINT "ClinicalNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
