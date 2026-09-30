import type { RequestHandler } from "express";
import { Role, UserStatus } from "@prisma/client";
import { AppError } from "../lib/errors";
import { prisma } from "../lib/prisma";

/** Server-side RBAC. Frontend guards are UX only. */
export const requireRole =
  (...allowed: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) return next(new AppError(401, "UNAUTHENTICATED", "Please sign in."));
    if (!req.user.roles.some((role) => allowed.includes(role))) {
      return next(new AppError(403, "FORBIDDEN", "You do not have permission to do this."));
    }
    next();
  };

/** Tokens can outlive a role change, so privileged mutations re-check the database. */
export const reverifyRole =
  (...allowed: Role[]): RequestHandler =>
  async (req, _res, next) => {
    try {
      const user = await prisma.user.findUnique({ where: { id: req.user!.sub } });
      if (!user || user.status !== UserStatus.ACTIVE || !user.roles.some((role) => allowed.includes(role))) {
        throw new AppError(403, "FORBIDDEN", "You do not have permission to do this.");
      }
      next();
    } catch (error) {
      next(error);
    }
  };