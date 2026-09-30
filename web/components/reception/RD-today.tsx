"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { api, patch, post } from "@/lib/api";
import type { AppointmentSummary, DoctorOption } from "@/lib/appointments";
import { LiveQueueBoard } from "@/components/hms/LiveQueueBoard";
import { ReceptionActions } from "./RD-reg&walkin";
import { ReceptionShell } from "./RD-sidebar";
import type { ReceptionPatient } from "@/lib/reception";

type ReceptionSection = "Today" | "Register patient" | "Appointments" | "Queue & tokens";
type QueueSnapshot = { id: string; status: string };
type WardSnapshot = { beds: { status: string }[] };
type BillingSnapshot = { collectedPaise: number; outstandingPaise: number };

function businessDate() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

const money = (paise: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(paise / 100);

export function ReceptionDashboard() {
  const [section, setSection] = useState<ReceptionSection>("Today");
  const [appointments, setAppointments] = useState<AppointmentSummary[]>([]);
  const [queue, setQueue] = useState<QueueSnapshot[]>([]);
  const [wards, setWards] = useState<WardSnapshot[]>([]);
  const [billing, setBilling] = useState<BillingSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  async function loadData() {
    const date = businessDate();
    const results = await Promise.allSettled([
      api<{ appointments: AppointmentSummary[] }>(`/appointments?date=${date}`),
      api<{ queue: QueueSnapshot[] }>("/queue"),
      api<{ wards: WardSnapshot[] }>("/ipd/wards"),
      api<BillingSnapshot>(`/billing/dashboard?date=${date}`),
    ]);
    const failures: string[] = [];
    if (results[0].status === "fulfilled") setAppointments(results[0].value.appointments);
    else failures.push("appointments");
    if (results[1].status === "fulfilled") setQueue(results[1].value.queue);
    else failures.push("queue");
    if (results[2].status === "fulfilled") setWards(results[2].value.wards);
    else failures.push("bed availability");
    if (results[3].status === "fulfilled") setBilling(results[3].value);
    else failures.push("billing summary");
    setError(failures.length ? `Some live summaries are unavailable: ${failures.join(", ")}.` : "");
    setLoading(false);
  }

  useEffect(() => {
    void loadData();
    const timer = window.setInterval(() => void loadData(), 20000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("section");
    if (requested && ["Today", "Register patient", "Appointments", "Queue & tokens"].includes(requested)) setSection(requested as ReceptionSection);
  }, []);

  async function checkIn(appointmentId: string) {
    setBusyId(appointmentId);
    setError("");
    try {
      await post(`/appointments/${appointmentId}/check-in`, {});
      await loadData();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not check in this appointment.");
    } finally { setBusyId(""); }
  }

  async function cancelAppointment(appointmentId: string) {
    if (!window.confirm("Cancel this appointment?")) return;
    setBusyId(appointmentId);
    setError("");
    try {
      await patch(`/appointments/${appointmentId}`, { status: "CANCELLED" });
      await loadData();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not cancel this appointment.");
    } finally { setBusyId(""); }
  }

  const checkedIn = appointments.filter((item) => item.status === "CHECKED_IN").length;
  const inConsultation = appointments.filter((item) => item.status === "IN_CONSULTATION").length;
  const availableBeds = wards.reduce((total, ward) => total + ward.beds.filter((bed) => bed.status === "AVAILABLE").length, 0);
  const navButton = (label: ReceptionSection) => <button type="button" className={`nav ${section === label ? "on" : ""}`} aria-current={section === label ? "page" : undefined} onClick={() => setSection(label)}><span className="d" />{label}</button>;
  const appointmentRows = appointments.slice(0, section === "Today" ? 6 : appointments.length);

  return <ReceptionShell active={section} onSectionChange={setSection}>
      <div className="reception-home">
        <header className="reception-home-header"><div><span className="reception-home-kicker">FRONT DESK · {businessDate()}</span><h2>{section === "Today" ? "Today at a glance" : section}</h2><p>Patient access, OPD flow and hospital service coordination.</p></div><button className="btn ghost sm" onClick={() => void loadData()} disabled={loading}>Refresh</button></header>
        {error && <div className="msg info" role="status">{error}</div>}
        <section className="reception-metrics" aria-label="Reception live summary">
          <article><span>Appointments today</span><strong>{loading ? "…" : appointments.length}</strong><small>Scheduled visits</small></article>
          <article><span>Checked in</span><strong>{loading ? "…" : checkedIn}</strong><small>Ready for care</small></article>
          <article><span>In consultation</span><strong>{loading ? "…" : inConsultation}</strong><small>OPD in progress</small></article>
          <article><span>Queue now</span><strong>{loading ? "…" : queue.length}</strong><small>Live token board</small></article>
          <article><span>Available beds</span><strong>{loading ? "…" : availableBeds}</strong><small>Across active wards</small></article>
          <article><span>Collected today</span><strong>{billing ? money(billing.collectedPaise) : "—"}</strong><small>{billing ? `${money(billing.outstandingPaise)} outstanding` : "Billing summary unavailable"}</small></article>
        </section>

        {section === "Register patient" && <section className="reception-home-panel"><div className="reception-home-panel-head"><div><span className="reception-home-kicker">PATIENT ACCESS</span><h3>New patient or walk-in</h3></div></div><ReceptionActions initialMode="register" /></section>}

        {section === "Appointments" && <>
          <section className="reception-home-panel"><div className="reception-home-panel-head"><div><span className="reception-home-kicker">SCHEDULE</span><h3>Book appointment</h3></div></div><AppointmentBookingForm onBooked={() => void loadData()} /></section>
          <section className="reception-home-panel"><div className="reception-home-panel-head"><div><span className="reception-home-kicker">TODAY'S SCHEDULE</span><h3>Appointments</h3></div><Link className="text-action" href="/hms/dashboard/reception/patients">Find patient →</Link></div><AppointmentTable appointments={appointments} busyId={busyId} onCheckIn={checkIn} onCancel={cancelAppointment} /></section>
        </>}

        {section === "Queue & tokens" && <div className="reception-home-columns"><section className="reception-home-panel"><div className="reception-home-panel-head"><div><span className="reception-home-kicker">LIVE STATUS</span><h3>OPD queue & tokens</h3></div></div><LiveQueueBoard /></section><section className="reception-home-panel"><div className="reception-home-panel-head"><div><span className="reception-home-kicker">WALK-IN</span><h3>Add to queue</h3></div></div><ReceptionActions initialMode="walk-in" /></section></div>}

        {section === "Today" && <div className="reception-home-columns"><section className="reception-home-panel"><div className="reception-home-panel-head"><div><span className="reception-home-kicker">NEXT UP</span><h3>Today's appointments</h3></div><button className="text-action" type="button" onClick={() => setSection("Appointments")}>View all →</button></div><AppointmentTable appointments={appointmentRows} busyId={busyId} onCheckIn={checkIn} onCancel={cancelAppointment} /></section><section className="reception-home-panel"><div className="reception-home-panel-head"><div><span className="reception-home-kicker">LIVE TOKENS</span><h3>OPD queue</h3></div><button className="text-action" type="button" onClick={() => setSection("Queue & tokens")}>Open queue →</button></div><LiveQueueBoard /></section></div>}

        {section === "Today" && <section className="reception-module-links" aria-label="Reception workflows"><Link href="/hms/dashboard/reception/billing"><span>01 · OPD BILLING</span><strong>Invoices, payments & receipts</strong><small>Service charges, discounts, GST and counter reconciliation</small></Link><Link href="/hms/dashboard/reception/ipd"><span>02 · BED AVAILABILITY</span><strong>Ward & bed map</strong><small>Current occupancy, bed status and inpatient transfers</small></Link><Link href="/hms/dashboard/reception/ipd"><span>03 · IPD & OT</span><strong>Admissions & theatre</strong><small>Running bills, schedules and safety checklist</small></Link><Link href="/hms/dashboard/reception/patients"><span>04 · PATIENT RECORDS</span><strong>Search patient history</strong><small>Demographics, encounters, reports and financial records</small></Link></section>}
        {section === "Appointments" && <section className="reception-home-panel"><div className="reception-home-panel-head"><div><span className="reception-home-kicker">QUICK ACTION</span><h3>Register and walk-ins</h3></div></div><ReceptionActions /></section>}
      </div>
  </ReceptionShell>;
}

function AppointmentTable({ appointments, busyId, onCheckIn, onCancel }: { appointments: AppointmentSummary[]; busyId: string; onCheckIn: (id: string) => void; onCancel: (id: string) => void }) {
  return <div className="tw"><table><thead><tr><th>Token</th><th>Patient</th><th>Doctor</th><th>Time</th><th>Status</th><th></th></tr></thead><tbody>{appointments.map((appointment) => <tr key={appointment.id}><td>{appointment.tokenNumber ? `T-${appointment.tokenNumber}` : "—"}</td><td>{appointment.patient.name}<small className="table-sub">{appointment.patient.mrn}</small></td><td>{appointment.doctor.name}</td><td>{appointment.startTime}</td><td>{appointment.status.replaceAll("_", " ")}</td><td className="reception-appointment-actions">{appointment.status === "BOOKED" && <><button className="btn sm" onClick={() => onCheckIn(appointment.id)} disabled={busyId === appointment.id}>{busyId === appointment.id ? "Checking in…" : "Check in"}</button><button className="text-action" onClick={() => onCancel(appointment.id)} disabled={busyId === appointment.id}>Cancel</button></>}</td></tr>)}{!appointments.length && <tr><td colSpan={6}>No appointments scheduled today.</td></tr>}</tbody></table></div>;
}

function AppointmentBookingForm({ onBooked }: { onBooked: () => void }) {
  const [doctors, setDoctors] = useState<DoctorOption[]>([]);
  const [query, setQuery] = useState("");
  const [patients, setPatients] = useState<ReceptionPatient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<ReceptionPatient | null>(null);
  const [doctorId, setDoctorId] = useState("");
  const [date, setDate] = useState(businessDate());
  const [slots, setSlots] = useState<{ startTime: string; endTime: string }[]>([]);
  const [startTime, setStartTime] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    api<{ doctors: DoctorOption[] }>("/doctors").then((result) => setDoctors(result.doctors)).catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load doctors."));
  }, []);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2 || selectedPatient) { setPatients([]); return; }
    let active = true;
    const timer = window.setTimeout(() => {
      api<{ patients: ReceptionPatient[] }>(`/patients?search=${encodeURIComponent(term)}`)
        .then((result) => { if (active) setPatients(result.patients); })
        .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Patient search failed."); });
    }, 220);
    return () => { active = false; window.clearTimeout(timer); };
  }, [query, selectedPatient]);

  useEffect(() => {
    if (!doctorId || !date) { setSlots([]); setStartTime(""); return; }
    let active = true;
    api<{ slots: { startTime: string; endTime: string }[] }>(`/doctors/${doctorId}/slots?date=${encodeURIComponent(date)}`)
      .then((result) => { if (active) { setSlots(result.slots); setStartTime(result.slots[0]?.startTime ?? ""); } })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Could not load available slots."); });
    return () => { active = false; };
  }, [doctorId, date]);

  async function book(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPatient || !doctorId || !startTime) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await post<{ appointment: AppointmentSummary }>("/appointments", { patientId: selectedPatient.id, doctorId, date, startTime, reason });
      setNotice(`Booked ${result.appointment.startTime} with ${result.appointment.doctor.name} for ${result.appointment.patient.name}.`);
      setQuery(""); setSelectedPatient(null); setReason("");
      onBooked();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not book appointment."); }
    finally { setBusy(false); }
  }

  return <form className="reception-booking-form" onSubmit={book}>
    {error && <div className="msg err" role="alert">{error}</div>}{notice && <div className="msg ok" role="status">{notice}</div>}
    <label><span>Patient lookup</span><input className="inp" value={selectedPatient ? `${selectedPatient.name} · ${selectedPatient.mrn}` : query} onChange={(event) => { setQuery(event.target.value); setSelectedPatient(null); }} placeholder="Name, MRN, phone or ABHA ID" required />{patients.length > 0 && !selectedPatient && <div className="reception-booking-picks">{patients.map((patient) => <button type="button" key={patient.id} onClick={() => { setSelectedPatient(patient); setQuery(patient.name); setPatients([]); }}><strong>{patient.name}</strong><small>{patient.mrn} · {patient.phone || patient.email}</small></button>)}</div>}</label>
    <label><span>Doctor</span><select className="inp" value={doctorId} onChange={(event) => setDoctorId(event.target.value)} required><option value="">Choose doctor</option>{doctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.name} · {doctor.specialties.map((specialty) => specialty.name).join(", ")}</option>)}</select></label>
    <label><span>Date</span><input className="inp" type="date" min={businessDate()} value={date} onChange={(event) => setDate(event.target.value)} required /></label>
    <label><span>Available time</span><select className="inp" value={startTime} onChange={(event) => setStartTime(event.target.value)} required disabled={!slots.length}><option value="">{slots.length ? "Choose time" : "No slots available"}</option>{slots.map((slot) => <option key={slot.startTime} value={slot.startTime}>{slot.startTime} – {slot.endTime}</option>)}</select></label>
    <label className="reception-booking-reason"><span>Reason for visit</span><input className="inp" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} /></label>
    <button className="btn sm" disabled={busy || !selectedPatient || !slots.length}>{busy ? "Booking…" : "Book appointment"}</button>
  </form>;
}