"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { api, getMe, patch, post, type SessionUser } from "@/lib/api";
import type { StaffRole } from "@/lib/roles";
import { MyProfileNavLink } from "./MyProfileNavLink";
import { PharmacySidebar } from "@/components/pharmacy/PharmacyShell";
import { LabSidebar } from "@/components/clinical/LabShell";
import { AccountsSidebar } from "@/components/billing/AccountsShell";

type Session = { id: string; createdAt: string; expiresAt: string; current: boolean };
type Activity = { id: string; action: string; entityType: string; entityId: string | null; ip: string | null; createdAt: string };
type DoctorProfile = { id: string; registrationNumber: string | null; consultationMinutes: number; isBookable: boolean; specialties: string[]; _count: { appointments: number; treatments: number; prescriptions: number; investigationOrders: number } };

const permissions: Record<"ADMIN" | "RECEPTION" | "DOCTOR" | "NURSE" | "PHARMACIST" | "LAB_TECH" | "ACCOUNTANT", string[]> = {
  ADMIN: ["Manage staff, roles, and tenant operations", "Access patient, clinical, billing, pharmacy, and IPD modules", "Review system and compliance activity"],
  RECEPTION: ["Register patients and manage appointments", "Check in scheduled and walk-in patients", "Access patient records, billing, and bed availability"],
  DOCTOR: ["View assigned patients and longitudinal records", "Record consultations, prescribe, and order investigations", "Participate in inpatient rounds and theatre workflows"],
  NURSE: ["View assigned ward patients and active admissions", "Record vitals, nursing notes, fluid balance, and care charts", "Review medication orders and record MAR administrations"],
  PHARMACIST: ["Review signed prescriptions and dispense medications", "Maintain drug catalog, batches, and stock thresholds", "Review allergy, interaction, expiry, and controlled-drug alerts"],
  LAB_TECH: ["Manage investigation worklists and sample collection", "Upload diagnostic reports and review critical values", "Track laboratory turnaround times and patient records"],
  ACCOUNTANT: ["Manage OPD invoices, payments and receivables", "Maintain service rate cards and GST invoice settings", "Reconcile billing counters and review collection activity"],
};
const formatDate = (value: string) => new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

export function MyProfileDashboard({ role }: { role: Extract<StaffRole, "ADMIN" | "RECEPTION" | "DOCTOR" | "NURSE" | "PHARMACIST" | "LAB_TECH" | "ACCOUNTANT"> }) {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [draft, setDraft] = useState({ name: "", email: "", phone: "" });
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [doctorProfile, setDoctorProfile] = useState<DoctorProfile | null>(null);
  const [doctorDraft, setDoctorDraft] = useState({ registrationNumber: "", consultationMinutes: "20" });
  const [passwordDraft, setPasswordDraft] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadProfile() {
    setLoading(true);
    setError("");
    try {
      const [profile, sessionData, activityData, doctorData] = await Promise.all([
        getMe(),
        api<{ sessions: Session[] }>("/auth/me/sessions"),
        api<{ activity: Activity[] }>("/auth/me/activity"),
        role === "DOCTOR" ? api<{ doctor: DoctorProfile }>("/clinical/doctor-profile") : Promise.resolve(null),
      ]);
      setUser(profile);
      setDraft({ name: profile.name, email: profile.email, phone: profile.phone ?? "" });
      setSessions(sessionData.sessions);
      setActivity(activityData.activity);
      if (doctorData) {
        setDoctorProfile(doctorData.doctor);
        setDoctorDraft({ registrationNumber: doctorData.doctor.registrationNumber ?? "", consultationMinutes: String(doctorData.doctor.consultationMinutes) });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load your profile.");
    } finally { setLoading(false); }
  }

  useEffect(() => { void loadProfile(); }, []);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await patch<{ user: SessionUser }>("/auth/me", { ...draft, phone: draft.phone.trim() || null });
      setUser(result.user);
      setNotice("Profile details updated.");
      await loadProfile();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update your profile."); }
    finally { setBusy(false); }
  }

  async function saveDoctorProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setNotice("");
    try {
      await patch("/clinical/doctor-profile", { registrationNumber: doctorDraft.registrationNumber, consultationMinutes: Number(doctorDraft.consultationMinutes) });
      setNotice("Professional details updated.");
      await loadProfile();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update professional details."); }
    finally { setBusy(false); }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (passwordDraft.newPassword !== passwordDraft.confirmPassword) { setError("New password and confirmation do not match."); return; }
    setBusy(true); setError("");
    try {
      await post("/auth/me/password", { currentPassword: passwordDraft.currentPassword, newPassword: passwordDraft.newPassword });
      router.replace("/staff/login");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not change password."); }
    finally { setBusy(false); }
  }

  async function revokeSession(session: Session) {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await api<{ currentSession: boolean }>(`/auth/me/sessions/${session.id}`, { method: "DELETE" });
      if (result.currentSession) { router.replace("/staff/login"); return; }
      setNotice("Session revoked.");
      await loadProfile();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not revoke session."); }
    finally { setBusy(false); }
  }

  async function revokeOtherSessions() {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await post<{ revoked: number }>("/auth/me/sessions/revoke-others", {});
      setNotice(`${result.revoked} other session${result.revoked === 1 ? "" : "s"} revoked.`);
      await loadProfile();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not revoke other sessions."); }
    finally { setBusy(false); }
  }

  const nav = role === "ADMIN" ? [
    ["Overview", "/hms/dashboard/admin"], ["User & role management", "/hms/dashboard/admin/users"], ["IPD & OT", "/hms/dashboard/admin/ipd/overview"],
    ["Pharmacy Dispensing & Inventory", "/hms/dashboard/admin/pharmacy"], ["Patient records", "/hms/dashboard/admin/patients"], ["Billing & payments", "/hms/dashboard/admin/billing"],
    ["E-prescriptions", "/hms/dashboard/admin/prescriptions"], ["Investigations & worklists", "/hms/dashboard/admin/investigations"],
  ] : role === "RECEPTION" ? [
    ["Today", "/hms/dashboard/reception"], ["Register patient", "/hms/dashboard/reception?section=Register%20patient"], ["Appointments", "/hms/dashboard/reception?section=Appointments"],
    ["Queue & tokens", "/hms/dashboard/reception?section=Queue%20%26%20tokens"], ["OPD billing", "/hms/dashboard/reception/billing?tab=OPD%20billing"],
    ["Bed availability", "/hms/dashboard/reception/ipd?view=bed"], ["IPD & OT", "/hms/dashboard/reception/ipd?view=ot"],
    ["Patient records", "/hms/dashboard/reception/patients"], ["Billing & payments", "/hms/dashboard/reception/billing"],
  ] : role === "NURSE" ? [
    ["Assigned patients", "/hms/dashboard/nurse/patients"], ["Vitals entry", "/hms/dashboard/nurse/ipd?tab=nursing"], ["Nursing notes", "/hms/dashboard/nurse/ipd?tab=nursing"],
    ["IPD charts", "/hms/dashboard/nurse/ipd?tab=nursing"], ["Medication (MAR)", "/hms/dashboard/nurse/ipd?tab=nursing"], ["IPD & OT", "/hms/dashboard/nurse/ipd"],
    ["Patient records", "/hms/dashboard/nurse/patients"],
  ] : role === "PHARMACIST" ? [
    ["Overview", "/hms/dashboard/pharmacy"], ["Dispense queue", "/hms/dashboard/pharmacy/pharmacy"], ["Inventory & batches", "/hms/dashboard/pharmacy/pharmacy"],
    ["Drug master & safety", "/hms/dashboard/pharmacy/pharmacy"], ["Patient refill history", "/hms/dashboard/pharmacy/pharmacy"], ["Alerts", "/hms/dashboard/pharmacy/pharmacy"],
  ] : role === "LAB_TECH" ? [
    ["Worklist", "/hms/dashboard/lab?section=Worklist"], ["Sample collection", "/hms/dashboard/lab?section=Sample%20collection"],
    ["Upload reports", "/hms/dashboard/lab?section=Upload%20reports"], ["Critical alerts", "/hms/dashboard/lab?section=Critical%20alerts"], ["Turnaround", "/hms/dashboard/lab?section=Turnaround"],
    ["Patient records", "/hms/dashboard/lab/patients"], ["Investigations & worklists", "/hms/dashboard/lab/investigations"],
  ] : role === "ACCOUNTANT" ? [
    ["Overview", "/hms/dashboard/accounts?section=Overview"], ["OPD & IPD billing", "/hms/dashboard/accounts?section=OPD%20billing"],
    ["Packages & procedures", "/hms/dashboard/accounts?section=Services%20%26%20rates"], ["Insurance & TPA", "/hms/dashboard/accounts?section=Insurance%20%26%20TPA"],
    ["Government schemes", "/hms/dashboard/accounts?section=Government%20schemes"], ["GST & invoicing", "/hms/dashboard/accounts?section=GST%20%26%20invoicing"],
    ["Payments", "/hms/dashboard/accounts?section=Payments"], ["Financial controls", "/hms/dashboard/accounts?section=Reconciliation"], ["Revenue analytics", "/hms/dashboard/accounts?section=Revenue%20analytics"],
  ] : [
    ["My patients", "/hms/dashboard/doctor/patients"], ["Consultation", "/hms/dashboard/doctor"], ["E-prescriptions", "/hms/dashboard/doctor/prescriptions"],
    ["Investigations", "/hms/dashboard/doctor/investigations"], ["IPD rounds", "/hms/dashboard/doctor/ipd?tab=nursing"], ["IPD & OT", "/hms/dashboard/doctor/ipd"],
    ["Patient records", "/hms/dashboard/doctor/patients"],
  ];

  return <div className="shell">
    <aside className="side">
      <Link className="logo" href="/hms"><i>+</i>MediAccess</Link><div className="rl">{role === "ADMIN" ? "Admin" : role === "RECEPTION" ? "Reception" : role === "NURSE" ? "Nurse" : role === "PHARMACIST" ? "Pharmacist" : role === "LAB_TECH" ? "Lab technician" : role === "ACCOUNTANT" ? "Accounts" : "Doctor"}</div>
      {role === "PHARMACIST" ? <PharmacySidebar active="profile" /> : role === "LAB_TECH" ? <LabSidebar active="My Profile" /> : role === "ACCOUNTANT" ? <AccountsSidebar active="My profile" /> : <>{nav.map(([label, href]) => <Link key={label} className="nav" href={href}><span className="d" />{label}</Link>)}<MyProfileNavLink role={role} /></>}
    </aside>
    <main className="main profile-main">
      <div className="top"><h1>My profile</h1><span>{user?.name}</span><button className="btn ghost sm" onClick={() => void loadProfile()} disabled={loading}>Refresh</button></div>
      {error && <div className="msg err" role="alert">{error}</div>}{notice && <div className="msg ok" role="status">{notice}</div>}
      <div className="profile-dashboard">
        <section className="profile-panel"><header className="profile-panel-heading"><div><span>ACCOUNT</span><h2>Personal information</h2></div><div className="profile-avatar">{user?.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase() || "MA"}</div></header>
          <form className="profile-form" onSubmit={saveProfile}><label><span>Full name</span><input className="inp" required minLength={3} maxLength={100} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label><label><span>Email</span><input className="inp" type="email" required value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} /></label><label><span>Phone</span><input className="inp" type="tel" value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} /></label><button className="btn sm" disabled={busy || loading}>{busy ? "Saving…" : "Save changes"}</button></form>
          <p className="profile-unavailable">Profile photo uploads are not configured.</p>
        </section>
        <section className="profile-panel"><header className="profile-panel-heading"><div><span>ACCESS CONTROL</span><h2>Role & permissions</h2></div></header><div className="profile-role"><strong>{role}</strong><span>Assigned system role</span></div><ul className="profile-permissions">{permissions[role].map((permission) => <li key={permission}>{permission}</li>)}</ul></section>
        {role === "DOCTOR" && <section className="profile-panel profile-professional"><header className="profile-panel-heading"><div><span>CLINICAL CREDENTIALS</span><h2>Professional details</h2></div></header>
          {doctorProfile ? <><form className="profile-form" onSubmit={saveDoctorProfile}><label><span>Medical registration number</span><input className="inp" required minLength={2} maxLength={80} value={doctorDraft.registrationNumber} onChange={(event) => setDoctorDraft({ ...doctorDraft, registrationNumber: event.target.value })} /></label><label><span>Consultation duration</span><select className="inp" value={doctorDraft.consultationMinutes} onChange={(event) => setDoctorDraft({ ...doctorDraft, consultationMinutes: event.target.value })}>{[10, 15, 20, 30, 45, 60, 90, 120].map((minutes) => <option key={minutes} value={minutes}>{minutes} minutes</option>)}</select></label><button className="btn sm" disabled={busy || loading}>{busy ? "Saving…" : "Save professional details"}</button></form><div className="profile-doctor-specialties"><strong>Specialties</strong><div>{doctorProfile.specialties.length ? doctorProfile.specialties.map((specialty) => <span key={specialty}>{specialty}</span>) : <small>No specialties assigned</small>}</div><p>Appointment booking: {doctorProfile.isBookable ? "Enabled" : "Disabled"}</p></div><div className="profile-doctor-metrics">{[["Appointments", doctorProfile._count.appointments], ["Consultations", doctorProfile._count.treatments], ["Prescriptions", doctorProfile._count.prescriptions], ["Investigations", doctorProfile._count.investigationOrders]].map(([label, value]) => <article key={label}><strong>{value}</strong><span>{label}</span></article>)}</div></> : <p className="profile-muted">Doctor profile is not available for this account.</p>}
          <div className="profile-unavailable"><strong>Additional professional fields are not configured.</strong><span>Qualifications, experience years, spoken languages, consultation fees, and personal signature settings are not currently stored. Prescriptions use the platform's server-side integrity signature.</span></div>
        </section>}
        <section className="profile-panel"><header className="profile-panel-heading"><div><span>SECURITY</span><h2>Change password</h2></div></header><form className="profile-form" onSubmit={changePassword}><label><span>Current password</span><input className="inp" type="password" autoComplete="current-password" required value={passwordDraft.currentPassword} onChange={(event) => setPasswordDraft({ ...passwordDraft, currentPassword: event.target.value })} /></label><label><span>New password</span><input className="inp" type="password" autoComplete="new-password" minLength={8} required value={passwordDraft.newPassword} onChange={(event) => setPasswordDraft({ ...passwordDraft, newPassword: event.target.value })} /></label><label><span>Confirm new password</span><input className="inp" type="password" autoComplete="new-password" required value={passwordDraft.confirmPassword} onChange={(event) => setPasswordDraft({ ...passwordDraft, confirmPassword: event.target.value })} /></label><small>Use upper and lower case letters, a number, and a symbol. Changing your password signs out active sessions.</small><button className="btn sm" disabled={busy}>{busy ? "Updating…" : "Update password"}</button></form><div className="profile-unavailable"><strong>Multi-factor authentication</strong><span>Not configured for this account.</span></div></section>
        <section className="profile-panel"><header className="profile-panel-heading"><div><span>SESSIONS</span><h2>Active sign-ins</h2></div><button className="btn ghost sm" onClick={() => void revokeOtherSessions()} disabled={busy || sessions.length < 2}>Revoke others</button></header><div className="profile-session-list">{sessions.map((session) => <article key={session.id}><div><strong>{session.current ? "This session" : "Signed in"}</strong><span>Started {formatDate(session.createdAt)} · Expires {formatDate(session.expiresAt)}</span></div><button className="text-action" onClick={() => void revokeSession(session)} disabled={busy}>{session.current ? "Sign out" : "Revoke"}</button></article>)}{!sessions.length && <p className="profile-muted">No active sessions found.</p>}</div></section>
        <section className="profile-panel profile-notifications"><header className="profile-panel-heading"><div><span>PREFERENCES</span><h2>Notifications</h2></div></header><p>Email, SMS, and push notification preferences are not configurable in this account service.</p></section>
        <section className="profile-panel profile-activity"><header className="profile-panel-heading"><div><span>SECURITY HISTORY</span><h2>Recent activity</h2></div><span>Latest 100 events</span></header><div className="profile-activity-list">{activity.map((item) => <article key={item.id}><time>{formatDate(item.createdAt)}</time><strong>{item.action.replaceAll("_", " ")}</strong><span>{item.entityType}{item.entityId ? ` · ${item.entityId}` : ""}</span><small>{item.ip || "IP unavailable"}</small></article>)}{!activity.length && <p className="profile-muted">No recent activity recorded.</p>}</div></section>
      </div>
    </main>
  </div>;
}