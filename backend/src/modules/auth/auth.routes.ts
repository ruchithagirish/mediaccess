import crypto from "crypto";
import { Router, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { Prisma, Role, UserStatus, type User, type Patient } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../lib/errors";
import { wrap } from "../../lib/async";
import { audit } from "../../lib/audit";
import { config } from "../../config";
import { STAFF_ROLES, isStaff } from "../../roles";
import { authenticate } from "../../middleware/auth";
import {
  clearAuthCookies,
  hashToken,
  newRefreshToken,
  setAuthCookies,
  signAccessToken,
} from "../../lib/tokens";

const router = Router();

/* ---------- validation ---------- */
const name = z.string().trim().min(3, "Enter your full name.").max(100);
const email = z.string().trim().toLowerCase().email("Enter a valid email address.");
const phone = z
  .string()
  .transform((s) => s.replace(/\D/g, "").slice(-10))
  .refine((v) => /^[6-9]\d{9}$/.test(v), "Enter a valid 10-digit mobile number.");
const password = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .refine(
    (p) => /[a-z]/.test(p) && /[A-Z]/.test(p) && /\d/.test(p) && /[^A-Za-z0-9]/.test(p),
    "Password needs upper and lower case letters, a number and a symbol."
  );

const patientRegisterSchema = z.object({
  name,
  phone,
  email,
  dob: z
    .string()
    .refine((v) => !Number.isNaN(Date.parse(v)) && new Date(v) < new Date(), "Enter a valid date of birth."),
  password,
  consent: z.literal(true, { errorMap: () => ({ message: "Consent is required to create an account." }) }),
});

const staffRegisterSchema = z.object({
  name,
  email,
  phone,
  employeeId: z.string().trim().regex(/^[A-Za-z]{2,5}-?\d{2,6}$/, "Enter a valid employee ID (e.g. EMP-0123)."),
  roles: z
    .array(z.enum(STAFF_ROLES as [Role, ...Role[]]))
    .min(1, "Select at least one role.")
    .transform((r) => [...new Set(r)]),
  password,
});

const loginSchema = z.object({
  identifier: z.string().trim().min(1, "Enter your email or mobile number."),
  password: z.string().min(1, "Enter your password."),
});

/* ---------- helpers ---------- */
const authLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) =>
    res.status(429).json({ success: false, error: { code: "RATE_LIMITED", message: "Too many attempts. Try again in a minute." } }),
});

const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);
const ok = <T>(res: Response, data: T, status = 200) => res.status(status).json({ success: true, data });

type UserWithPatient = User & { patient: Patient | null };
const publicUser = (u: UserWithPatient) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  phone: u.phone,
  roles: u.roles,
  status: u.status,
  employeeId: u.employeeId,
  mrn: u.patient?.mrn ?? null,
});

async function issueSession(res: Response, user: Pick<User, "id" | "tenantId" | "roles">, family?: string) {
  const refresh = newRefreshToken();
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(refresh),
      family: family ?? crypto.randomUUID(),
      expiresAt: new Date(Date.now() + config.refreshTtlSec * 1000),
    },
  });
  setAuthCookies(res, signAccessToken({ sub: user.id, tid: user.tenantId, roles: user.roles }), refresh);
}

const isUniqueError = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

/* ---------- patient register / login ---------- */
router.post(
  "/patient/register",
  authLimiter,
  wrap(async (req, res) => {
    const body = patientRegisterSchema.parse(req.body);
    const tenantId = req.tenantId!;
    const exists = await prisma.user.findFirst({
      where: { tenantId, OR: [{ email: body.email }, { phone: body.phone }] },
      select: { id: true },
    });
    if (exists) throw new AppError(409, "ACCOUNT_EXISTS", "An account with this email or mobile already exists.");

    const mrn = "MA-" + crypto.randomBytes(4).toString("hex").toUpperCase();
    try {
      const user = await prisma.user.create({
        data: {
          tenantId,
          name: body.name,
          email: body.email,
          phone: body.phone,
          passwordHash: await bcrypt.hash(body.password, 12),
          roles: [Role.PATIENT],
          status: UserStatus.ACTIVE,
          patient: { create: { tenantId, mrn, dob: new Date(body.dob) } },
        },
      });
      await audit(req, "PATIENT_REGISTER", "User", user.id, user.id);
    } catch (e) {
      if (isUniqueError(e)) throw new AppError(409, "ACCOUNT_EXISTS", "An account with this email or mobile already exists.");
      throw e;
    }
    ok(res, { message: "Account created. Please log in." }, 201);
  })
);

async function login(req: Request, res: Response, kind: "patient" | "staff") {
  const body = loginSchema.parse(req.body);
  const tenantId = req.tenantId!;
  const id = body.identifier.toLowerCase();
  const digits = id.replace(/\D/g, "").slice(-10);
  const where =
    kind === "staff" || id.includes("@")
      ? { tenantId, email: id }
      : { tenantId, phone: digits };

  const user = await prisma.user.findFirst({ where, include: { patient: true } });
  // Always run bcrypt so timing does not reveal whether the account exists.
  const valid = await bcrypt.compare(body.password, user?.passwordHash ?? DUMMY_HASH);
  const roleOk = user && (kind === "patient" ? user.roles.includes(Role.PATIENT) : isStaff(user.roles));
  if (!user || !valid || !roleOk) {
    await audit(req, "LOGIN_FAILED", "User", user?.id, user?.id);
    throw new AppError(401, "INVALID_CREDENTIALS", "Incorrect credentials. Please try again.");
  }
  if (user.status === UserStatus.PENDING) throw new AppError(403, "ACCOUNT_PENDING", "Your account is awaiting admin approval.");
  if (user.status !== UserStatus.ACTIVE) throw new AppError(403, "ACCOUNT_DISABLED", "This account is disabled. Contact your administrator.");

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await issueSession(res, user);
  await audit(req, "LOGIN", "User", user.id, user.id);
  ok(res, { user: publicUser(user) });
}

router.post("/patient/login", authLimiter, wrap((req, res) => login(req, res, "patient")));
router.post("/staff/login", authLimiter, wrap((req, res) => login(req, res, "staff")));

/* ---------- staff register (pending admin approval) ---------- */
router.post(
  "/staff/register",
  authLimiter,
  wrap(async (req, res) => {
    const body = staffRegisterSchema.parse(req.body);
    const tenantId = req.tenantId!;
    const exists = await prisma.user.findFirst({
      where: { tenantId, OR: [{ email: body.email }, { phone: body.phone }] },
      select: { id: true },
    });
    if (exists) throw new AppError(409, "ACCOUNT_EXISTS", "This email or mobile is already registered.");
    try {
      const user = await prisma.user.create({
        data: {
          tenantId,
          name: body.name,
          email: body.email,
          phone: body.phone,
          employeeId: body.employeeId.toUpperCase(),
          passwordHash: await bcrypt.hash(body.password, 12),
          roles: body.roles,
          status: UserStatus.PENDING, // roles are only a request until an admin approves
        },
      });
      await audit(req, "STAFF_REGISTER", "User", user.id, user.id);
    } catch (e) {
      if (isUniqueError(e)) throw new AppError(409, "ACCOUNT_EXISTS", "This email or mobile is already registered.");
      throw e;
    }
    ok(res, { message: "Request submitted. An administrator will review and approve your roles." }, 201);
  })
);

/* ---------- session: refresh (rotating, reuse-detecting), me, logout ---------- */
router.post(
  "/refresh",
  wrap(async (req, res) => {
    const raw = req.cookies?.refresh_token as string | undefined;
    if (!raw) throw new AppError(401, "UNAUTHENTICATED", "Please sign in.");
    const record = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(raw) }, include: { user: true } });
    if (!record) throw new AppError(401, "UNAUTHENTICATED", "Please sign in.");

    // Atomically claim the token. If it was already used, someone is replaying it.
    const claimed = await prisma.refreshToken.updateMany({
      where: { id: record.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (claimed.count === 0) {
      await prisma.refreshToken.updateMany({ where: { family: record.family, revokedAt: null }, data: { revokedAt: new Date() } });
      clearAuthCookies(res);
      await audit(req, "REFRESH_REUSE_DETECTED", "User", record.userId, record.userId);
      throw new AppError(401, "SESSION_REVOKED", "Please sign in again.");
    }
    if (record.expiresAt < new Date() || record.user.status !== UserStatus.ACTIVE) {
      clearAuthCookies(res);
      throw new AppError(401, "UNAUTHENTICATED", "Please sign in.");
    }
    await issueSession(res, record.user, record.family); // fresh roles come from the DB
    ok(res, { refreshed: true });
  })
);

router.get(
  "/me",
  authenticate,
  wrap(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user!.sub }, include: { patient: true } });
    if (!user || user.status !== UserStatus.ACTIVE) throw new AppError(401, "UNAUTHENTICATED", "Please sign in.");
    ok(res, { user: publicUser(user) });
  })
);

router.post(
  "/logout",
  wrap(async (req, res) => {
    const raw = req.cookies?.refresh_token as string | undefined;
    if (raw) await prisma.refreshToken.updateMany({ where: { tokenHash: hashToken(raw), revokedAt: null }, data: { revokedAt: new Date() } });
    clearAuthCookies(res);
    ok(res, { loggedOut: true });
  })
);

export default router;
