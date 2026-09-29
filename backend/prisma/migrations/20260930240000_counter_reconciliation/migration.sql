CREATE TABLE "CounterReconciliation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "counterId" TEXT NOT NULL,
    "closedById" TEXT NOT NULL,
    "workDate" DATE NOT NULL,
    "expectedPaise" INTEGER NOT NULL,
    "countedPaise" INTEGER NOT NULL,
    "variancePaise" INTEGER NOT NULL,
    "note" TEXT,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CounterReconciliation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CounterReconciliation_tenantId_workDate_idx" ON "CounterReconciliation"("tenantId", "workDate");
CREATE UNIQUE INDEX "CounterReconciliation_tenantId_counterId_workDate_key" ON "CounterReconciliation"("tenantId", "counterId", "workDate");

ALTER TABLE "CounterReconciliation" ADD CONSTRAINT "CounterReconciliation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CounterReconciliation" ADD CONSTRAINT "CounterReconciliation_counterId_fkey" FOREIGN KEY ("counterId") REFERENCES "BillingCounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
