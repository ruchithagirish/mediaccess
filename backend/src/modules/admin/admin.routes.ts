import { Router } from "express";
import { z } from "zod";
import { Role, UserStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../lib/errors";
import { wrap } from "../../lib/async";
import { audit } from "../../lib/audit";
import { STAFF_ROLES } from "../../roles";
import { authenticate, requireRole, reverifyRole } from "../../middleware/auth";

const router = Router();
router.use(authenticate, requireRole(Role.ADMIN), reverifyRole(Role.ADMIN));

const select = {
  id: true, name: true, email: true, phone: true, employeeId: true,
  roles: true, status: true, lastLoginAt: true, createdAt: true,
} as const;

router.get(
  "/staff",
  wrap(async (req, res) => {
    const status = z.nativeEnum(UserStatus).optional().parse(req.query.status);
    const staff = await prisma.user.findMany({
      where: { tenantId: req.tenantId!, roles: { hasSome: STAFF_ROLES }, ...(status && { status }) },
      select,
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    res.json({ success: true, data: { staff } });
  })
);

async function findStaff(req: import("express").Request) {
  const staff = await prisma.user.findFirst({ where: { id: req.params.id, tenantId: req.tenantId!, roles: { hasSome: STAFF_ROLES } } });
  if (!staff) throw new AppError(404, "NOT_FOUND", "Staff member not found.");
  return staff;
}

const revokeSessions = (userId: string) =>
  prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });

router.post(
  "/staff/:id/approve",
  wrap(async (req, res) => {
    const body = z
      .object({ roles: z.array(z.enum(STAFF_ROLES as [Role, ...Role[]])).min(1).optional() })
      .parse(req.body ?? {});
    const staff = await findStaff(req);
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
    const updated = await prisma.user.update({ where: { id: staff.id }, data: { status: UserStatus.DISABLED }, select });
    await revokeSessions(staff.id);
    await audit(req, "STAFF_DISABLE", "User", staff.id);
    res.json({ success: true, data: { staff: updated } });
  })
);

export default router;
