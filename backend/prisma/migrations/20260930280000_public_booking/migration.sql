CREATE TABLE "PublicBookingVerification" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "dob" DATE NOT NULL,
    "doctorId" TEXT NOT NULL,
    "scheduledFor" DATE NOT NULL,
    "startTime" TEXT NOT NULL,
    "reason" TEXT,
    "otpHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PublicBookingVerification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PublicBookingVerification_tenantId_phone_createdAt_idx" ON "PublicBookingVerification"("tenantId", "phone", "createdAt");
CREATE INDEX "PublicBookingVerification_expiresAt_idx" ON "PublicBookingVerification"("expiresAt");

ALTER TABLE "PublicBookingVerification" ADD CONSTRAINT "PublicBookingVerification_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PublicBookingVerification" ADD CONSTRAINT "PublicBookingVerification_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "DoctorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;