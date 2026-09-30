"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { getMe, post, type SessionUser } from "@/lib/api";
import { MyProfileNavLink } from "@/components/hms/MyProfileNavLink";
import { LAB_SECTIONS, type LabNavigationItem } from "./LD-sidebar";

export function LabSidebar({ active }: { active: LabNavigationItem }) {
  return <>
    {LAB_SECTIONS.map((section) => <Link key={section} className={`nav ${active === section ? "on" : ""}`} aria-current={active === section ? "page" : undefined} href={`/hms/dashboard/lab?section=${encodeURIComponent(section)}`}><span className="d" />{section}</Link>)}
    <Link className={`nav ${active === "Patient records" ? "on" : ""}`} aria-current={active === "Patient records" ? "page" : undefined} href="/hms/dashboard/lab/patients"><span className="d" />Patient Records</Link>
    <Link className={`nav ${active === "Investigations & worklists" ? "on" : ""}`} aria-current={active === "Investigations & worklists" ? "page" : undefined} href="/hms/dashboard/lab/investigations"><span className="d" />Investigations & Worklists</Link>
    <MyProfileNavLink role="LAB_TECH" />
  </>;
}

export function LabShell({ active, children }: { active: LabNavigationItem; children: ReactNode }) {
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
      <div className="rl">Lab technician</div>
      <LabSidebar active={active} />
    </aside>
    <main className="main">
      <div className="top"><h1>Laboratory dashboard</h1><span style={{ color: "var(--muted)", fontSize: 14 }}>{user?.name}</span><button className="btn ghost sm" onClick={() => void logout()}>Log out</button></div>
      {children}
    </main>
  </div>;
}