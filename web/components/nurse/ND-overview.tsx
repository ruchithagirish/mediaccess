"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { NurseShell } from "./ND-sidebar";

 type AdmissionSummary = {
  id: string; admissionNumber: string; diagnosis: string; admittedAt: string; status: string; billBalancePaise: number;
  patient: { id: string; mrn: string; user: { name: string } };
  attendingDoctor: { user: { name: string } };
  bed: { bedNumber: string; ward: { name: string } };
  progressNotes?: { version: number; content: string; createdAt: string }[];
};

type AdmissionDetail = AdmissionSummary & {
  vitals: { id: string; recordedAt: string; abnormal: boolean; systolic: number | null; diastolic: number | null; pulse: number | null; temperature: number | null; oxygenSaturation: number | null; respiratoryRate: number | null }[];
  inputOutputEntries: { id: string; type: string; volumeMl: number; description: string; recordedAt: string }[];
  medicationOrders: { id: string; medication: string; dose: string; route: string; frequency: string; nextDueAt: string | null; administrations: { id: string; result: string; administeredAt: string }[] }[];
};
type Ward = { id: string; name: string; beds: { id: string; bedNumber: string; status: string; admissions: { patient: { mrn: string; user: { name: string } } }[] }[] };

const dateTime = (value: string) => new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const currency = (paise: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(paise / 100);

function medicationIsDue(order: AdmissionDetail["medicationOrders"][number], now: number) {
  if (!order.nextDueAt || new Date(order.nextDueAt).getTime() > now) return false;
  return !order.administrations.some((entry) => entry.result === "GIVEN" && new Date(entry.administeredAt).getTime() >= new Date(order.nextDueAt!).getTime());
}

export function NurseDashboard() {
  const [admissions, setAdmissions] = useState<AdmissionSummary[]>([]);
  const [details, setDetails] = useState<AdmissionDetail[]>([]);
  const [wards, setWards] = useState<Ward[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());

  async function loadData() {
    setError("");
    try {
      const [admissionData, wardData] = await Promise.all([
        api<{ admissions: AdmissionSummary[] }>("/ipd/admissions"),
        api<{ wards: Ward[] }>("/ipd/wards"),
      ]);
      const active = admissionData.admissions.filter((item) => item.status === "ADMITTED");
      setAdmissions(active);
      setWards(wardData.wards);
      const detailResults = await Promise.all(active.slice(0, 40).map(async (item) => {
        try { return (await api<{ admission: AdmissionDetail }>(`/ipd/admissions/${item.id}`)).admission; }
        catch { return null; }
      }));
      setDetails(detailResults.filter((item): item is AdmissionDetail => item !== null));
      setNow(Date.now());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load ward and inpatient records.");
    } finally { setLoading(false); }
  }

  useEffect(() => {
    void loadData();
    const timer = window.setInterval(() => void loadData(), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const availableBeds = wards.reduce((sum, ward) => sum + ward.beds.filter((bed) => bed.status === "AVAILABLE").length, 0);
  const abnormalPatients = details.filter((item) => item.vitals[0]?.abnormal).length;
  const dueMedications = details.flatMap((item) => item.medicationOrders.filter((order) => medicationIsDue(order, now)).map((order) => ({ admission: item, order })));
  const latestDetails = new Map(details.map((item) => [item.id, item]));

  return <NurseShell active="Overview">
    <div className="nurse-dashboard">
      <header className="nurse-dashboard-header"><div><span className="nurse-dashboard-kicker">INPATIENT CARE · LIVE</span><h2>Ward overview</h2><p>Current admissions, monitoring flags, medication rounds, and bed capacity.</p></div><button className="btn ghost sm" onClick={() => void loadData()} disabled={loading}>Refresh</button></header>
      {error && <div className="msg err" role="alert">{error}</div>}
      <section className="nurse-dashboard-metrics" aria-label="Nursing workload summary">
        <article><span>Active inpatients</span><strong>{loading ? "…" : admissions.length}</strong><small>Across all wards</small></article>
        <article><span>Available beds</span><strong>{loading ? "…" : availableBeds}</strong><small>Active bed map</small></article>
        <article><span>Abnormal vital flags</span><strong className={abnormalPatients ? "nurse-metric-alert" : ""}>{loading ? "…" : abnormalPatients}</strong><small>Most recent observations</small></article>
        <article><span>Medication due</span><strong className={dueMedications.length ? "nurse-metric-alert" : ""}>{loading ? "…" : dueMedications.length}</strong><small>Review the MAR</small></article>
      </section>
      <div className="nurse-dashboard-grid">
        <section className="nurse-dashboard-panel"><header><div><span className="nurse-dashboard-kicker">WARD CENSUS</span><h3>Current patients</h3></div><Link className="text-action" href="/hms/dashboard/nurse/ipd?tab=nursing">Open IPD charts →</Link></header>
          <div className="nurse-admission-list">{admissions.map((admission) => {
            const detail = latestDetails.get(admission.id);
            const latestVital = detail?.vitals[0];
            const latestNote = detail?.progressNotes?.[0];
            const dueCount = detail?.medicationOrders.filter((order) => medicationIsDue(order, now)).length ?? 0;
            return <article className="nurse-admission-row" key={admission.id}><div className="nurse-admission-primary"><div><strong>{admission.patient.user.name}</strong><span>{admission.patient.mrn} · {admission.admissionNumber}</span></div><b>{admission.bed.ward.name} · {admission.bed.bedNumber}</b></div><p>{admission.diagnosis}</p><div className="nurse-admission-status"><span>Dr. {admission.attendingDoctor.user.name}</span>{latestVital && <span className={latestVital.abnormal ? "nurse-status-alert" : ""}>{latestVital.abnormal ? "Abnormal vitals" : `Vitals ${dateTime(latestVital.recordedAt)}`}</span>}<span>{dueCount} medication{dueCount === 1 ? "" : "s"} due</span><span>{currency(admission.billBalancePaise)} balance</span></div>{latestNote && <small className="nurse-latest-note">Latest note v{latestNote.version} · {dateTime(latestNote.createdAt)} · {latestNote.content}</small>}<Link className="text-action" href="/hms/dashboard/nurse/ipd?tab=nursing">Open chart</Link></article>;
          })}{!admissions.length && !loading && <p className="nurse-dashboard-empty">No active admissions are assigned to the current ward census.</p>}</div>
        </section>
        <aside className="nurse-dashboard-panel nurse-dashboard-side-panel"><header><div><span className="nurse-dashboard-kicker">MEDICATION ADMINISTRATION</span><h3>Due in MAR</h3></div><Link className="text-action" href="/hms/dashboard/nurse/ipd?tab=nursing">Open MAR →</Link></header>
          <div className="nurse-due-list">{dueMedications.slice(0, 8).map(({ admission, order }) => <article key={`${admission.id}-${order.id}`}><div><strong>{order.medication} · {order.dose}</strong><span>{admission.patient.user.name} · {admission.bed.ward.name} {admission.bed.bedNumber}</span></div><small>{order.nextDueAt ? dateTime(order.nextDueAt) : "Due"}</small></article>)}{!dueMedications.length && !loading && <p className="nurse-dashboard-empty">No scheduled medications are currently overdue or due.</p>}</div>
          <div className="nurse-bed-summary"><span>Ward capacity</span>{wards.map((ward) => <div key={ward.id}><strong>{ward.name}</strong><small>{ward.beds.filter((bed) => bed.status === "OCCUPIED").length}/{ward.beds.length} occupied · {ward.beds.filter((bed) => bed.status === "CLEANING").length} cleaning</small></div>)}{!wards.length && <p className="nurse-dashboard-empty">No active wards configured.</p>}</div>
        </aside>
      </div>
    </div>
  </NurseShell>;
}
