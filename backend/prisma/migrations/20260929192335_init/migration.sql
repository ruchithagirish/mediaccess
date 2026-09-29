-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'RECEPTION', 'DOCTOR', 'NURSE', 'PHARMACIST', 'LAB_TECH', 'ACCOUNTANT', 'PATIENT');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING', 'ACTIVE', 'REJECTED', 'DISABLED');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('BOOKED', 'CHECKED_IN', 'IN_CONSULTATION', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "employeeId" TEXT,
    "passwordHash" TEXT NOT NULL,
    "roles" "Role"[],
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING',
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Patient" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mrn" TEXT NOT NULL,
    "dob" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Patient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoctorProfile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "consultationMinutes" INTEGER NOT NULL DEFAULT 20,
    "isBookable" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DoctorProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Specialty" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Specialty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoctorSpecialty" (
    "doctorId" TEXT NOT NULL,
    "specialtyId" TEXT NOT NULL,

    CONSTRAINT "DoctorSpecialty_pkey" PRIMARY KEY ("doctorId","specialtyId")
);

-- CreateTable
CREATE TABLE "DoctorSchedule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "slotMinutes" INTEGER NOT NULL DEFAULT 20,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "DoctorSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "scheduledFor" DATE NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "reason" TEXT,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'BOOKED',
    "tokenNumber" INTEGER,
    "checkedInAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "family" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE INDEX "User_tenantId_status_idx" ON "User"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "User_tenantId_email_key" ON "User"("tenantId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "User_tenantId_phone_key" ON "User"("tenantId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_userId_key" ON "Patient"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_tenantId_mrn_key" ON "Patient"("tenantId", "mrn");

-- CreateIndex
CREATE UNIQUE INDEX "DoctorProfile_userId_key" ON "DoctorProfile"("userId");

-- CreateIndex
CREATE INDEX "DoctorProfile_tenantId_isBookable_idx" ON "DoctorProfile"("tenantId", "isBookable");

-- CreateIndex
CREATE INDEX "Specialty_tenantId_isActive_idx" ON "Specialty"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Specialty_tenantId_slug_key" ON "Specialty"("tenantId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Specialty_tenantId_name_key" ON "Specialty"("tenantId", "name");

-- CreateIndex
CREATE INDEX "DoctorSpecialty_specialtyId_idx" ON "DoctorSpecialty"("specialtyId");

-- CreateIndex
CREATE INDEX "DoctorSchedule_tenantId_weekday_isActive_idx" ON "DoctorSchedule"("tenantId", "weekday", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "DoctorSchedule_doctorId_weekday_startTime_key" ON "DoctorSchedule"("doctorId", "weekday", "startTime");

-- CreateIndex
CREATE INDEX "Appointment_tenantId_scheduledFor_status_idx" ON "Appointment"("tenantId", "scheduledFor", "status");

-- CreateIndex
CREATE INDEX "Appointment_tenantId_patientId_scheduledFor_idx" ON "Appointment"("tenantId", "patientId", "scheduledFor");

-- CreateIndex
CREATE INDEX "Appointment_tenantId_doctorId_scheduledFor_startTime_idx" ON "Appointment"("tenantId", "doctorId", "scheduledFor", "startTime");

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_tenantId_doctorId_scheduledFor_tokenNumber_key" ON "Appointment"("tenantId", "doctorId", "scheduledFor", "tokenNumber");

CREATE UNIQUE INDEX "Appointment_active_doctor_slot_key" ON "Appointment"("tenantId", "doctorId", "scheduledFor", "startTime") WHERE "cancelledAt" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_family_idx" ON "RefreshToken"("family");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_createdAt_idx" ON "AuditLog"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorProfile" ADD CONSTRAINT "DoctorProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorProfile" ADD CONSTRAINT "DoctorProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Specialty" ADD CONSTRAINT "Specialty_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorSpecialty" ADD CONSTRAINT "DoctorSpecialty_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "DoctorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorSpecialty" ADD CONSTRAINT "DoctorSpecialty_specialtyId_fkey" FOREIGN KEY ("specialtyId") REFERENCES "Specialty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorSchedule" ADD CONSTRAINT "DoctorSchedule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorSchedule" ADD CONSTRAINT "DoctorSchedule_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "DoctorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "DoctorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
