import crypto from "crypto";
import bcrypt from "bcryptjs";
import { AppointmentSource, AppointmentStatus, Prisma, Role, UserStatus } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middleware/auth";
import { reverifyRole } from "../../middleware/rbac";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../lib/errors";
import { wrap } from "../../lib/async";
import { audit } from "../../middleware/audit";
import { notifyQueueChanged } from "../../lib/queue-events";

const router = Router();
const receptionistRoles = [Role.RECEPTION, Role.ADMIN];
router.use(authenticate, reverifyRole(...receptionistRoles));

const patientSchema = z.object({
  name: z.string().trim().min(3).max(100),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().transform((value) => value.replace(/\D/g, "").slice(-10)).refine((value) => /^[6-9]\d{9}$/.test(value)),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value && date < new Date();
  }),
  abhaId: z.union([z.literal(""), z.string().trim().regex(/^\d{14}$/, "ABHA ID must be 14 digits.")]).optional(),
  password: z.string().min(8).max(128).refine((value) => /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value)),
  consent: z.literal(true, { errorMap: () => ({ message: "Patient consent is required." }) }),
});

const walkInSchema = z.object({ patientId: z.string().min(1), doctorId: z.string().min(1), reason: z.string().trim().max(500).optional() });
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const calendarDate = (value: string) => new Date(`${value}T00:00:00.000Z`);

function clinicNow(timezone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)!.value;
  return { date: `${part("year")}-${part("month")}-${part("day")}`, time: `${part("hour")}:${part("minute")}` };
}

router.get("/patients", wrap(async (req, res) => {
  const { search } = z.object({ search: z.string().trim().max(100).optional() }).parse(req.query);
  const patients = await prisma.patient.findMany({
    where: {
      tenantId: req.tenantId!,
      user: { is: { status: UserStatus.ACTIVE } },
      ...(search && {
        OR: [
          { mrn: { contains: search, mode: "insensitive" } },
          { abhaId: { equals: search } },
          {
            user: {
              is: {
                OR: [
                  { name: { contains: search, mode: "insensitive" } },
                  { email: { contains: search, mode: "insensitive" } },
                  { phone: { contains: search } },
                ],
              },
            },
          },
        ],
      }),
    },
    select: { id: true, mrn: true, abhaId: true, dob: true, user: { select: { name: true, email: true, phone: true } } },
    orderBy: { createdAt: "desc" },
    take: 25,
  });
  res.json({ success: true, data: { patients: patients.map((patient) => ({
    id: patient.id, mrn: patient.mrn, abhaId: patient.abhaId, dob: patient.dob.toISOString().slice(0, 10),
    name: patient.user.name, email: patient.user.email, phone: patient.user.phone,
  })) } });
}));

router.post("/patients", wrap(async (req, res) => {
  const body = patientSchema.parse(req.body);
  const tenantId = req.tenantId!;
  const abhaId = body.abhaId || null;
  const duplicateUser = await prisma.user.findFirst({
    where: { tenantId, OR: [{ email: body.email }, { phone: body.phone }] }, select: { id: true },
  });
  if (duplicateUser) throw new AppError(409, "PATIENT_EXISTS", "A patient with this email or mobile number is already registered.");
  if (abhaId && await prisma.patient.findFirst({ where: { tenantId, abhaId }, select: { id: true } })) {
    throw new AppError(409, "ABHA_EXISTS", "A patient with this ABHA ID is already registered.");
  }

  const mrn = `MA-${crypto.randomBytes(6).toString("hex").toUpperCase()}`;
  try {
    const user = await prisma.user.create({
      data: {
        tenantId, name: body.name, email: body.email, phone: body.phone,
        passwordHash: await bcrypt.hash(body.password, 12), roles: [Role.PATIENT], status: UserStatus.ACTIVE,
        patient: { create: { tenantId, mrn, dob: new Date(body.dob), abhaId } },
      },
      select: {
        id: true, name: true, email: true, phone: true,
        patient: { select: { id: true, mrn: true, abhaId: true, dob: true } },
      },
    });
    if (!user.patient) throw new AppError(500, "PATIENT_CREATE_FAILED", "Patient registration failed.");
    await audit(req, "PATIENT_REGISTERED_BY_RECEPTION", "Patient", user.patient.id, user.id);
    res.status(201).json({ success: true, data: { patient: {
      id: user.patient.id, userId: user.id, name: user.name, email: user.email, phone: user.phone,
      mrn: user.patient.mrn, abhaId: user.patient.abhaId, dob: user.patient.dob.toISOString().slice(0, 10),
    } } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError(409, "PATIENT_EXISTS", "A patient with these details is already registered.");
    }
    throw error;
  }
}));

router.post("/walk-ins", wrap(async (req, res) => {
  const body = walkInSchema.parse(req.body);
  const [patient, doctor, tenant] = await Promise.all([
    prisma.patient.findFirst({
      where: { id: body.patientId, tenantId: req.tenantId!, user: { is: { status: UserStatus.ACTIVE, roles: { has: Role.PATIENT } } } },
      select: { id: true },
    }),
    prisma.doctorProfile.findFirst({
      where: { id: body.doctorId, tenantId: req.tenantId!, isBookable: true, user: { is: { status: UserStatus.ACTIVE, roles: { has: Role.DOCTOR } } } },
      select: { id: true, consultationMinutes: true },
    }),
    prisma.tenant.findUnique({ where: { id: req.tenantId! }, select: { timezone: true } }),
  ]);
  if (!patient) throw new AppError(404, "PATIENT_NOT_FOUND", "Patient not found.");
  if (!doctor) throw new AppError(404, "DOCTOR_NOT_FOUND", "Doctor is not available.");
  const now = clinicNow(tenant?.timezone ?? "Asia/Kolkata");
  const startMinutes = Number(now.time.slice(0, 2)) * 60 + Number(now.time.slice(3));
  const endTime = `${String(Math.floor(Math.min(startMinutes + doctor.consultationMinutes, 1439) / 60)).padStart(2, "0")}:${String(Math.min(startMinutes + doctor.consultationMinutes, 1439) % 60).padStart(2, "0")}`;

  const appointment = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "DoctorProfile" WHERE "id" = ${doctor.id} FOR UPDATE`;
    const latest = await tx.appointment.aggregate({
      where: { tenantId: req.tenantId!, doctorId: doctor.id, scheduledFor: calendarDate(now.date) },
      _max: { tokenNumber: true },
    });
    return tx.appointment.create({
      data: {
        tenantId: req.tenantId!, patientId: patient.id, doctorId: doctor.id,
        scheduledFor: calendarDate(now.date), startTime: now.time, endTime,
        reason: body.reason || "Walk-in", status: AppointmentStatus.CHECKED_IN,
        source: AppointmentSource.WALK_IN, checkedInAt: new Date(), tokenNumber: (latest._max.tokenNumber ?? 0) + 1,
      },
      include: {
        patient: { select: { id: true, mrn: true, user: { select: { name: true } } } },
        doctor: {
          select: {
            id: true,
            user: { select: { name: true } },
            specialties: { select: { specialty: { select: { id: true, name: true, slug: true } } } },
          },
        },
      },
    });
  });

  await audit(req, "WALK_IN_CHECKED_IN", "Appointment", appointment.id);
  notifyQueueChanged(req.tenantId!);
  res.status(201).json({ success: true, data: { appointment: {
    id: appointment.id, date: appointment.scheduledFor.toISOString().slice(0, 10),
    startTime: appointment.startTime, endTime: appointment.endTime, reason: appointment.reason,
    status: appointment.status, source: appointment.source, tokenNumber: appointment.tokenNumber, checkedInAt: appointment.checkedInAt,
    patient: { id: appointment.patient.id, name: appointment.patient.user.name, mrn: appointment.patient.mrn },
    doctor: { id: appointment.doctor.id, name: appointment.doctor.user.name, specialties: appointment.doctor.specialties.map(({ specialty }) => specialty) },
  } } });
}));

router.get("/queue", wrap(async (req, res) => {
  const query = z.object({ date: dateSchema.optional(), doctorId: z.string().optional() }).parse(req.query);
  const tenant = await prisma.tenant.findUnique({ where: { id: req.tenantId! }, select: { timezone: true } });
  const today = query.date ?? clinicNow(tenant?.timezone ?? "Asia/Kolkata").date;
  const queue = await prisma.appointment.findMany({
    where: {
      tenantId: req.tenantId!, scheduledFor: calendarDate(today), cancelledAt: null,
      status: { in: [AppointmentStatus.CHECKED_IN, AppointmentStatus.IN_CONSULTATION] },
      ...(query.doctorId ? { doctorId: query.doctorId } : {}),
    },
    include: {
      patient: { select: { id: true, mrn: true, user: { select: { name: true } } } },
      doctor: { select: { id: true, user: { select: { name: true } } } },
    },
    orderBy: [{ tokenNumber: "asc" }, { checkedInAt: "asc" }],
    take: 300,
  });
  res.json({ success: true, data: { date: today, queue: queue.map((appointment) => ({
    id: appointment.id, tokenNumber: appointment.tokenNumber, source: appointment.source,
    status: appointment.status, checkedInAt: appointment.checkedInAt,
    patient: { id: appointment.patient.id, name: appointment.patient.user.name, mrn: appointment.patient.mrn },
    doctor: { id: appointment.doctor.id, name: appointment.doctor.user.name },
  })) } });
}));

export default router;