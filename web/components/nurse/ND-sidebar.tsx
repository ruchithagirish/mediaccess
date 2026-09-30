"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { getMe, post } from "@/lib/api";
import { MyProfileNavLink } from "@/components/hms/MyProfileNavLink";

const nurseLinks = [
  ["Overview", "/hms/dashboard/nurse"],
  ["Assigned patients", "/hms/dashboard/nurse/patients"],
  ["Vitals entry", "/hms/dashboard/nurse/ipd?tab=nursing#nurse-vitals"],
  ["Nursing notes", "/hms/dashboard/nurse/ipd?tab=nursing#nurse-notes"],
  ["IPD charts", "/hms/dashboard/nurse/ipd?tab=nursing#nurse-charts"],
  ["Medication (MAR)", "/hms/dashboard/nurse/ipd?tab=nursing#nurse-mar"],
  ["IPD & OT", "/hms/dashboard/nurse/ipd?view=ot"],
  ["Patient records", "/hms/dashboard/nurse/patients"],
];
const nursingSectionTargets: Record<string, string> = {
  "Vitals entry": "nurse-vitals",
  "Nursing notes": "nurse-notes",
  "IPD charts": "nurse-charts",
  "Medication (MAR)": "nurse-mar",
};

export function NurseShell({ active, children }: { active: string; children: ReactNode }) {
  const router = useRouter();

  useEffect(() => { getMe().catch(() => router.replace("/staff/login")); }, [router]);

  async function logout() {
    await post("/auth/logout").catch(() => {});
    router.push("/staff/login");
  }

  return <div className="shell">
    <aside className="side">
      <Link className="logo" href="/hms"><i>+</i>MediAccess</Link>
      <div className="rl">Nurse</div>
      {nurseLinks.map(([label, href], index) => <Link key={`${label}-${index}`} className={`nav ${active === label ? "on" : ""}`} aria-current={active === label ? "page" : undefined} href={href} onClick={() => { const target = nursingSectionTargets[label]; if (target) requestAnimationFrame(() => document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "start" })); }}><span className="d" />{label}</Link>)}
      <MyProfileNavLink role="NURSE" />
    </aside>
    <main className="main nurse-main">
      <div className="top"><h1>Nurse dashboard</h1><button className="btn ghost sm" onClick={() => void logout()}>Log out</button></div>
      {children}
    </main>
  </div>;
}
