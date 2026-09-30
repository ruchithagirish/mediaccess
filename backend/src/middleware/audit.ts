import type { Request } from "express";
import { prisma } from "../lib/prisma";

export async function auditRequired(
  req: Request,
  action: string,
  entityType: string,
  entityId?: string,
  userId?: string,
  client: Pick<typeof prisma, "auditLog"> = prisma
) {
  await client.auditLog.create({
    data: {
      tenantId: req.tenantId,
      userId: userId ?? req.user?.sub,
      action,
      entityType,
      entityId,
      ip: req.ip,
      userAgent: req.get("user-agent") ?? undefined,
    },
  });
}

export async function audit(
  req: Request,
  action: string,
  entityType: string,
  entityId?: string,
  userId?: string
) {
  try {
    await auditRequired(req, action, entityType, entityId, userId);
  } catch (e) {
    // Audit failures must never break the request, but must be visible.
    console.error("audit log failed", e);
  }
}
