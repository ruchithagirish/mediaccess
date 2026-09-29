import crypto from "crypto";
import jwt from "jsonwebtoken";
import type { Response } from "express";
import { Role } from "@prisma/client";
import { config } from "../config";

export interface AccessPayload {
  sub: string;
  tid: string;
  roles: Role[];
}

export const signAccessToken = (p: AccessPayload) =>
  jwt.sign(p, config.jwtAccessSecret, { expiresIn: config.accessTtlSec });

export const verifyAccessToken = (t: string) =>
  jwt.verify(t, config.jwtAccessSecret) as AccessPayload & jwt.JwtPayload;

export const newRefreshToken = () => crypto.randomBytes(48).toString("hex");
export const hashToken = (t: string) => crypto.createHash("sha256").update(t).digest("hex");

const base = { httpOnly: true, sameSite: "lax" as const, secure: config.isProd, path: "/" };

export function setAuthCookies(res: Response, access: string, refresh: string) {
  res.cookie("access_token", access, { ...base, maxAge: config.accessTtlSec * 1000 });
  res.cookie("refresh_token", refresh, { ...base, maxAge: config.refreshTtlSec * 1000 });
}

export function clearAuthCookies(res: Response) {
  res.clearCookie("access_token", base);
  res.clearCookie("refresh_token", base);
}
