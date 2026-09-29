import type { RequestHandler } from "express";
import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import { config } from "../config";

/**
 * Resolves the tenant from the subdomain (apollo.mediaccess.in -> "apollo").
 * Falls back to DEFAULT_TENANT_SLUG for localhost / single-hospital setups.
 */
export const resolveTenant: RequestHandler = async (req, _res, next) => {
  try {
    const parts = req.hostname.split(".");
    const slug = parts.length > 2 ? parts[0] : config.defaultTenantSlug;
    const tenant = await prisma.tenant.findUnique({ where: { slug } });
    if (!tenant || !tenant.isActive) throw new AppError(403, "TENANT_INACTIVE", "Unknown or inactive hospital.");
    req.tenantId = tenant.id;
    next();
  } catch (e) {
    next(e);
  }
};
