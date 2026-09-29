import type { RequestHandler } from "express";
import { Role, UserStatus } from "@prisma/client";
import { verifyAccessToken } from "../lib/tokens";
import { AppError } from "../lib/errors";
import { prisma } from "../lib/prisma";

/** Verifies the access-token cookie (or Bearer header) and attaches req.user. */
export const authenticate: RequestHandler = (req, _res, next) => {
  const header = req.get("authorization");
  const token = req.cookies?.access_token ?? (header?.startsWith("Bearer ") ? header.slice(7) : undefined);
  if (!token) return next(new AppError(401, "UNAUTHENTICATED", "Please sign in."));
  try {
    req.user = verifyAccessToken(token);
    next();
  } catch {
    next(new AppError(401, "TOKEN_EXPIRED", "Session expired."));
  }
};

/** Server-side RBAC. Frontend guards are UX only. */
export const requireRole =
  (...allowed: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) return next(new AppError(401, "UNAUTHENTICATED", "Please sign in."));
    if (!req.user.roles.some((r) => allowed.includes(r))) {
      return next(new AppError(403, "FORBIDDEN", "You do not have permission to do this."));
    }
    next();
  };

/**
 * Tokens can outlive a role change, so privileged mutations re-check the database.
 */
export const reverifyRole =
  (...allowed: Role[]): RequestHandler =>
  async (req, _res, next) => {
    try {
      const user = await prisma.user.findUnique({ where: { id: req.user!.sub } });
      if (!user || user.status !== UserStatus.ACTIVE || !user.roles.some((r) => allowed.includes(r))) {
        throw new AppError(403, "FORBIDDEN", "You do not have permission to do this.");
      }
      next();
    } catch (e) {
      next(e);
    }
  };
