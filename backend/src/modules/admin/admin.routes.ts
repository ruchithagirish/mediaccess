import { Router } from "express";
import { z } from "zod";
import { Role, UserStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../lib/errors";
import { wrap } from "../../lib/async";
import { audit } from "../../middleware/audit";
import { STAFF_ROLES } from "../../roles";
import { authenticate } from "../../middleware/auth";
import { requireRole, reverifyRole } from "../../middleware/rbac";

const router = Router();
router.use(authenticate, requireRole(Role.ADMIN), reverifyRole(Role.ADMIN));

const select = {
  id: true, name: true, email: true, phone: true, employeeId: true,
  roles: true, status: true, lastLoginAt: true, createdAt: true,
  doctorProfile: {
    select: {
      registrationNumber: true,
      specialties: { select: { specialty: { select: { name: true } } } },
    },
  },
} as const;

router.get(
  "/overview",
  wrap(async (req, res) => {
    const tenantId = req.tenantId!;
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { timezone: true } });
    const timezone = tenant?.timezone ?? "Asia/Kolkata";
    const todayParts = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(new Date());
    const part = (type: string) => todayParts.find((item) => item.type === type)!.value;
    const today = `${part("year")}-${part("month")}-${part("day")}`;
    const todayDate = new Date(`${today}T00:00:00.000Z`);
    const growthStart = new Date(todayDate);
    growthStart.setUTCDate(growthStart.getUTCDate() - 6);

    const [activePatients, activeProviders, pendingStaff, pendingDiscounts, appointments, newPatients, auditLogs] = await Promise.all([
      prisma.patient.count({ where: { tenantId, user: { is: { status: UserStatus.ACTIVE } } } }),
      prisma.doctorProfile.count({ where: { tenantId, user: { is: { status: UserStatus.ACTIVE, roles: { has: Role.DOCTOR } } } } }),
      prisma.user.count({ where: { tenantId, roles: { hasSome: STAFF_ROLES }, status: UserStatus.PENDING } }),
      prisma.discountRequest.count({ where: { tenantId, status: "PENDING" } }),
      prisma.appointment.findMany({
        where: { tenantId, scheduledFor: todayDate },
        select: {
          status: true,
          startTime: true,
          doctor: { select: { specialties: { select: { specialty: { select: { name: true } } } } } },
        },
      }),
      prisma.patient.findMany({
        where: { tenantId, createdAt: { gte: growthStart } },
        select: { createdAt: true },
      }),
      prisma.auditLog.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
        take: 8,
        select: { id: true, userId: true, action: true, entityType: true, entityId: true, createdAt: true },
      }),
    ]);

    const auditUserIds = [...new Set(auditLogs.flatMap((item) => item.userId ? [item.userId] : []))];
    const auditUsers = await prisma.user.findMany({
      where: { tenantId, id: { in: auditUserIds } },
      select: { id: true, name: true },
    });
    const userNames = new Map(auditUsers.map((user) => [user.id, user.name]));
    const growthCounts = new Map<string, number>();
    const growthDateFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" });
    for (const patient of newPatients) {
      const parts = growthDateFormatter.formatToParts(patient.createdAt);
      const localDay = `${parts.find((item) => item.type === "year")!.value}-${parts.find((item) => item.type === "month")!.value}-${parts.find((item) => item.type === "day")!.value}`;
      growthCounts.set(localDay, (growthCounts.get(localDay) ?? 0) + 1);
    }
    const growth = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(growthStart);
      date.setUTCDate(date.getUTCDate() + index);
      const day = date.toISOString().slice(0, 10);
      return { date: day, count: growthCounts.get(day) ?? 0 };
    });
    const statusCounts = appointments.reduce<Record<string, number>>((counts, appointment) => {
      counts[appointment.status] = (counts[appointment.status] ?? 0) + 1;
      return counts;
    }, {});
    const hourCounts = appointments.reduce<Record<string, number>>((counts, appointment) => {
      const hour = Number(appointment.startTime.slice(0, 2));
      const period = hour < 12 ? "Morning" : hour < 17 ? "Afternoon" : "Evening";
      counts[period] = (counts[period] ?? 0) + 1;
      return counts;
    }, {});
    const specialtyCounts = appointments.reduce<Record<string, number>>((counts, appointment) => {
      const specialtyNames = appointment.doctor.specialties.map(({ specialty }) => specialty.name);
      for (const name of specialtyNames.length ? specialtyNames : ["Unassigned specialty"]) {
        counts[name] = (counts[name] ?? 0) + 1;
      }
      return counts;
    }, {});

    await prisma.$queryRaw`SELECT 1`;
    res.json({
      success: true,
      data: {
        date: today,
        refreshedAt: new Date().toISOString(),
        metrics: {
          activePatients,
          activeProviders,
          appointmentsToday: appointments.length,
          completedAppointments: statusCounts.COMPLETED ?? 0,
          cancelledAppointments: statusCounts.CANCELLED ?? 0,
          pendingApprovals: pendingStaff + pendingDiscounts,
          pendingStaff,
          pendingDiscounts,
        },
        patientGrowth: growth,
        appointmentVolume: ["Morning", "Afternoon", "Evening"].map((period) => ({ period, count: hourCounts[period] ?? 0 })),
        specialtyBreakdown: Object.entries(specialtyCounts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 5),
        activity: auditLogs.map((item) => ({
          id: item.id,
          actor: item.userId ? userNames.get(item.userId) ?? "Former user" : "System",
          action: item.action,
          entity: item.entityType,
          entityId: item.entityId,
          createdAt: item.createdAt,
        })),
        systemHealth: { api: "operational", database: "operational" },
      },
    });
  }),
);

router.get(
  "/staff",
  wrap(async (req, res) => {
    const status = z.nativeEnum(UserStatus).optional().parse(req.query.status);
    const staff = await prisma.user.findMany({
      where: { tenantId: req.tenantId!, roles: { hasSome: STAFF_ROLES }, ...(status && { status }) },
      select,
      orderBy: { createdAt: "desc" },
    });
    const activeSessions = await prisma.refreshToken.groupBy({
      by: ["userId"],
      where: { user: { tenantId: req.tenantId! }, revokedAt: null, expiresAt: { gt: new Date() } },
      _count: { id: true },
    });
    const sessionCounts = new Map(activeSessions.map((item) => [item.userId, item._count.id]));
    res.json({ success: true, data: { staff: staff.map((user) => ({ ...user, activeSessions: sessionCounts.get(user.id) ?? 0 })) } });
  })
);

async function findStaff(req: import("express").Request) {
  const staff = await prisma.user.findFirst({ where: { id: req.params.id, tenantId: req.tenantId!, roles: { hasSome: STAFF_ROLES } } });
  if (!staff) throw new AppError(404, "NOT_FOUND", "Staff member not found.");
  return staff;
}

async function ensureAnotherActiveAdmin(staffId: string, tenantId: string) {
  const otherAdmins = await prisma.user.count({
    where: { tenantId, id: { not: staffId }, status: UserStatus.ACTIVE, roles: { has: Role.ADMIN } },
  });
  if (otherAdmins === 0) throw new AppError(422, "LAST_ADMIN", "The tenant must retain at least one active administrator.");
}

const revokeSessions = (userId: string) =>
  prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });

router.patch(
  "/staff/:id/roles",
  wrap(async (req, res) => {
    const body = z.object({ roles: z.array(z.enum(STAFF_ROLES as [Role, ...Role[]])).min(1) }).parse(req.body);
    const staff = await findStaff(req);
    if (staff.id === req.user!.sub) throw new AppError(422, "SELF_ROLE_CHANGE", "You cannot change your own roles.");
    if (staff.status === UserStatus.ACTIVE && staff.roles.includes(Role.ADMIN) && !body.roles.includes(Role.ADMIN)) {
      await ensureAnotherActiveAdmin(staff.id, req.tenantId!);
    }
    const updated = await prisma.user.update({ where: { id: staff.id }, data: { roles: body.roles }, select });
    await revokeSessions(staff.id);
    await audit(req, "STAFF_ROLES_UPDATED", "User", staff.id);
    res.json({ success: true, data: { staff: updated } });
  })
);

router.post(
  "/staff/:id/revoke-sessions",
  wrap(async (req, res) => {
    const staff = await findStaff(req);
    if (staff.id === req.user!.sub) throw new AppError(422, "SELF_LOGOUT", "Use Log out to end your own session.");
    const result = await revokeSessions(staff.id);
    await audit(req, "STAFF_SESSIONS_REVOKED", "User", staff.id);
    res.json({ success: true, data: { revokedSessions: result.count } });
  })
);

router.post(
  "/staff/:id/approve",
  wrap(async (req, res) => {
    const body = z
      .object({ roles: z.array(z.enum(STAFF_ROLES as [Role, ...Role[]])).min(1).optional() })
      .parse(req.body ?? {});
    const staff = await findStaff(req);
    if (staff.status !== UserStatus.PENDING) throw new AppError(409, "NOT_PENDING", "Only pending staff requests can be approved.");
    const updated = await prisma.user.update({
      where: { id: staff.id },
      data: { status: UserStatus.ACTIVE, ...(body.roles && { roles: body.roles }) },
      select,
    });
    if (body.roles) await revokeSessions(staff.id); // role change forces re-login
    await audit(req, "STAFF_APPROVE", "User", staff.id);
    res.json({ success: true, data: { staff: updated } });
  })
);

router.post(
  "/staff/:id/reject",
  wrap(async (req, res) => {
    const staff = await findStaff(req);
    if (staff.status !== UserStatus.PENDING) throw new AppError(409, "NOT_PENDING", "Only pending staff requests can be rejected.");
    const updated = await prisma.user.update({ where: { id: staff.id }, data: { status: UserStatus.REJECTED }, select });
    await revokeSessions(staff.id);
    await audit(req, "STAFF_REJECT", "User", staff.id);
    res.json({ success: true, data: { staff: updated } });
  })
);

router.post(
  "/staff/:id/disable",
  wrap(async (req, res) => {
    const staff = await findStaff(req);
    if (staff.id === req.user!.sub) throw new AppError(422, "SELF_DISABLE", "You cannot disable your own account.");
    if (staff.status === UserStatus.ACTIVE && staff.roles.includes(Role.ADMIN)) await ensureAnotherActiveAdmin(staff.id, req.tenantId!);
    const updated = await prisma.user.update({ where: { id: staff.id }, data: { status: UserStatus.DISABLED }, select });
    await revokeSessions(staff.id);
    await audit(req, "STAFF_DISABLE", "User", staff.id);
    res.json({ success: true, data: { staff: updated } });
  })
);

router.get(
  "/audit",
  wrap(async (req, res) => {
    const query = z.object({ userId: z.string().optional(), limit: z.coerce.number().int().min(1).max(100).default(50) }).parse(req.query);
    const logs = await prisma.auditLog.findMany({
      where: { tenantId: req.tenantId!, ...(query.userId ? { userId: query.userId } : {}) },
      orderBy: { createdAt: "desc" },
      take: query.limit,
      select: { id: true, userId: true, action: true, entityType: true, entityId: true, ip: true, userAgent: true, createdAt: true },
    });
    const userIds = [...new Set(logs.flatMap((log) => log.userId ? [log.userId] : []))];
    const users = await prisma.user.findMany({ where: { tenantId: req.tenantId!, id: { in: userIds } }, select: { id: true, name: true } });
    const names = new Map(users.map((user) => [user.id, user.name]));
    res.json({ success: true, data: { logs: logs.map((log) => ({ ...log, actor: log.userId ? names.get(log.userId) ?? "Former user" : "System" })) } });
  })
);

export default router;
