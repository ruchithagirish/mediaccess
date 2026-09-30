"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { DASHBOARDS, type Cell } from "@/lib/dashboards";
import { api, getMe, patch, post, type SessionUser } from "@/lib/api";
import { ROLES, ROLE_TO_SLUG, roleLabel, type StaffRole } from "@/lib/roles";
import type { AppointmentSummary } from "@/lib/appointments";
import { AdminOverview } from "./AD-Overview";
import { AdminUserManagement } from "./AD-user&role-mt";
import { TreatmentInvoiceForm } from "../billing/TreatmentInvoiceForm";
import { LiveQueueBoard } from "./LiveQueueBoard";
import { ReceptionActions } from "../reception/RD-reg&walkin";
import { MyProfileNavLink } from "./MyProfileNavLink";

const cell = (c: Cell) => (typeof c === "string" ? c : <span className={`pill p-${c.c}`}>{c.t}</span>);
const statusTone: Record<AppointmentSummary["status"], string> = {
  BOOKED: "warn",
  CHECKED_IN: "ok",
  IN_CONSULTATION: "info",
  COMPLETED: "ok",
  CANCELLED: "bad",
  NO_SHOW: "bad",
};

function clinicDate() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)!.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function dashboardRoute(role: StaffRole, label: string) {
  const base = `/hms/dashboard/${ROLE_TO_SLUG[role]}`;
  const routes: Partial<Record<StaffRole, Record<string, string>>> = {
    ADMIN: { Overview: base, "User & role management": `${base}/users` },
    RECEPTION: { Today: base, "Register patient": base, Appointments: base, "Queue & tokens": base, "OPD billing": `${base}/billing`, "Bed availability": `${base}/ipd` },
    DOCTOR: { "My patients": `${base}/patients`, Consultation: base, "E-prescriptions": `${base}/prescriptions`, Investigations: `${base}/investigations`, "IPD rounds": `${base}/ipd?tab=nursing` },
    NURSE: { "Assigned patients": `${base}/patients`, "Vitals entry": `${base}/ipd?tab=nursing`, "Nursing notes": `${base}/ipd?tab=nursing`, "IPD charts": `${base}/ipd?tab=nursing`, "Medication (MAR)": `${base}/ipd?tab=nursing` },
    PHARMACIST: { "Dispense queue": `${base}/pharmacy`, Prescriptions: `${base}/pharmacy`, "Drug inventory": `${base}/pharmacy`, "Batches & expiry": `${base}/pharmacy`, "Schedule H register": `${base}/pharmacy` },
    LAB_TECH: { Worklist: `${base}/investigations`, "Sample collection": `${base}/investigations`, "Upload reports": `${base}/investigations`, "Critical alerts": `${base}/investigations`, Turnaround: `${base}/investigations` },
    ACCOUNTANT: { Collections: `${base}/billing`, Invoices: `${base}/billing`, Payments: `${base}/billing`, Receivables: `${base}/billing`, Reconciliation: `${base}/billing`, "GST reports": `${base}/billing` },
  };
  return routes[role]?.[label] ?? null;
}

function actionRoute(role: StaffRole, label: string) {
  const base = `/hms/dashboard/${ROLE_TO_SLUG[role]}`;
  const routes: Partial<Record<StaffRole, Record<string, string>>> = {
    DOCTOR: { "New e-prescription": `${base}/prescriptions`, "Order investigation": `${base}/investigations` },
    NURSE: { "Record vitals": `${base}/ipd?tab=nursing`, "Add nursing note": `${base}/ipd?tab=nursing`, "Mark medication given": `${base}/ipd?tab=nursing` },
    PHARMACIST: { Dispense: `${base}/pharmacy`, "Update stock": `${base}/pharmacy` },
    LAB_TECH: { "Collect sample": `${base}/investigations`, "Upload report": `${base}/investigations`, "Verify result": `${base}/investigations` },
    ACCOUNTANT: { "Create invoice": `${base}/billing`, "Record payment": `${base}/billing`, "Export GST report": `${base}/billing` },
  };
  return routes[role]?.[label] ?? null;
}

export function DashboardView({ role }: { role: StaffRole }) {
  const router = useRouter();
  const pathname = usePathname();
  const d = DASHBOARDS[role];
  const [user, setUser] = useState<SessionUser | null>(null);
  const [active, setActive] = useState(d.nav[0]);
  const [note, setNote] = useState("");
  const [appointments, setAppointments] = useState<AppointmentSummary[] | null>(null);
  const [appointmentError, setAppointmentError] = useState("");
  const [checkingIn, setCheckingIn] = useState<string | null>(null);
  const [treatmentAppointment, setTreatmentAppointment] = useState<AppointmentSummary | null>(null);

  useEffect(() => { getMe().then(setUser).catch(() => router.replace("/staff/login")); }, [router]);
  const loadAppointments = useCallback(async () => {
    try {
      const result = await api<{ appointments: AppointmentSummary[] }>(`/appointments?date=${clinicDate()}`);
      setAppointments(result.appointments);
      setAppointmentError("");
    } catch (error) {
      setAppointmentError(error instanceof Error ? error.message : "Could not load appointments.");
    }
  }, []);
  useEffect(() => {
    if (role !== "RECEPTION" && role !== "DOCTOR") return;
    const timer = window.setInterval(() => void loadAppointments(), 20000);
    return () => window.clearInterval(timer);
  }, [loadAppointments, role]);
  useEffect(() => { if (!note) return; const t = setTimeout(() => setNote(""), 2400); return () => clearTimeout(t); }, [note]);

  async function logout() { await post("/auth/logout").catch(() => {}); router.push("/staff/login"); }
  async function checkIn(appointmentId: string) {
    setCheckingIn(appointmentId);
    setAppointmentError("");
    try {
      await post(`/appointments/${appointmentId}/check-in`, {});
      await loadAppointments();
    } catch (error) {
      setAppointmentError(error instanceof Error ? error.message : "Could not check in this appointment.");
    } finally {
      setCheckingIn(null);
    }
  }
  async function startConsultation(appointmentId: string) {
    setCheckingIn(appointmentId);
    setAppointmentError("");
    try {
      await patch(`/appointments/${appointmentId}`, { status: "IN_CONSULTATION" });
      await loadAppointments();
              {d.kpis.map(([k, v, delta, dir]) => (
                <div className="card kpi" key={k}><div className="k">{k}</div><div className="v">{v}</div><div className={`dl ${dir}`}>{delta}</div></div>
              ))}
    } catch (error) {
      setAppointmentError(error instanceof Error ? error.message : "Could not start this consultation.");
    } finally {
      setCheckingIn(null);
    }
  }
  const myRoles = ROLES.filter((r) => user?.roles.includes(r.id));
  const liveAppointments = role === "RECEPTION" || role === "DOCTOR";
  const currentNav = role === "ADMIN" && pathname.endsWith("/users") ? "User & role management" : active;

  return (
    <div className="shell">
      <aside className="side">
        <Link className="logo" href="/hms"><i>+</i>MediAccess</Link>
        <div className="rl">{roleLabel(role)}</div>
        {d.nav.filter((n) => dashboardRoute(role, n)).map((n) => (
          <Link key={n} className={`nav ${n === currentNav ? "on" : ""}`} href={dashboardRoute(role, n)!} onClick={() => setActive(n)}>
            <span className="d" />{n}
          </Link>
        ))}
        {["ADMIN", "RECEPTION", "DOCTOR", "NURSE"].includes(role) && <Link className="nav" href={`/hms/dashboard/${ROLE_TO_SLUG[role]}/ipd${role === "ADMIN" ? "/overview" : ""}`}><span className="d" />IPD & OT</Link>}
          {["ADMIN", "PHARMACIST"].includes(role) && <Link className="nav" href={`/hms/dashboard/${ROLE_TO_SLUG[role]}/pharmacy`}><span className="d" />Pharmacy Dispensing & Inventory</Link>}
        <Link className="nav" href={`/hms/dashboard/${ROLE_TO_SLUG[role]}/patients`}><span className="d" />Patient records</Link>
        {["ADMIN", "RECEPTION", "ACCOUNTANT"].includes(role) && <Link className="nav" href={`/hms/dashboard/${ROLE_TO_SLUG[role]}/billing`}><span className="d" />Billing & payments</Link>}
        {["DOCTOR", "PHARMACIST", "ADMIN"].includes(role) && <Link className="nav" href={`/hms/dashboard/${ROLE_TO_SLUG[role]}/prescriptions`}><span className="d" />E-prescriptions</Link>}
        {["DOCTOR", "LAB_TECH", "ADMIN"].includes(role) && <Link className="nav" href={`/hms/dashboard/${ROLE_TO_SLUG[role]}/investigations`}><span className="d" />Investigations & worklists</Link>}
        {(role === "ADMIN" || role === "RECEPTION" || role === "DOCTOR") && <MyProfileNavLink role={role} />}
      </aside>
      <main className="main">
        <div className="top">
          <h1>{currentNav === "User & role management" ? currentNav : d.title}</h1>
          {myRoles.length > 1 && (
            <div className="sw" aria-label="Switch role">
              {myRoles.map((r) => (
                <button key={r.id} className={r.id === role ? "on" : ""} onClick={() => router.push(`/hms/dashboard/${ROLE_TO_SLUG[r.id]}`)}>
                  {r.label}
                </button>
              ))}
            </div>
          )}
          <span style={{ color: "var(--muted)", fontSize: 14 }}>{user?.name}</span>
          <button className="btn ghost sm" onClick={logout}>Log out</button>
        </div>

        {role === "ADMIN" ? currentNav === "User & role management" ? <AdminUserManagement currentUserId={user?.id ?? ""} /> : <AdminOverview /> : <>
        <div className="grid g4">
          {d.kpis.map(([k, v, delta, dir]) => (
            <div className="card kpi" key={k}><div className="k">{k}</div><div className="v">{v}</div><div className={`dl ${dir}`}>{delta}</div></div>
          ))}
        </div>

        <div className="panels">
          <div className="card">
            <div className="ph"><h3>{liveAppointments ? role === "RECEPTION" ? "Today's appointments" : "My appointments today" : d.table.title}</h3></div>
            {liveAppointments ? (
              <>
                {appointmentError && <div className="msg err" role="alert">{appointmentError}</div>}
                <div className="tw">
                  <table>
                    <thead><tr>{(role === "RECEPTION" ? ["Token", "Patient", "Doctor", "Time", "Status", ""] : ["Token", "Patient", "Time", "Reason", "Status", ""]).map((heading) => <th key={heading || "action"}>{heading}</th>)}</tr></thead>
                    <tbody>
                      {appointments === null && <tr><td colSpan={role === "RECEPTION" ? 6 : 5}>Loading appointments…</td></tr>}
                      {appointments?.map((appointment) => (
                        <tr key={appointment.id}>
                          <td>{appointment.tokenNumber ? `T-${appointment.tokenNumber}` : "—"}</td>
                          <td>{appointment.patient.name}<small className="table-sub">{appointment.patient.mrn}</small></td>
                          {role === "RECEPTION" && <td>{appointment.doctor.name}</td>}
                          <td>{appointment.startTime}</td>
                          {role === "DOCTOR" && <td>{appointment.reason || "—"}</td>}
                          <td><span className={`pill p-${statusTone[appointment.status]}`}>{appointment.status.replaceAll("_", " ")}</span></td>
                          {role === "RECEPTION" && <td>{appointment.status === "BOOKED" ? <button className="btn sm" onClick={() => checkIn(appointment.id)} disabled={checkingIn === appointment.id}>{checkingIn === appointment.id ? "Checking in…" : "Check in"}</button> : "—"}</td>}
                          {role === "DOCTOR" && <td>{appointment.status === "CHECKED_IN" ? <button className="btn sm" onClick={() => startConsultation(appointment.id)} disabled={checkingIn === appointment.id}>{checkingIn === appointment.id ? "Starting…" : "Start"}</button> : appointment.status === "IN_CONSULTATION" ? <button className="btn sm" onClick={() => setTreatmentAppointment(appointment)}>Complete & invoice</button> : "—"}</td>}
                        </tr>
                      ))}
                      {appointments?.length === 0 && <tr><td colSpan={role === "RECEPTION" ? 6 : 5}>No appointments scheduled today.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="tw">
                <table>
                  <thead><tr>{d.table.cols.map((c) => <th key={c}>{c}</th>)}</tr></thead>
                  <tbody>{d.table.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{cell(c)}</td>)}</tr>)}</tbody>
                </table>
              </div>
            )}
          </div>
          {role === "RECEPTION" ? <div className="card"><LiveQueueBoard /></div> : (
            <div className="card">
              <div className="ph"><h3>{d.side.title}</h3></div>
              {d.side.items.map(([a, b]) => <div className="li" key={a}><span>{a}</span><b>{b}</b></div>)}
            </div>
          )}
        </div>

        {role === "RECEPTION" ? <ReceptionActions /> : (
          <div className="acts">
            {d.actions.filter((a) => actionRoute(role, a)).map((a) => <Link key={a} className="btn sm" href={actionRoute(role, a)!}>{a}</Link>)}
          </div>
        )}
        </>}
      </main>
      {treatmentAppointment && <TreatmentInvoiceForm
        appointment={treatmentAppointment}
        onClose={() => setTreatmentAppointment(null)}
        onComplete={(invoice) => {
          setTreatmentAppointment(null);
          setNote(`Invoice ${invoice.invoiceNumber} issued.`);
          void loadAppointments();
        }}
      />}
      {note && <div className="toast">{note}</div>}
    </div>
  );
}
