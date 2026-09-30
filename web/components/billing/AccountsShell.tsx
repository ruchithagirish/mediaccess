"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { getMe, post, type SessionUser } from "@/lib/api";
import { MyProfileNavLink } from "@/components/hms/MyProfileNavLink";
import { ACCOUNTS_SECTIONS, type AccountsNavigationItem, type AccountsTab } from "./accounts-navigation";

export function AccountsSidebar({ active, onSectionSelect }: {
  active: AccountsNavigationItem;
  onSectionSelect?: (tab: AccountsTab) => void;
}) {
  return <>
    {ACCOUNTS_SECTIONS.map(({ label, tab }) => onSectionSelect
      ? <button key={tab} type="button" className={`nav ${active === label ? "on" : ""}`} aria-pressed={active === label} onClick={() => onSectionSelect(tab)}><span className="d" />{label}</button>
      : <Link key={tab} className={`nav ${active === label ? "on" : ""}`} aria-current={active === label ? "page" : undefined} href={`/hms/dashboard/accounts?section=${encodeURIComponent(tab)}`}><span className="d" />{label}</Link>)}
    <Link className={`nav ${active === "Patient records" ? "on" : ""}`} aria-current={active === "Patient records" ? "page" : undefined} href="/hms/dashboard/accounts/patients"><span className="d" />Patient records</Link>
    <MyProfileNavLink role="ACCOUNTANT" />
  </>;
}

export function AccountsShell({ active, children, onSectionSelect }: { active: AccountsNavigationItem; children: ReactNode; onSectionSelect?: (tab: AccountsTab) => void }) {
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
      <div className="rl">Accounts</div>
      <AccountsSidebar active={active} onSectionSelect={onSectionSelect} />
    </aside>
    <main className="main">
      <div className="top"><h1>Accounts dashboard</h1><span style={{ color: "var(--muted)", fontSize: 14 }}>{user?.name}</span><button className="btn ghost sm" onClick={() => void logout()}>Log out</button></div>
      {children}
    </main>
  </div>;
}