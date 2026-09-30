"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { getMe, post } from "@/lib/api";
import { MyProfileNavLink } from "@/components/hms/MyProfileNavLink";

type ReceptionSection = "Today" | "Register patient" | "Appointments" | "Queue & tokens";
const localSections: ReceptionSection[] = ["Today", "Register patient", "Appointments", "Queue & tokens"];
const moduleLinks = [
  { label: "OPD billing", href: "/hms/dashboard/reception/billing?tab=OPD%20billing" },
  { label: "Bed availability", href: "/hms/dashboard/reception/ipd?view=bed" },
  { label: "IPD & OT", href: "/hms/dashboard/reception/ipd?view=ot" },
  { label: "Patient records", href: "/hms/dashboard/reception/patients" },
  { label: "Billing & payments", href: "/hms/dashboard/reception/billing" },
];

export function ReceptionShell({ active, children, onSectionChange }: {
  active: string;
  children: ReactNode;
  onSectionChange?: (section: ReceptionSection) => void;
}) {
  const router = useRouter();

  useEffect(() => { getMe().catch(() => router.replace("/staff/login")); }, [router]);

  async function logout() {
    await post("/auth/logout").catch(() => {});
    router.push("/staff/login");
  }

  return <div className="shell">
    <aside className="side">
      <Link className="logo" href="/hms"><i>+</i>MediAccess</Link>
      <div className="rl">Reception</div>
      {localSections.map((label) => onSectionChange ? <button key={label} type="button" className={`nav ${active === label ? "on" : ""}`} aria-current={active === label ? "page" : undefined} onClick={() => onSectionChange(label)}><span className="d" />{label}</button> : <Link key={label} className={`nav ${active === label ? "on" : ""}`} aria-current={active === label ? "page" : undefined} href={label === "Today" ? "/hms/dashboard/reception" : `/hms/dashboard/reception?section=${encodeURIComponent(label)}`}><span className="d" />{label}</Link>)}
      {moduleLinks.map(({ label, href }) => <Link key={label} className={`nav ${active === label ? "on" : ""}`} aria-current={active === label ? "page" : undefined} href={href}><span className="d" />{label}</Link>)}
      <MyProfileNavLink role="RECEPTION" />
    </aside>
    <main className="main reception-main">
      <div className="top"><h1>Reception dashboard</h1><button className="btn ghost sm" onClick={() => void logout()}>Log out</button></div>
      {children}
    </main>
  </div>;
}