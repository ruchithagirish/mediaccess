"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { getMe, post, type SessionUser } from "@/lib/api";
import { MyProfileNavLink } from "@/components/hms/MyProfileNavLink";
import { PHARMACY_SECTIONS, type PharmacyNavigationItem, type PharmacyTab } from "./PD-sidebar";

export function PharmacySidebar({ active, onSectionSelect }: {
  active: PharmacyNavigationItem;
  onSectionSelect?: (tab: PharmacyTab) => void;
}) {
  return <>
    {PHARMACY_SECTIONS.map(({ label, tab }) => onSectionSelect
      ? <button key={tab} type="button" className={`nav ${active === tab ? "on" : ""}`} aria-pressed={active === tab} onClick={() => onSectionSelect(tab)}><span className="d" />{label}</button>
      : <Link key={tab} className={`nav ${active === tab ? "on" : ""}`} aria-current={active === tab ? "page" : undefined} href={`/hms/dashboard/pharmacy?section=${encodeURIComponent(tab)}`}><span className="d" />{label}</Link>)}
    <Link className={`nav ${active === "patients" ? "on" : ""}`} aria-current={active === "patients" ? "page" : undefined} href="/hms/dashboard/pharmacy/patients"><span className="d" />Patient records</Link>
    <MyProfileNavLink role="PHARMACIST" />
  </>;
}

export function PharmacyShell({ active, children }: { active: PharmacyNavigationItem; children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => { getMe().then(setUser).catch(() => router.replace("/staff/login")); }, [router]);

  async function logout() {
    await post("/auth/logout").catch(() => {});
    router.push("/staff/login");
  }

  return <div className="shell">
    <aside className="side">
      <Link className="logo" href="/hms"><i>+</i>MediAccess</Link>
      <div className="rl">Pharmacist</div>
      <PharmacySidebar active={active} />
    </aside>
    <main className="main pharmacy-admin-main">
      <div className="top"><h1>Pharmacy dashboard</h1><span style={{ color: "var(--muted)", fontSize: 14 }}>{user?.name}</span><button className="btn ghost sm" onClick={() => void logout()}>Log out</button></div>
      {children}
    </main>
  </div>;
}

export type { PharmacyNavigationItem, PharmacyTab } from "./PD-sidebar";