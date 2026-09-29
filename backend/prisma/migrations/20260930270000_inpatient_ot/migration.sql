CREATE TYPE "WardType" AS ENUM ('GENERAL', 'ICU', 'HDU', 'ISOLATION');
CREATE TYPE "BedStatus" AS ENUM ('AVAILABLE', 'OCCUPIED', 'CLEANING', 'OUT_OF_SERVICE');
CREATE TYPE "AdmissionStatus" AS ENUM ('ADMITTED', 'DISCHARGED', 'CANCELLED');
CREATE TYPE "InputOutputType" AS ENUM ('INTAKE', 'OUTPUT');
CREATE TYPE "MedicationAdministrationResult" AS ENUM ('GIVEN', 'REFUSED', 'OMITTED');
CREATE TYPE "OTCaseStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
CREATE TYPE "ChecklistPhase" AS ENUM ('SIGN_IN', 'TIME_OUT', 'SIGN_OUT');

ALTER TABLE "Invoice" ALTER COLUMN "appointmentId" DROP NOT NULL;
ALTER TABLE "Invoice" ADD COLUMN "admissionId" TEXT;
ALTER TABLE "VitalEntry" ADD COLUMN "admissionId" TEXT;

CREATE TABLE "Ward" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "WardType" NOT NULL DEFAULT 'GENERAL',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Ward_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Bed" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "wardId" TEXT NOT NULL,
    "bedNumber" TEXT NOT NULL,
    "status" "BedStatus" NOT NULL DEFAULT 'AVAILABLE',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Bed_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Admission" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "attendingDoctorId" TEXT NOT NULL,
    "bedId" TEXT NOT NULL,
    "admissionNumber" TEXT NOT NULL,
    "diagnosis" TEXT NOT NULL,
    "status" "AdmissionStatus" NOT NULL DEFAULT 'ADMITTED',
    "admittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dischargedAt" TIMESTAMP(3),
    "dischargeSummary" TEXT,
    "dischargeMedications" JSONB,
    "pendingBillAcknowledged" BOOLEAN NOT NULL DEFAULT false,
    "progressVersion" INTEGER NOT NULL DEFAULT 0,
    "followUpAppointmentId" TEXT,
    CONSTRAINT "Admission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BedTransfer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "admissionId" TEXT NOT NULL,
    "fromBedId" TEXT NOT NULL,
    "toBedId" TEXT NOT NULL,
    "transferredById" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BedTransfer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InputOutputEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "admissionId" TEXT NOT NULL,
    "recordedById" TEXT NOT NULL,
    "type" "InputOutputType" NOT NULL,
    "volumeMl" INTEGER NOT NULL,
    "route" TEXT,
    "description" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InputOutputEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InpatientMedicationOrder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "admissionId" TEXT NOT NULL,
    "prescribedById" TEXT NOT NULL,
    "medication" TEXT NOT NULL,
    "dose" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "nextDueAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InpatientMedicationOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MedicationAdministration" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "admissionId" TEXT NOT NULL,
    "medicationOrderId" TEXT NOT NULL,
    "administeredById" TEXT NOT NULL,
    "result" "MedicationAdministrationResult" NOT NULL,
    "reason" TEXT,
    "notes" TEXT,
    "administeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MedicationAdministration_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProgressNote" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "admissionId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProgressNote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Theatre" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Theatre_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProcedureTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "procedureName" TEXT NOT NULL,
    "operativeTemplate" TEXT NOT NULL,
    "anaesthesiaTemplate" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProcedureTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OTCase" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "theatreId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "surgeonId" TEXT NOT NULL,
    "anaesthetistId" TEXT NOT NULL,
    "procedureTemplateId" TEXT,
    "scheduledById" TEXT NOT NULL,
    "procedureName" TEXT NOT NULL,
    "scheduledStart" TIMESTAMP(3) NOT NULL,
    "scheduledEnd" TIMESTAMP(3) NOT NULL,
    "status" "OTCaseStatus" NOT NULL DEFAULT 'SCHEDULED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OTCase_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SurgicalChecklistItem" (
    "id" TEXT NOT NULL,
    "otCaseId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "phase" "ChecklistPhase" NOT NULL,
    "checked" BOOLEAN NOT NULL DEFAULT false,
    "checkedById" TEXT,
    "checkedAt" TIMESTAMP(3),
    CONSTRAINT "SurgicalChecklistItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OperationNote" (
    "id" TEXT NOT NULL,
    "otCaseId" TEXT NOT NULL,
    "procedureTemplateId" TEXT,
    "operativeNote" TEXT NOT NULL,
    "anaesthesiaNote" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OperationNote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Ward_tenantId_code_key" ON "Ward"("tenantId", "code");
CREATE INDEX "Ward_tenantId_isActive_name_idx" ON "Ward"("tenantId", "isActive", "name");
CREATE UNIQUE INDEX "Bed_wardId_bedNumber_key" ON "Bed"("wardId", "bedNumber");
CREATE INDEX "Bed_tenantId_status_isActive_idx" ON "Bed"("tenantId", "status", "isActive");
CREATE UNIQUE INDEX "Admission_tenantId_admissionNumber_key" ON "Admission"("tenantId", "admissionNumber");
CREATE UNIQUE INDEX "Admission_followUpAppointmentId_key" ON "Admission"("followUpAppointmentId");
CREATE INDEX "Admission_tenantId_status_admittedAt_idx" ON "Admission"("tenantId", "status", "admittedAt");
CREATE INDEX "Admission_patientId_admittedAt_idx" ON "Admission"("patientId", "admittedAt");
CREATE INDEX "Admission_bedId_status_idx" ON "Admission"("bedId", "status");
CREATE INDEX "BedTransfer_tenantId_createdAt_idx" ON "BedTransfer"("tenantId", "createdAt");
CREATE INDEX "BedTransfer_admissionId_createdAt_idx" ON "BedTransfer"("admissionId", "createdAt");
CREATE INDEX "InputOutputEntry_admissionId_recordedAt_idx" ON "InputOutputEntry"("admissionId", "recordedAt");
CREATE INDEX "InpatientMedicationOrder_admissionId_isActive_nextDueAt_idx" ON "InpatientMedicationOrder"("admissionId", "isActive", "nextDueAt");
CREATE INDEX "MedicationAdministration_admissionId_administeredAt_idx" ON "MedicationAdministration"("admissionId", "administeredAt");
CREATE INDEX "MedicationAdministration_medicationOrderId_administeredAt_idx" ON "MedicationAdministration"("medicationOrderId", "administeredAt");
CREATE UNIQUE INDEX "ProgressNote_admissionId_version_key" ON "ProgressNote"("admissionId", "version");
CREATE INDEX "ProgressNote_admissionId_createdAt_idx" ON "ProgressNote"("admissionId", "createdAt");
CREATE UNIQUE INDEX "Theatre_tenantId_code_key" ON "Theatre"("tenantId", "code");
CREATE INDEX "Theatre_tenantId_isActive_idx" ON "Theatre"("tenantId", "isActive");
CREATE UNIQUE INDEX "ProcedureTemplate_tenantId_name_key" ON "ProcedureTemplate"("tenantId", "name");
CREATE INDEX "ProcedureTemplate_tenantId_isActive_name_idx" ON "ProcedureTemplate"("tenantId", "isActive", "name");
CREATE INDEX "OTCase_tenantId_scheduledStart_status_idx" ON "OTCase"("tenantId", "scheduledStart", "status");
CREATE INDEX "OTCase_theatreId_scheduledStart_scheduledEnd_idx" ON "OTCase"("theatreId", "scheduledStart", "scheduledEnd");
CREATE INDEX "OTCase_surgeonId_scheduledStart_scheduledEnd_idx" ON "OTCase"("surgeonId", "scheduledStart", "scheduledEnd");
CREATE INDEX "OTCase_anaesthetistId_scheduledStart_scheduledEnd_idx" ON "OTCase"("anaesthetistId", "scheduledStart", "scheduledEnd");
CREATE UNIQUE INDEX "SurgicalChecklistItem_otCaseId_key_key" ON "SurgicalChecklistItem"("otCaseId", "key");
CREATE INDEX "SurgicalChecklistItem_otCaseId_phase_checked_idx" ON "SurgicalChecklistItem"("otCaseId", "phase", "checked");
CREATE UNIQUE INDEX "OperationNote_otCaseId_key" ON "OperationNote"("otCaseId");
CREATE UNIQUE INDEX "Invoice_admissionId_key" ON "Invoice"("admissionId");
CREATE INDEX "VitalEntry_admissionId_idx" ON "VitalEntry"("admissionId");

ALTER TABLE "Ward" ADD CONSTRAINT "Ward_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Bed" ADD CONSTRAINT "Bed_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Bed" ADD CONSTRAINT "Bed_wardId_fkey" FOREIGN KEY ("wardId") REFERENCES "Ward"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_attendingDoctorId_fkey" FOREIGN KEY ("attendingDoctorId") REFERENCES "DoctorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_bedId_fkey" FOREIGN KEY ("bedId") REFERENCES "Bed"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_followUpAppointmentId_fkey" FOREIGN KEY ("followUpAppointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "Admission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VitalEntry" ADD CONSTRAINT "VitalEntry_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "Admission"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BedTransfer" ADD CONSTRAINT "BedTransfer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BedTransfer" ADD CONSTRAINT "BedTransfer_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "Admission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BedTransfer" ADD CONSTRAINT "BedTransfer_fromBedId_fkey" FOREIGN KEY ("fromBedId") REFERENCES "Bed"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BedTransfer" ADD CONSTRAINT "BedTransfer_toBedId_fkey" FOREIGN KEY ("toBedId") REFERENCES "Bed"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BedTransfer" ADD CONSTRAINT "BedTransfer_transferredById_fkey" FOREIGN KEY ("transferredById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InputOutputEntry" ADD CONSTRAINT "InputOutputEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InputOutputEntry" ADD CONSTRAINT "InputOutputEntry_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "Admission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InputOutputEntry" ADD CONSTRAINT "InputOutputEntry_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InpatientMedicationOrder" ADD CONSTRAINT "InpatientMedicationOrder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InpatientMedicationOrder" ADD CONSTRAINT "InpatientMedicationOrder_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "Admission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InpatientMedicationOrder" ADD CONSTRAINT "InpatientMedicationOrder_prescribedById_fkey" FOREIGN KEY ("prescribedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MedicationAdministration" ADD CONSTRAINT "MedicationAdministration_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MedicationAdministration" ADD CONSTRAINT "MedicationAdministration_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "Admission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MedicationAdministration" ADD CONSTRAINT "MedicationAdministration_medicationOrderId_fkey" FOREIGN KEY ("medicationOrderId") REFERENCES "InpatientMedicationOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MedicationAdministration" ADD CONSTRAINT "MedicationAdministration_administeredById_fkey" FOREIGN KEY ("administeredById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProgressNote" ADD CONSTRAINT "ProgressNote_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProgressNote" ADD CONSTRAINT "ProgressNote_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "Admission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProgressNote" ADD CONSTRAINT "ProgressNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Theatre" ADD CONSTRAINT "Theatre_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProcedureTemplate" ADD CONSTRAINT "ProcedureTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OTCase" ADD CONSTRAINT "OTCase_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OTCase" ADD CONSTRAINT "OTCase_theatreId_fkey" FOREIGN KEY ("theatreId") REFERENCES "Theatre"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OTCase" ADD CONSTRAINT "OTCase_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OTCase" ADD CONSTRAINT "OTCase_surgeonId_fkey" FOREIGN KEY ("surgeonId") REFERENCES "DoctorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OTCase" ADD CONSTRAINT "OTCase_anaesthetistId_fkey" FOREIGN KEY ("anaesthetistId") REFERENCES "DoctorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OTCase" ADD CONSTRAINT "OTCase_procedureTemplateId_fkey" FOREIGN KEY ("procedureTemplateId") REFERENCES "ProcedureTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OTCase" ADD CONSTRAINT "OTCase_scheduledById_fkey" FOREIGN KEY ("scheduledById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SurgicalChecklistItem" ADD CONSTRAINT "SurgicalChecklistItem_otCaseId_fkey" FOREIGN KEY ("otCaseId") REFERENCES "OTCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SurgicalChecklistItem" ADD CONSTRAINT "SurgicalChecklistItem_checkedById_fkey" FOREIGN KEY ("checkedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OperationNote" ADD CONSTRAINT "OperationNote_otCaseId_fkey" FOREIGN KEY ("otCaseId") REFERENCES "OTCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OperationNote" ADD CONSTRAINT "OperationNote_procedureTemplateId_fkey" FOREIGN KEY ("procedureTemplateId") REFERENCES "ProcedureTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
