import { Role } from "@prisma/client";

export const STAFF_ROLES: Role[] = [
  Role.ADMIN,
  Role.RECEPTION,
  Role.DOCTOR,
  Role.NURSE,
  Role.PHARMACIST,
  Role.LAB_TECH,
  Role.ACCOUNTANT,
];

export const isStaff = (roles: Role[]) => roles.some((r) => STAFF_ROLES.includes(r));
