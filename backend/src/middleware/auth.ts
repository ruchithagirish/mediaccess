import type { RequestHandler } from "express";
import { verifyAccessToken } from "../lib/tokens";
import { AppError } from "../lib/errors";
import { prisma } from "../lib/prisma";
import { UserStatus } from "@prisma/client";

/** Verifies the access token and its active refresh-token family. */
export const authenticate: RequestHandler = async (req, _res, next) => {
  const header = req.get("authorization");
  const token = req.cookies?.access_token ?? (header?.startsWith("Bearer ") ? header.slice(7) : undefined);
  if (!token) return next(new AppError(401, "UNAUTHENTICATED", "Please sign in."));

  let payload: ReturnType<typeof verifyAccessToken>;
  try {
    payload = verifyAccessToken(token);
  } catch {
    return next(new AppError(401, "TOKEN_EXPIRED", "Session expired."));
  }
  if (!payload.sid) return next(new AppError(401, "SESSION_REVOKED", "Please sign in again."));

  try {
    const session = await prisma.refreshToken.findFirst({
      where: {
        userId: payload.sub,
        family: payload.sid,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        user: { tenantId: payload.tid, status: UserStatus.ACTIVE },
      },
      select: { user: { select: { tenantId: true, roles: true } } },
    });
    if (!session) return next(new AppError(401, "SESSION_REVOKED", "Session revoked. Please sign in again."));
    req.user = { ...payload, tid: session.user.tenantId, roles: session.user.roles };
    return next();
  } catch (error) {
    return next(error);
  }
};
