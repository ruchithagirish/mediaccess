"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { StaffRole } from "@/lib/roles";

export function MyProfileNavLink({ role }: { role: Extract<StaffRole, "ADMIN" | "RECEPTION" | "DOCTOR" | "NURSE" | "PHARMACIST" | "LAB_TECH" | "ACCOUNTANT"> }) {
  const slug = role === "ADMIN" ? "admin" : role === "RECEPTION" ? "reception" : role === "DOCTOR" ? "doctor" : role === "NURSE" ? "nurse" : role === "PHARMACIST" ? "pharmacy" : role === "LAB_TECH" ? "lab" : "accounts";
  const href = `/hms/dashboard/${slug}/profile`;
  const active = usePathname() === href;
  return <Link className={`nav ${active ? "on" : ""}`} aria-current={active ? "page" : undefined} href={href}><span className="d" />{role === "LAB_TECH" ? "My Profile" : "My profile"}</Link>;
}