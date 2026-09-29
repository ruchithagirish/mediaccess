export type Role =
  | "ADMIN" | "RECEPTION" | "DOCTOR" | "NURSE" | "PHARMACIST" | "LAB_TECH" | "ACCOUNTANT" | "PATIENT";
export type StaffRole = Exclude<Role, "PATIENT">;

export const ROLES: { id: StaffRole; label: string; desc: string; slug: string }[] = [
  { id: "ADMIN", label: "Admin", desc: "Full system control", slug: "admin" },
  { id: "RECEPTION", label: "Receptionist", desc: "Registration, appointments, OPD billing", slug: "reception" },
  { id: "DOCTOR", label: "Doctor", desc: "Consultations, e-prescriptions, orders", slug: "doctor" },
  { id: "NURSE", label: "Nurse", desc: "Vitals, nursing notes, medication rounds", slug: "nurse" },
  { id: "PHARMACIST", label: "Pharmacist", desc: "Dispensing and drug inventory", slug: "pharmacy" },
  { id: "LAB_TECH", label: "Lab Technician", desc: "Investigation worklist and reports", slug: "lab" },
  { id: "ACCOUNTANT", label: "Accountant", desc: "Billing, collections, reconciliation", slug: "accounts" },
];

export const STAFF_ROLE_ORDER: StaffRole[] = ROLES.map((r) => r.id);
export const ROLE_TO_SLUG = Object.fromEntries(ROLES.map((r) => [r.id, r.slug])) as Record<StaffRole, string>;
export const SLUG_TO_ROLE = Object.fromEntries(ROLES.map((r) => [r.slug, r.id])) as Record<string, StaffRole>;
export const roleLabel = (id: string) => ROLES.find((r) => r.id === id)?.label ?? id;
