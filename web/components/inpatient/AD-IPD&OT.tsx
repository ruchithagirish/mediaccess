"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, getMe, post, type SessionUser } from "@/lib/api";
import { ROLE_TO_SLUG, roleLabel } from "@/lib/roles";
import { MyProfileNavLink } from "@/components/hms/MyProfileNavLink";

type Ward = { id: string; code: string; name: string; type: string; beds: { id: string; bedNumber: string; status: string; admissions: { patient: { mrn: string; user: { name: string } } }[] }[] };
type Admission = { id: string; admissionNumber: string; status: string; admittedAt: string; dischargedAt: string | null; billBalancePaise: number; patient: { mrn: string; user: { name: string } }; attendingDoctor: { user: { name: string } }; bed: { bedNumber: string; ward: { name: string } } };
type OTCase = { id: string; procedureName: string; scheduledStart: string; scheduledEnd: string; status: string; theatre: { id: string; name: string }; patient: { mrn: string; user: { name: string } }; surgeon: { user: { name: string } }; anaesthetist: { user: { name: string } }; checklistItems: { key: string; label: string; phase: string; checked: boolean }[] };
type Theatre = { id: string; code: string; name: string };

const formatNumber = new Intl.NumberFormat("en-IN");
const formatDateTime = (value: string) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const formatMoney = (paise: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(paise / 100);
const clinicDay = (value: Date) => {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const part = (type: string) => parts.find((item) => item.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
};
const clockMinutes = (value: string) => {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value));
  return Number(parts.find((item) => item.type === "hour")!.value) * 60 + Number(parts.find((item) => item.type === "minute")!.value);
};

export function InpatientOperationsOverview() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [wards, setWards] = useState<Ward[]>([]);
  const [admissions, setAdmissions] = useState<Admission[]>([]);
  const [theatres, setTheatres] = useState<Theatre[]>([]);
  const [cases, setCases] = useState<OTCase[]>([]);
  const [scheduleDate, setScheduleDate] = useState(() => clinicDay(new Date()));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => { getMe().then(setUser).catch(() => router.replace("/staff/login")); }, [router]);

  async function loadData() {
    try {
      const [wardData, admissionData, theatreData, caseData] = await Promise.all([
        api<{ wards: Ward[] }>("/ipd/wards"),
        api<{ admissions: Admission[] }>("/ipd/admissions?status=ALL"),
        api<{ theatres: Theatre[] }>("/ipd/theatres"),
        api<{ cases: OTCase[] }>("/ipd/ot/cases?includeCancelled=true"),
      ]);
      setWards(wardData.wards);
      setAdmissions(admissionData.admissions);
      setTheatres(theatreData.theatres);
      setCases(caseData.cases);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load IPD and OT operations.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
    const timer = window.setInterval(() => void loadData(), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  async function logout() {
    await post("/auth/logout").catch(() => {});
    router.push("/staff/login");
  }

  const beds = wards.flatMap((ward) => ward.beds);
  const activeAdmissions = admissions.filter((admission) => admission.status === "ADMITTED");
  const occupiedBeds = beds.filter((bed) => bed.status === "OCCUPIED").length;
  const availableBeds = beds.filter((bed) => bed.status === "AVAILABLE").length;
  const cleaningBeds = beds.filter((bed) => bed.status === "CLEANING").length;
  const offlineBeds = beds.filter((bed) => bed.status === "OUT_OF_SERVICE").length;
  const occupancy = beds.length ? Math.round((occupiedBeds / beds.length) * 100) : 0;
  const currentStayDays = activeAdmissions.map((admission) => Math.max(0, (Date.now() - new Date(admission.admittedAt).getTime()) / 86_400_000));
  const averageCurrentStay = currentStayDays.length ? currentStayDays.reduce((sum, days) => sum + days, 0) / currentStayDays.length : 0;
  const openBalanceAdmissions = activeAdmissions.filter((admission) => admission.billBalancePaise > 0);
  const dayCases = cases.filter((item) => item.status !== "CANCELLED" && clinicDay(new Date(item.scheduledStart)) === scheduleDate);
  const cancelledCases = cases.filter((item) => item.status === "CANCELLED" && clinicDay(new Date(item.scheduledStart)) === scheduleDate);
  const checklistPending = dayCases.filter((item) => item.status === "SCHEDULED" && item.checklistItems.some((entry) => entry.phase !== "SIGN_OUT" && !entry.checked)).length;
  const surgeonVolumes = Object.entries(dayCases.reduce<Record<string, number>>((counts, item) => {
    counts[item.surgeon.user.name] = (counts[item.surgeon.user.name] ?? 0) + 1;
    return counts;
  }, {})).sort((left, right) => right[1] - left[1]).slice(0, 5);

  return <div className="shell">
    <aside className="side">
      <Link className="logo" href="/hms"><i>+</i>MediAccess</Link>
      <div className="rl">{roleLabel("ADMIN")}</div>
      <Link className="nav" href="/hms/dashboard/admin"><span className="d" />Overview</Link>
      <Link className="nav" href="/hms/dashboard/admin/users"><span className="d" />User & role management</Link>
      <Link className="nav on" aria-current="page" href={`/hms/dashboard/${ROLE_TO_SLUG.ADMIN}/ipd/overview`}><span className="d" />IPD & OT</Link>
      <Link className="nav" href="/hms/dashboard/admin/pharmacy"><span className="d" />Pharmacy Dispensing & Inventory</Link>
      <Link className="nav" href="/hms/dashboard/admin/patients"><span className="d" />Patient records</Link>
      <Link className="nav" href="/hms/dashboard/admin/billing"><span className="d" />Billing & payments</Link>
      <Link className="nav" href="/hms/dashboard/admin/prescriptions"><span className="d" />E-prescriptions</Link>
      <Link className="nav" href="/hms/dashboard/admin/investigations"><span className="d" />Investigations & worklists</Link>
      <MyProfileNavLink role="ADMIN" />
    </aside>
    <main className="main ipd-admin-main">
      <div className="top"><h1>Admin dashboard</h1><span style={{ color: "var(--muted)", fontSize: 14 }}>{user?.name}</span><button className="btn ghost sm" onClick={() => void logout()}>Log out</button></div>
      <div className="ipd-operations">
    <header className="ipd-operations-header">
      <div><span className="ipd-kicker">INPATIENT SERVICES · ADMIN</span><h1>IPD & OT operations</h1><p>Bed capacity, inpatient census and theatre schedule.</p></div>
      <div className="ipd-operations-actions"><Link className="btn sm" href="/hms/dashboard/admin/ipd">Open IPD workspace</Link><button className="btn ghost sm" type="button" onClick={() => { setLoading(true); void loadData(); }} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button></div>
    </header>

    {error && <div className="msg err" role="alert">{error}</div>}

    <section className="ipd-ops-metrics" aria-label="Inpatient and theatre summary">
      <article><span>Inpatients</span><strong>{loading ? "…" : formatNumber.format(activeAdmissions.length)}</strong><small>Currently admitted</small></article>
      <article><span>Bed occupancy</span><strong>{loading ? "…" : `${occupancy}%`}</strong><small>{occupiedBeds} of {beds.length} configured beds</small></article>
      <article><span>Available beds</span><strong>{loading ? "…" : formatNumber.format(availableBeds)}</strong><small>{cleaningBeds} cleaning · {offlineBeds} out of service</small></article>
      <article><span>Avg. current stay</span><strong>{loading ? "…" : `${averageCurrentStay.toFixed(1)} d`}</strong><small>Active admissions only</small></article>
      <article><span>Uncleared running bills</span><strong>{loading ? "…" : formatNumber.format(openBalanceAdmissions.length)}</strong><small>{formatMoney(openBalanceAdmissions.reduce((sum, admission) => sum + admission.billBalancePaise, 0))} outstanding</small></article>
    </section>

    <div className="ipd-ops-grid">
      <section className="ipd-ops-panel ipd-ops-bed-panel">
        <header className="ipd-ops-panel-head"><div><span className="ipd-kicker">LIVE BED MAP</span><h2>Ward capacity</h2></div><span>{wards.length} wards</span></header>
        <div className="ipd-ops-bed-legend"><span><i className="available" />Available {availableBeds}</span><span><i className="occupied" />Occupied {occupiedBeds}</span><span><i className="cleaning" />Cleaning {cleaningBeds}</span><span><i className="offline" />Offline {offlineBeds}</span></div>
        <div className="ipd-ops-wards">{wards.map((ward) => {
          const wardOccupied = ward.beds.filter((bed) => bed.status === "OCCUPIED").length;
          const wardFill = ward.beds.length ? (wardOccupied / ward.beds.length) * 100 : 0;
          return <article className="ipd-ops-ward" key={ward.id}>
            <header><div><strong>{ward.name}</strong><span>{ward.code} · {ward.type.replaceAll("_", " ")}</span></div><small>{wardOccupied}/{ward.beds.length}</small></header>
            <div className="ipd-ops-occupancy"><i style={{ width: `${wardFill}%` }} /></div>
            <div className="ipd-ops-bed-grid">{ward.beds.map((bed) => {
              const patient = bed.admissions[0]?.patient;
              return <div className={`ipd-ops-bed ${bed.status.toLowerCase()}`} key={bed.id} title={patient ? `${patient.user.name} · ${patient.mrn}` : bed.status.replaceAll("_", " ")}><strong>{bed.bedNumber}</strong><span>{patient?.user.name ?? bed.status.replaceAll("_", " ")}</span></div>;
            })}{!ward.beds.length && <p className="ipd-empty">No beds configured.</p>}</div>
          </article>;
        })}{!wards.length && !loading && <p className="ipd-empty">No active wards configured.</p>}</div>
      </section>

      <section className="ipd-ops-panel ipd-ops-alerts">
        <header className="ipd-ops-panel-head"><div><span className="ipd-kicker">CARE & CAPACITY</span><h2>Needs attention</h2></div></header>
        {openBalanceAdmissions.length > 0 ? <div className="ipd-ops-alert-list">{openBalanceAdmissions.slice(0, 5).map((admission) => <article key={admission.id}><span className="ipd-ops-alert-mark">₹</span><div><strong>{admission.patient.user.name}</strong><span>{admission.admissionNumber} · {admission.bed.ward.name} {admission.bed.bedNumber}</span></div><b>{formatMoney(admission.billBalancePaise)}</b></article>)}</div> : <p className="ipd-empty">No active admissions with an outstanding running-bill balance.</p>}
        <Link className="ipd-ops-text-link" href="/hms/dashboard/admin/ipd">Review admissions <span aria-hidden="true">→</span></Link>
      </section>
    </div>

    <section className="ipd-ops-panel ipd-ops-theatre-panel">
      <header className="ipd-ops-panel-head"><div><span className="ipd-kicker">OPERATION THEATRE</span><h2>Daily theatre schedule</h2></div><label className="ipd-ops-date">Schedule date<input className="inp" type="date" value={scheduleDate} onChange={(event) => setScheduleDate(event.target.value)} /></label></header>
      <div className="ipd-ops-ot-summary"><span><strong>{dayCases.length}</strong> cases scheduled</span><span><strong>{checklistPending}</strong> scheduled cases with incomplete WHO sign-in/time-out</span><span><strong>{cancelledCases.length}</strong> cancelled records</span></div>
      <div className="ipd-ops-timeline-scroll"><div className="ipd-ops-timeline">
        <div className="ipd-ops-timeline-corner">Theatre</div>
        {Array.from({ length: 24 }, (_, hour) => <span className="ipd-ops-time-label" key={hour}>{String(hour).padStart(2, "0")}:00</span>)}
        {theatres.map((theatre) => <div className="ipd-ops-theatre-row" key={theatre.id}>
          <strong title={`${theatre.code} · ${theatre.name}`}>{theatre.name}</strong>
          <div className="ipd-ops-hour-lines" />
          {dayCases.filter((item) => item.theatre.id === theatre.id).map((item) => {
            const startMinute = clockMinutes(item.scheduledStart);
            const endMinute = clinicDay(new Date(item.scheduledEnd)) === scheduleDate ? clockMinutes(item.scheduledEnd) : 1440;
            const startSlot = Math.max(0, Math.min(47, Math.floor(startMinute / 30)));
            const span = Math.max(1, Math.min(48 - startSlot, Math.ceil((endMinute - startMinute) / 30)));
            const startLabel = formatDateTime(item.scheduledStart);
            return <article className={`ipd-ops-case ${item.status.toLowerCase()}`} key={item.id} style={{ gridColumn: `${startSlot + 2} / span ${span}` }} title={`${item.procedureName} · ${item.patient.user.name} · ${startLabel}`}>
              <strong>{item.procedureName}</strong><span>{item.patient.user.name} · {item.surgeon.user.name}</span><small>{new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" }).format(new Date(item.scheduledStart))} · {item.status.replaceAll("_", " ")}</small>
            </article>;
          })}
        </div>)}
        {!theatres.length && <p className="ipd-empty ipd-ops-no-theatres">No operating theatres configured.</p>}
      </div></div>
      <div className="ipd-ops-surgeon-grid"><section><h3>Case volume by surgeon</h3>{surgeonVolumes.length ? surgeonVolumes.map(([name, count]) => <div className="ipd-ops-surgeon" key={name}><span>{name}</span><strong>{count}</strong></div>) : <p className="ipd-empty">No cases in the current schedule records.</p>}</section><section><h3>Cancelled case records</h3>{cancelledCases.length ? cancelledCases.slice(0, 5).map((item) => <div className="ipd-ops-cancelled" key={item.id}><strong>{item.procedureName}</strong><span>{item.patient.user.name} · {item.theatre.name} · scheduled {formatDateTime(item.scheduledStart)}</span></div>) : <p className="ipd-empty">No cancelled cases recorded.</p>}</section></div>
      <p className="ipd-ops-limit-note">Reserved beds, ELOS, signed digital consent, structured anaesthesia milestones, cancellation timestamps/reasons, actual theatre turnover and automatic recovery-note integration are not modeled here. The schedule shows planned bookings; WHO checklist enforcement is not a substitute for consent verification.</p>
      <Link className="ipd-ops-text-link" href="/hms/dashboard/admin/ipd">Open OT cases, checklist and operative notes <span aria-hidden="true">→</span></Link>
    </section>

    <section className="ipd-ops-panel ipd-ops-admissions">
      <header className="ipd-ops-panel-head"><div><span className="ipd-kicker">INPATIENT CENSUS</span><h2>Current admissions</h2></div><span>{activeAdmissions.length} admitted</span></header>
      <div className="tw"><table><thead><tr><th>Patient</th><th>Admission</th><th>Ward / bed</th><th>Attending</th><th>Admitted</th><th>Current stay</th><th>Running balance</th></tr></thead><tbody>
        {activeAdmissions.map((admission) => <tr key={admission.id}><td>{admission.patient.user.name}<small className="table-sub">{admission.patient.mrn}</small></td><td>{admission.admissionNumber}</td><td>{admission.bed.ward.name} · {admission.bed.bedNumber}</td><td>{admission.attendingDoctor.user.name}</td><td>{formatDateTime(admission.admittedAt)}</td><td>{((Date.now() - new Date(admission.admittedAt).getTime()) / 86_400_000).toFixed(1)} d</td><td>{formatMoney(admission.billBalancePaise)}</td></tr>)}
        {!activeAdmissions.length && <tr><td colSpan={7}>No active admissions.</td></tr>}
      </tbody></table></div>
      <p className="ipd-ops-limit-note">ALOS is shown here as the average current stay for admitted patients. Historical discharged-stay ALOS requires a dedicated report. Running bill totals include charges entered through the inpatient billing workflow.</p>
    </section>
      </div>
    </main>
  </div>;
}