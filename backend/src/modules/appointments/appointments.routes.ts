import { Router, type RequestHandler } from "express";
import { AppointmentStatus, Prisma, Role, UserStatus } from "@prisma/client";
import { z } from "zod";
import { authenticate, requireRole } from "../../middleware/auth";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../lib/errors";
import { wrap } from "../../lib/async";
import { audit } from "../../lib/audit";
import { notifyQueueChanged } from "../../lib/queue-events";

const router = Router();
const appointmentRoles = [Role.PATIENT, Role.RECEPTION, Role.DOCTOR, Role.ADMIN];
const verifyCurrentRoles: RequestHandler = async (req, _res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.sub },
      select: { tenantId: true, roles: true, status: true },
    });
    if (!user || user.tenantId !== req.tenantId || user.status !== UserStatus.ACTIVE) {
      throw new AppError(401, "UNAUTHENTICATED", "Please sign in.");
    }
    if (!appointmentRoles.some((role) => user.roles.includes(role))) {
      throw new AppError(403, "FORBIDDEN", "You do not have permission to manage appointments.");
    }
    req.user = { ...req.user!, roles: user.roles, tid: user.tenantId };
    next();
  } catch (error) {
    next(error);
  }
};
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Enter a valid date.");
const timeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Choose a valid appointment time.");

const appointmentInclude = {
  patient: { select: { id: true, mrn: true, user: { select: { name: true } } } },
  doctor: {
    select: {
      id: true,
      user: { select: { name: true } },
      specialties: { select: { specialty: { select: { id: true, name: true, slug: true } } } },
    },
  },
} satisfies Prisma.AppointmentInclude;

type AppointmentRecord = Prisma.AppointmentGetPayload<{ include: typeof appointmentInclude }>;

const serializeAppointment = (appointment: AppointmentRecord) => ({
  id: appointment.id,
  date: appointment.scheduledFor.toISOString().slice(0, 10),
  startTime: appointment.startTime,
  endTime: appointment.endTime,
  reason: appointment.reason,
  status: appointment.status,
  source: appointment.source,
  tokenNumber: appointment.tokenNumber,
  checkedInAt: appointment.checkedInAt,
  patient: { id: appointment.patient.id, name: appointment.patient.user.name, mrn: appointment.patient.mrn },
  doctor: {
    id: appointment.doctor.id,
    name: appointment.doctor.user.name,
    specialties: appointment.doctor.specialties.map(({ specialty }) => specialty),
  },
});

const calendarDate = (date: string) => new Date(`${date}T00:00:00.000Z`);
const minutes = (time: string) => {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
};
const clock = (value: number) => `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;

async function tenantClock(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { timezone: true } });
  const timezone = tenant?.timezone ?? "Asia/Kolkata";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)!.value;
  return { date: `${part("year")}-${part("month")}-${part("day")}`, time: `${part("hour")}:${part("minute")}` };
}

async function doctorForBooking(tenantId: string, doctorId: string) {
  const doctor = await prisma.doctorProfile.findFirst({
    where: {
      id: doctorId,
      tenantId,
      isBookable: true,
      user: { is: { status: UserStatus.ACTIVE, roles: { has: Role.DOCTOR } } },
    },
    include: { schedules: { where: { isActive: true } } },
  });
  if (!doctor) throw new AppError(404, "DOCTOR_NOT_FOUND", "This doctor is not available for booking.");
  return doctor;
}

async function slotsForDoctor(tenantId: string, doctorId: string, date: string, excludeId?: string) {
  const doctor = await doctorForBooking(tenantId, doctorId);
  const weekday = calendarDate(date).getUTCDay();
  const schedules = doctor.schedules.filter((schedule) => schedule.weekday === weekday);
  if (!schedules.length) return [];

  const busy = await prisma.appointment.findMany({
    where: {
      tenantId,
      doctorId,
      scheduledFor: calendarDate(date),
      cancelledAt: null,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { startTime: true },
  });
  const occupied = new Set(busy.map((appointment) => appointment.startTime));
  const now = await tenantClock(tenantId);
  const available = new Map<string, { startTime: string; endTime: string }>();

  for (const schedule of schedules) {
    const start = minutes(schedule.startTime);
    const end = minutes(schedule.endTime);
    for (let cursor = start; cursor + schedule.slotMinutes <= end; cursor += schedule.slotMinutes) {
      const startTime = clock(cursor);
      if (occupied.has(startTime) || date < now.date || (date === now.date && startTime <= now.time)) continue;
      available.set(startTime, { startTime, endTime: clock(cursor + schedule.slotMinutes) });
    }
  }

  return [...available.values()].sort((a, b) => a.startTime.localeCompare(b.startTime));
}

async function accessibleAppointment(req: import("express").Request, id: string) {
  const appointment = await prisma.appointment.findFirst({
    where: { id, tenantId: req.tenantId! },
    include: appointmentInclude,
  });
  if (!appointment) throw new AppError(404, "APPOINTMENT_NOT_FOUND", "Appointment not found.");

  const roles = req.user!.roles;
  const isPatient = roles.includes(Role.PATIENT) && appointment.patient.id === (await prisma.patient.findFirst({
    where: { tenantId: req.tenantId!, userId: req.user!.sub },
    select: { id: true },
  }))?.id;
  const isAssignedDoctor = roles.includes(Role.DOCTOR) && (await prisma.doctorProfile.findFirst({
    where: { tenantId: req.tenantId!, userId: req.user!.sub },
    select: { id: true },
  }))?.id === appointment.doctorId;
  const isSchedulingStaff = roles.includes(Role.RECEPTION) || roles.includes(Role.ADMIN);
  if (!isPatient && !isAssignedDoctor && !isSchedulingStaff) {
    throw new AppError(403, "FORBIDDEN", "You cannot access this appointment.");
  }
  return { appointment, isPatient, isAssignedDoctor, isSchedulingStaff };
}

const createSchema = z.object({
  doctorId: z.string().min(1),
  date: dateSchema,
  startTime: timeSchema,
  reason: z.string().trim().max(500).optional(),
  patientId: z.string().optional(),
});

const updateSchema = z.object({
  doctorId: z.string().min(1).optional(),
  date: dateSchema.optional(),
  startTime: timeSchema.optional(),
  reason: z.string().trim().max(500).nullable().optional(),
  status: z.nativeEnum(AppointmentStatus).optional(),
}).refine((body) => Object.keys(body).length > 0, "Provide at least one appointment change.");

router.get(
  "/specialties",
  wrap(async (req, res) => {
    const specialties = await prisma.specialty.findMany({
      where: {
        tenantId: req.tenantId!,
        isActive: true,
        doctors: {
          some: {
            doctor: {
              is: {
                tenantId: req.tenantId!,
                isBookable: true,
                user: { is: { status: UserStatus.ACTIVE, roles: { has: Role.DOCTOR } } },
              },
            },
          },
        },
      },
      select: { id: true, name: true, slug: true, description: true },
      orderBy: { name: "asc" },
    });
    res.json({ success: true, data: { specialties } });
  })
);

router.get(
  "/doctors",
  wrap(async (req, res) => {
    const specialtySlug = typeof req.query.specialty === "string" ? req.query.specialty : undefined;
    const doctors = await prisma.doctorProfile.findMany({
      where: {
        tenantId: req.tenantId!,
        isBookable: true,
        user: { is: { status: UserStatus.ACTIVE, roles: { has: Role.DOCTOR } } },
        ...(specialtySlug && {
          specialties: { some: { specialty: { is: { tenantId: req.tenantId!, slug: specialtySlug, isActive: true } } } },
        }),
      },
      select: {
        id: true,
        consultationMinutes: true,
        user: { select: { name: true } },
        specialties: {
          where: { specialty: { is: { tenantId: req.tenantId!, isActive: true } } },
          select: { specialty: { select: { id: true, name: true, slug: true } } },
        },
      },
      orderBy: { user: { name: "asc" } },
    });
    res.json({
      success: true,
      data: {
        doctors: doctors.map((doctor) => ({
          id: doctor.id,
          name: doctor.user.name,
          consultationMinutes: doctor.consultationMinutes,
          specialties: doctor.specialties.map(({ specialty }) => specialty),
        })),
      },
    });
  })
);

router.get(
  "/doctors/:id/slots",
  wrap(async (req, res) => {
    const { date } = z.object({ date: dateSchema }).parse(req.query);
    const slots = await slotsForDoctor(req.tenantId!, req.params.id, date);
    res.json({ success: true, data: { doctorId: req.params.id, date, slots } });
  })
);

router.use("/appointments", authenticate, verifyCurrentRoles);

router.get(
  "/appointments",
  wrap(async (req, res) => {
    const query = z.object({ date: dateSchema.optional() }).parse(req.query);
    const roles = req.user!.roles;
    const fromDate = query.date ?? (await tenantClock(req.tenantId!)).date;
    const where: Prisma.AppointmentWhereInput = {
      tenantId: req.tenantId!,
      cancelledAt: null,
      scheduledFor: query.date ? calendarDate(query.date) : { gte: calendarDate(fromDate) },
    };

    if (roles.includes(Role.PATIENT)) {
      const patient = await prisma.patient.findFirst({ where: { tenantId: req.tenantId!, userId: req.user!.sub }, select: { id: true } });
      if (!patient) throw new AppError(403, "PATIENT_PROFILE_REQUIRED", "A patient profile is required to view appointments.");
      where.patientId = patient.id;
    } else if (roles.includes(Role.DOCTOR) && !roles.includes(Role.RECEPTION) && !roles.includes(Role.ADMIN)) {
      const doctor = await prisma.doctorProfile.findFirst({ where: { tenantId: req.tenantId!, userId: req.user!.sub }, select: { id: true } });
      if (!doctor) throw new AppError(403, "DOCTOR_PROFILE_REQUIRED", "A doctor profile is required to view appointments.");
      where.doctorId = doctor.id;
      where.status = { in: [AppointmentStatus.CHECKED_IN, AppointmentStatus.IN_CONSULTATION] };
    }

    const appointments = await prisma.appointment.findMany({
      where,
      include: appointmentInclude,
      orderBy: roles.includes(Role.DOCTOR) && !roles.includes(Role.RECEPTION) && !roles.includes(Role.ADMIN)
        ? [{ tokenNumber: "asc" }, { startTime: "asc" }]
        : [{ scheduledFor: "asc" }, { startTime: "asc" }],
      take: 200,
    });
    res.json({ success: true, data: { appointments: appointments.map(serializeAppointment) } });
  })
);

router.post(
  "/appointments",
  wrap(async (req, res) => {
    const body = createSchema.parse(req.body);
    const roles = req.user!.roles;
    let patientId: string;
    if (roles.includes(Role.PATIENT)) {
      const patient = await prisma.patient.findFirst({ where: { tenantId: req.tenantId!, userId: req.user!.sub }, select: { id: true } });
      if (!patient) throw new AppError(403, "PATIENT_PROFILE_REQUIRED", "A patient profile is required to book an appointment.");
      patientId = patient.id;
    } else if ((roles.includes(Role.RECEPTION) || roles.includes(Role.ADMIN)) && body.patientId) {
      const patient = await prisma.patient.findFirst({ where: { id: body.patientId, tenantId: req.tenantId! }, select: { id: true } });
      if (!patient) throw new AppError(404, "PATIENT_NOT_FOUND", "Patient not found.");
      patientId = patient.id;
    } else {
      throw new AppError(403, "FORBIDDEN", "Patients or scheduling staff can book appointments.");
    }

    const slots = await slotsForDoctor(req.tenantId!, body.doctorId, body.date);
    const slot = slots.find((available) => available.startTime === body.startTime);
    if (!slot) throw new AppError(409, "SLOT_UNAVAILABLE", "That appointment slot is unavailable. Choose another time.");

    try {
      const appointment = await prisma.appointment.create({
        data: {
          tenantId: req.tenantId!,
          patientId,
          doctorId: body.doctorId,
          scheduledFor: calendarDate(body.date),
          startTime: slot.startTime,
          endTime: slot.endTime,
          reason: body.reason || null,
        },
        include: appointmentInclude,
      });
      await audit(req, "APPOINTMENT_BOOK", "Appointment", appointment.id);
      res.status(201).json({ success: true, data: { appointment: serializeAppointment(appointment) } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new AppError(409, "SLOT_UNAVAILABLE", "That appointment slot has just been booked. Choose another time.");
      }
      throw error;
    }
  })
);

router.patch(
  "/appointments/:id",
  wrap(async (req, res) => {
    const body = updateSchema.parse(req.body);
    const { appointment, isPatient, isAssignedDoctor, isSchedulingStaff } = await accessibleAppointment(req, req.params.id);
    const roles = req.user!.roles;
    const changes: Prisma.AppointmentUpdateInput = {};

    if (body.date || body.startTime || body.doctorId) {
      if (appointment.status !== AppointmentStatus.BOOKED) {
        throw new AppError(409, "APPOINTMENT_NOT_RESCHEDULABLE", "Only booked appointments can be rescheduled.");
      }
      const date = body.date ?? appointment.scheduledFor.toISOString().slice(0, 10);
      const doctorId = body.doctorId ?? appointment.doctorId;
      const startTime = body.startTime ?? appointment.startTime;
      const slot = (await slotsForDoctor(req.tenantId!, doctorId, date, appointment.id)).find((item) => item.startTime === startTime);
      if (!slot) throw new AppError(409, "SLOT_UNAVAILABLE", "That appointment slot is unavailable. Choose another time.");
      changes.doctor = { connect: { id: doctorId } };
      changes.scheduledFor = calendarDate(date);
      changes.startTime = slot.startTime;
      changes.endTime = slot.endTime;
    }

    if (body.status) {
      if (isPatient && body.status !== AppointmentStatus.CANCELLED) {
        throw new AppError(403, "FORBIDDEN", "Patients can only cancel their own appointments.");
      }
      if (isPatient && appointment.status !== AppointmentStatus.BOOKED) {
        throw new AppError(409, "INVALID_STATUS_CHANGE", "Only booked appointments can be cancelled by a patient.");
      }
      const transitions: Partial<Record<AppointmentStatus, AppointmentStatus[]>> = {
        BOOKED: [AppointmentStatus.CHECKED_IN, AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW],
        CHECKED_IN: [AppointmentStatus.IN_CONSULTATION, AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW],
        IN_CONSULTATION: [AppointmentStatus.COMPLETED],
      };
      if (!transitions[appointment.status]?.includes(body.status)) {
        throw new AppError(409, "INVALID_STATUS_CHANGE", `Cannot change appointment from ${appointment.status} to ${body.status}.`);
      }
      if (isAssignedDoctor && body.status !== AppointmentStatus.IN_CONSULTATION && body.status !== AppointmentStatus.COMPLETED) {
        throw new AppError(403, "FORBIDDEN", "Doctors can only manage their own consultation status.");
      }
      if (!isPatient && !isAssignedDoctor && !isSchedulingStaff) {
        throw new AppError(403, "FORBIDDEN", "You cannot change this appointment status.");
      }
      changes.status = body.status;
      changes.cancelledAt = body.status === AppointmentStatus.CANCELLED ? new Date() : null;
    }

    if (body.reason !== undefined) changes.reason = body.reason;
    let updated: AppointmentRecord;
    try {
      updated = await prisma.appointment.update({
        where: { id: appointment.id },
        data: changes,
        include: appointmentInclude,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new AppError(409, "SLOT_UNAVAILABLE", "That appointment slot has just been booked. Choose another time.");
      }
      throw error;
    }
    await audit(req, body.status === AppointmentStatus.CANCELLED ? "APPOINTMENT_CANCEL" : "APPOINTMENT_UPDATE", "Appointment", updated.id);
    notifyQueueChanged(req.tenantId!);
    res.json({ success: true, data: { appointment: serializeAppointment(updated) } });
  })
);

router.delete(
  "/appointments/:id",
  wrap(async (req, res) => {
    const { appointment, isPatient } = await accessibleAppointment(req, req.params.id);
    if (appointment.status !== AppointmentStatus.BOOKED) {
      throw new AppError(409, "APPOINTMENT_NOT_CANCELLABLE", "Only booked appointments can be cancelled.");
    }
    const cancelled = await prisma.appointment.update({
      where: { id: appointment.id },
      data: { status: AppointmentStatus.CANCELLED, cancelledAt: new Date() },
      include: appointmentInclude,
    });
    await audit(req, "APPOINTMENT_CANCEL", "Appointment", cancelled.id);
    notifyQueueChanged(req.tenantId!);
    res.json({ success: true, data: { appointment: serializeAppointment(cancelled) } });
  })
);

router.post(
  "/appointments/:id/check-in",
  requireRole(Role.RECEPTION, Role.ADMIN),
  wrap(async (req, res) => {
    const { appointment } = await accessibleAppointment(req, req.params.id);
    const today = (await tenantClock(req.tenantId!)).date;
    if (appointment.scheduledFor.toISOString().slice(0, 10) !== today) {
      throw new AppError(409, "APPOINTMENT_NOT_CHECK_INABLE", "Appointments can only be checked in on their scheduled date.");
    }
    if (appointment.status === AppointmentStatus.CHECKED_IN && appointment.tokenNumber !== null) {
      res.json({ success: true, data: { appointment: serializeAppointment(appointment) } });
      return;
    }
    if (appointment.status !== AppointmentStatus.BOOKED || appointment.cancelledAt) {
      throw new AppError(409, "APPOINTMENT_NOT_CHECK_INABLE", "Only booked appointments can be checked in.");
    }

    const checkedIn = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "DoctorProfile" WHERE "id" = ${appointment.doctorId} FOR UPDATE`;
      const current = await tx.appointment.findFirst({ where: { id: appointment.id, tenantId: req.tenantId! } });
      if (!current || current.status !== AppointmentStatus.BOOKED || current.cancelledAt) {
        throw new AppError(409, "APPOINTMENT_NOT_CHECK_INABLE", "This appointment can no longer be checked in.");
      }
      const latest = await tx.appointment.aggregate({
        where: { tenantId: req.tenantId!, doctorId: current.doctorId, scheduledFor: current.scheduledFor },
        _max: { tokenNumber: true },
      });
      return tx.appointment.update({
        where: { id: current.id },
        data: { status: AppointmentStatus.CHECKED_IN, checkedInAt: new Date(), tokenNumber: (latest._max.tokenNumber ?? 0) + 1 },
        include: appointmentInclude,
      });
    });
    await audit(req, "APPOINTMENT_CHECK_IN", "Appointment", checkedIn.id);
    notifyQueueChanged(req.tenantId!);
    res.json({ success: true, data: { appointment: serializeAppointment(checkedIn) } });
  })
);

export default router;