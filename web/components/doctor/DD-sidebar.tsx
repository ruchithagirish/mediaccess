"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { getMe, post } from "@/lib/api";
import { MyProfileNavLink } from "@/components/hms/MyProfileNavLink";

const doctorLinks = [
  ["My patients", "/hms/dashboard/doctor/patients"],
  ["Consultation", "/hms/dashboard/doctor"],
  ["E-prescriptions", "/hms/dashboard/doctor/prescriptions"],
  ["Investigations", "/hms/dashboard/doctor/investigations"],
  ["IPD rounds", "/hms/dashboard/doctor/ipd?tab=nursing"],
  ["IPD & OT", "/hms/dashboard/doctor/ipd"],
  ["Patient records", "/hms/dashboard/doctor/patients"],
];

export function DoctorShell({ active, children }: { active: string; children: ReactNode }) {
  const router = useRouter();

  useEffect(() => { getMe().catch(() => router.replace("/staff/login")); }, [router]);

  async function logout() {
    await post("/auth/logout").catch(() => {});
    router.push("/staff/login");
  }

  return <div className="shell">
    <aside className="side">
      <Link className="logo" href="/hms"><i>+</i>MediAccess</Link>
      <div className="rl">Doctor</div>
      {doctorLinks.map(([label, href], index) => <Link key={`${label}-${index}`} className={`nav ${active === label ? "on" : ""}`} aria-current={active === label ? "page" : undefined} href={href}><span className="d" />{label}</Link>)}
      <MyProfileNavLink role="DOCTOR" />
    </aside>
    <main className="main doctor-main">
      <div className="top"><h1>Doctor dashboard</h1><button className="btn ghost sm" onClick={() => void logout()}>Log out</button></div>
      {children}
    </main>
  </div>;
}
