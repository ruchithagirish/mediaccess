CREATE TYPE "AppointmentSource" AS ENUM ('SCHEDULED', 'WALK_IN');

ALTER TABLE "Patient" ADD COLUMN "abhaId" TEXT;

ALTER TABLE "Appointment"
ADD COLUMN "source" "AppointmentSource" NOT NULL DEFAULT 'SCHEDULED';

CREATE UNIQUE INDEX "Patient_tenantId_abhaId_key" ON "Patient"("tenantId", "abhaId");

DROP INDEX "Appointment_active_doctor_slot_key";

CREATE UNIQUE INDEX "Appointment_active_doctor_slot_key"
ON "Appointment"("tenantId", "doctorId", "scheduledFor", "startTime")
WHERE "cancelledAt" IS NULL AND "source" = 'SCHEDULED';