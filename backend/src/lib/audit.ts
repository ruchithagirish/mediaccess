import type { Request } from "express";
import { prisma } from "./prisma";

export async function audit(
  req: Request,
  action: string,
  entityType: string,
  entityId?: string,
  userId?: string
) {
  try {
    await prisma.auditLog.create({
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
  } catch (e) {
    // Audit failures must never break the request, but must be visible.
    console.error("audit log failed", e);
  }
}
