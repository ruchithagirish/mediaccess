CREATE TYPE "DispenseStatus" AS ENUM ('PARTIAL', 'COMPLETE');
CREATE TYPE "InventoryMovementType" AS ENUM ('RECEIPT', 'DISPENSE', 'ADJUSTMENT');

ALTER TYPE "PrescriptionStatus" ADD VALUE 'PARTIALLY_DISPENSED';
ALTER TYPE "PrescriptionStatus" ADD VALUE 'DISPENSED';

ALTER TABLE "PrescriptionItem" ADD COLUMN "dispensedQuantity" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "drugGenericId" TEXT NOT NULL,
    "reorderLevel" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "InventoryBatch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "batchNumber" TEXT NOT NULL,
    "expiryDate" DATE NOT NULL,
    "quantityOnHand" INTEGER NOT NULL,
    "unitCostPaise" INTEGER,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryBatch_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "InventoryMovement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "recordedById" TEXT NOT NULL,
    "type" "InventoryMovementType" NOT NULL,
    "quantityDelta" INTEGER NOT NULL,
    "referenceId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Dispense" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "prescriptionId" TEXT NOT NULL,
    "pharmacistId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" "DispenseStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Dispense_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "DispenseLine" (
    "id" TEXT NOT NULL,
    "dispenseId" TEXT NOT NULL,
    "prescriptionItemId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "substitutionReason" TEXT,
    CONSTRAINT "DispenseLine_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InventoryItem_tenantId_isActive_idx" ON "InventoryItem"("tenantId", "isActive");
CREATE UNIQUE INDEX "InventoryItem_tenantId_drugGenericId_key" ON "InventoryItem"("tenantId", "drugGenericId");
CREATE INDEX "InventoryBatch_tenantId_expiryDate_quantityOnHand_idx" ON "InventoryBatch"("tenantId", "expiryDate", "quantityOnHand");
CREATE INDEX "InventoryBatch_inventoryItemId_expiryDate_idx" ON "InventoryBatch"("inventoryItemId", "expiryDate");
CREATE UNIQUE INDEX "InventoryBatch_inventoryItemId_batchNumber_key" ON "InventoryBatch"("inventoryItemId", "batchNumber");
CREATE INDEX "InventoryMovement_tenantId_createdAt_idx" ON "InventoryMovement"("tenantId", "createdAt");
CREATE INDEX "InventoryMovement_batchId_createdAt_idx" ON "InventoryMovement"("batchId", "createdAt");
CREATE INDEX "Dispense_tenantId_createdAt_idx" ON "Dispense"("tenantId", "createdAt");
CREATE INDEX "Dispense_prescriptionId_createdAt_idx" ON "Dispense"("prescriptionId", "createdAt");
CREATE UNIQUE INDEX "Dispense_tenantId_idempotencyKey_key" ON "Dispense"("tenantId", "idempotencyKey");
CREATE INDEX "DispenseLine_dispenseId_idx" ON "DispenseLine"("dispenseId");
CREATE INDEX "DispenseLine_prescriptionItemId_idx" ON "DispenseLine"("prescriptionItemId");

ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_drugGenericId_fkey" FOREIGN KEY ("drugGenericId") REFERENCES "DrugGeneric"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryBatch" ADD CONSTRAINT "InventoryBatch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryBatch" ADD CONSTRAINT "InventoryBatch_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "InventoryBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Dispense" ADD CONSTRAINT "Dispense_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Dispense" ADD CONSTRAINT "Dispense_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "Prescription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Dispense" ADD CONSTRAINT "Dispense_pharmacistId_fkey" FOREIGN KEY ("pharmacistId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DispenseLine" ADD CONSTRAINT "DispenseLine_dispenseId_fkey" FOREIGN KEY ("dispenseId") REFERENCES "Dispense"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DispenseLine" ADD CONSTRAINT "DispenseLine_prescriptionItemId_fkey" FOREIGN KEY ("prescriptionItemId") REFERENCES "PrescriptionItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DispenseLine" ADD CONSTRAINT "DispenseLine_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "InventoryBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
