CREATE TYPE "ServiceCategory" AS ENUM ('SERVICE', 'PROCEDURE');
CREATE TYPE "TaxTreatment" AS ENUM ('EXEMPT', 'TAXABLE');
CREATE TYPE "PaymentMode" AS ENUM ('CASH', 'CARD', 'UPI', 'BANK_TRANSFER', 'INSURANCE', 'RAZORPAY');
CREATE TYPE "DiscountStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "PaymentAttemptStatus" AS ENUM ('CREATED', 'PAID', 'FAILED');
CREATE TYPE "ReceiptChannel" AS ENUM ('EMAIL', 'WHATSAPP');
CREATE TYPE "ReceiptStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

ALTER TYPE "InvoiceStatus" ADD VALUE 'DISCOUNT_PENDING';
ALTER TYPE "InvoiceStatus" ADD VALUE 'VOID';

ALTER TABLE "Invoice" DROP CONSTRAINT "Invoice_treatmentId_fkey";
ALTER TABLE "Invoice" ADD COLUMN "discountPaise" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "discountPercentBps" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "placeOfSupplyStateCode" TEXT,
ADD COLUMN "taxPaise" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "treatmentId" DROP NOT NULL;

ALTER TABLE "InvoiceLine" ADD COLUMN "cgstPaise" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "discountPaise" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "gstRateBps" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "hsnSacCode" TEXT,
ADD COLUMN "igstPaise" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "serviceItemId" TEXT,
ADD COLUMN "sgstPaise" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "taxTreatment" "TaxTreatment" NOT NULL DEFAULT 'EXEMPT',
ADD COLUMN "taxablePaise" INTEGER NOT NULL DEFAULT 0;

UPDATE "InvoiceLine"
SET "hsnSacCode" = '9993', "taxablePaise" = "lineTotalPaise"
WHERE "hsnSacCode" IS NULL;

ALTER TABLE "Patient" ADD COLUMN "stateCode" TEXT;

CREATE TABLE "ServiceItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" "ServiceCategory" NOT NULL,
    "hsnSacCode" TEXT NOT NULL,
    "unitPricePaise" INTEGER NOT NULL,
    "taxTreatment" "TaxTreatment" NOT NULL DEFAULT 'EXEMPT',
    "gstRateBps" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ServiceItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BillingCounter" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BillingCounter_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DiscountRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "approvedById" TEXT,
    "requestedPaise" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "DiscountStatus" NOT NULL DEFAULT 'PENDING',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    CONSTRAINT "DiscountRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RazorpayOrder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "providerOrderId" TEXT NOT NULL,
    "providerPaymentId" TEXT,
    "amountPaise" INTEGER NOT NULL,
    "status" "PaymentAttemptStatus" NOT NULL DEFAULT 'CREATED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RazorpayOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "counterId" TEXT,
    "recordedById" TEXT NOT NULL,
    "attemptId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "mode" "PaymentMode" NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "reference" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReceiptDelivery" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "channel" "ReceiptChannel" NOT NULL,
    "destination" TEXT NOT NULL,
    "status" "ReceiptStatus" NOT NULL DEFAULT 'PENDING',
    "providerMessageId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReceiptDelivery_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ServiceItem_tenantId_isActive_category_idx" ON "ServiceItem"("tenantId", "isActive", "category");
CREATE UNIQUE INDEX "ServiceItem_tenantId_code_key" ON "ServiceItem"("tenantId", "code");
CREATE INDEX "BillingCounter_tenantId_isActive_idx" ON "BillingCounter"("tenantId", "isActive");
CREATE UNIQUE INDEX "BillingCounter_tenantId_code_key" ON "BillingCounter"("tenantId", "code");
CREATE UNIQUE INDEX "DiscountRequest_invoiceId_key" ON "DiscountRequest"("invoiceId");
CREATE INDEX "DiscountRequest_tenantId_status_requestedAt_idx" ON "DiscountRequest"("tenantId", "status", "requestedAt");
CREATE UNIQUE INDEX "RazorpayOrder_providerOrderId_key" ON "RazorpayOrder"("providerOrderId");
CREATE UNIQUE INDEX "RazorpayOrder_providerPaymentId_key" ON "RazorpayOrder"("providerPaymentId");
CREATE INDEX "RazorpayOrder_tenantId_invoiceId_status_idx" ON "RazorpayOrder"("tenantId", "invoiceId", "status");
CREATE UNIQUE INDEX "RazorpayOrder_tenantId_idempotencyKey_key" ON "RazorpayOrder"("tenantId", "idempotencyKey");
CREATE UNIQUE INDEX "Payment_attemptId_key" ON "Payment"("attemptId");
CREATE INDEX "Payment_tenantId_receivedAt_mode_idx" ON "Payment"("tenantId", "receivedAt", "mode");
CREATE INDEX "Payment_invoiceId_receivedAt_idx" ON "Payment"("invoiceId", "receivedAt");
CREATE UNIQUE INDEX "Payment_tenantId_idempotencyKey_key" ON "Payment"("tenantId", "idempotencyKey");
CREATE UNIQUE INDEX "Payment_tenantId_reference_key" ON "Payment"("tenantId", "reference");
CREATE INDEX "ReceiptDelivery_status_createdAt_idx" ON "ReceiptDelivery"("status", "createdAt");
CREATE UNIQUE INDEX "ReceiptDelivery_paymentId_channel_key" ON "ReceiptDelivery"("paymentId", "channel");

ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_treatmentId_fkey" FOREIGN KEY ("treatmentId") REFERENCES "Treatment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_serviceItemId_fkey" FOREIGN KEY ("serviceItemId") REFERENCES "ServiceItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ServiceItem" ADD CONSTRAINT "ServiceItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BillingCounter" ADD CONSTRAINT "BillingCounter_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DiscountRequest" ADD CONSTRAINT "DiscountRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DiscountRequest" ADD CONSTRAINT "DiscountRequest_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RazorpayOrder" ADD CONSTRAINT "RazorpayOrder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RazorpayOrder" ADD CONSTRAINT "RazorpayOrder_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_counterId_fkey" FOREIGN KEY ("counterId") REFERENCES "BillingCounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "RazorpayOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ReceiptDelivery" ADD CONSTRAINT "ReceiptDelivery_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
