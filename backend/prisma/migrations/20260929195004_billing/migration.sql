-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('ISSUED');

-- CreateTable
CREATE TABLE "Treatment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Treatment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TreatmentItem" (
    "id" TEXT NOT NULL,
    "treatmentId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPricePaise" INTEGER NOT NULL,

    CONSTRAINT "TreatmentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "treatmentId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "subtotalPaise" INTEGER NOT NULL,
    "totalPaise" INTEGER NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'ISSUED',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLine" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPricePaise" INTEGER NOT NULL,
    "lineTotalPaise" INTEGER NOT NULL,

    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Treatment_appointmentId_key" ON "Treatment"("appointmentId");

-- CreateIndex
CREATE INDEX "Treatment_tenantId_completedAt_idx" ON "Treatment"("tenantId", "completedAt");

-- CreateIndex
CREATE INDEX "TreatmentItem_treatmentId_idx" ON "TreatmentItem"("treatmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_appointmentId_key" ON "Invoice"("appointmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_treatmentId_key" ON "Invoice"("treatmentId");

-- CreateIndex
CREATE INDEX "Invoice_tenantId_patientId_issuedAt_idx" ON "Invoice"("tenantId", "patientId", "issuedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_tenantId_invoiceNumber_key" ON "Invoice"("tenantId", "invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_tenantId_sequence_key" ON "Invoice"("tenantId", "sequence");

-- CreateIndex
CREATE INDEX "InvoiceLine_invoiceId_idx" ON "InvoiceLine"("invoiceId");

-- AddForeignKey
ALTER TABLE "Treatment" ADD CONSTRAINT "Treatment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Treatment" ADD CONSTRAINT "Treatment_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Treatment" ADD CONSTRAINT "Treatment_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "DoctorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentItem" ADD CONSTRAINT "TreatmentItem_treatmentId_fkey" FOREIGN KEY ("treatmentId") REFERENCES "Treatment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_treatmentId_fkey" FOREIGN KEY ("treatmentId") REFERENCES "Treatment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
