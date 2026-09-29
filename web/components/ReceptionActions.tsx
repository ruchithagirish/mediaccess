"use client";
import { useEffect, useState, type FormEvent } from "react";
import { api, post } from "@/lib/api";
import type { DoctorOption } from "@/lib/appointments";
import type { ReceptionPatient } from "@/lib/reception";

type Mode = "register" | "walk-in" | null;

export function ReceptionActions() {
  const [mode, setMode] = useState<Mode>(null);
  const [search, setSearch] = useState("");
  const [patients, setPatients] = useState<ReceptionPatient[]>([]);
  const [doctors, setDoctors] = useState<DoctorOption[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<ReceptionPatient | null>(null);
  const [doctorId, setDoctorId] = useState("");
  const [reason, setReason] = useState("");
  const [registerForm, setRegisterForm] = useState({ name: "", email: "", phone: "", dob: "", abhaId: "", password: "", consent: false });
  const [createdPatient, setCreatedPatient] = useState<ReceptionPatient | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (mode !== "walk-in") return;
    api<{ doctors: DoctorOption[] }>("/doctors")
      .then((result) => setDoctors(result.doctors))
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load doctors."));
  }, [mode]);

  useEffect(() => {
    if (mode !== "walk-in" || search.trim().length < 2) {
      setPatients([]);
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      api<{ patients: ReceptionPatient[] }>(`/patients?search=${encodeURIComponent(search.trim())}`)
        .then((result) => { if (active) setPatients(result.patients); })
        .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Could not search patients."); });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [mode, search]);

  function close() {
    setMode(null);
    setError("");
    setMessage("");
    setCreatedPatient(null);
    setSelectedPatient(null);
    setSearch("");
  }

  async function registerPatient(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await post<{ patient: ReceptionPatient }>("/patients", {
        name: registerForm.name,
        email: registerForm.email,
        phone: registerForm.phone,
        dob: registerForm.dob,
        abhaId: registerForm.abhaId,
        password: registerForm.password,
        consent: registerForm.consent,
      });
      setCreatedPatient(result.patient);
      setMessage(`Patient registered. MRN: ${result.patient.mrn}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not register patient.");
    } finally {
      setBusy(false);
    }
  }

  async function createWalkIn(event: FormEvent) {
    event.preventDefault();
    if (!selectedPatient || !doctorId) return;
    setBusy(true);
    setError("");
    try {
      const result = await post<{ appointment: { tokenNumber: number; patient: { name: string }; doctor: { name: string } } }>("/walk-ins", {
        patientId: selectedPatient.id,
        doctorId,
        reason,
      });
      setMessage(`Walk-in added: T-${result.appointment.tokenNumber} · ${result.appointment.patient.name} · ${result.appointment.doctor.name}`);
      setMode(null);
      setSelectedPatient(null);
      setSearch("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add walk-in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="acts reception-actions">
        <button className="btn sm" onClick={() => { setMode("register"); setError(""); setMessage(""); }}>Register patient</button>
        <button className="btn sm" onClick={() => { setMode("walk-in"); setError(""); setMessage(""); }}>Add walk-in</button>
      </div>
      {message && <p className="msg ok reception-message" role="status">{message}</p>}
      {mode && (
        <div className="modal-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) close(); }}>
          <section className="treatment-modal reception-modal" role="dialog" aria-modal="true" aria-labelledby="reception-action-title">
            <div className="ph">
              <h2 id="reception-action-title">{mode === "register" ? "Register patient" : "Add walk-in to queue"}</h2>
              <button className="btn ghost sm" type="button" onClick={close} disabled={busy}>Close</button>
            </div>
            {error && <div className="msg err" role="alert">{error}</div>}
            {message && <div className="msg ok" role="status">{message}</div>}

            {mode === "register" ? (
              createdPatient ? (
                <div className="reception-created">
                  <h3>{createdPatient.name}</h3>
                  <p>MRN <strong>{createdPatient.mrn}</strong></p>
                  {createdPatient.abhaId && <p>ABHA ID {createdPatient.abhaId}</p>}
                  <button className="btn" onClick={close}>Done</button>
                </div>
              ) : (
                <form onSubmit={registerPatient}>
                  <div className="treatment-lines reception-fields">
                    <label><span>Full name</span><input className="inp" autoComplete="name" value={registerForm.name} onChange={(event) => setRegisterForm({ ...registerForm, name: event.target.value })} minLength={3} maxLength={100} required /></label>
                    <label><span>Date of birth</span><input className="inp" type="date" max={new Date().toISOString().slice(0, 10)} value={registerForm.dob} onChange={(event) => setRegisterForm({ ...registerForm, dob: event.target.value })} required /></label>
                    <label><span>Mobile</span><input className="inp" inputMode="numeric" autoComplete="tel" value={registerForm.phone} onChange={(event) => setRegisterForm({ ...registerForm, phone: event.target.value })} required /></label>
                    <label><span>Email</span><input className="inp" type="email" autoComplete="email" value={registerForm.email} onChange={(event) => setRegisterForm({ ...registerForm, email: event.target.value })} required /></label>
                    <label><span>ABHA ID (optional)</span><input className="inp" inputMode="numeric" maxLength={14} value={registerForm.abhaId} onChange={(event) => setRegisterForm({ ...registerForm, abhaId: event.target.value.replace(/\D/g, "") })} placeholder="14 digits" /></label>
                    <label><span>Patient-set portal password</span><input className="inp" type="password" autoComplete="new-password" value={registerForm.password} onChange={(event) => setRegisterForm({ ...registerForm, password: event.target.value })} minLength={8} required /></label>
                  </div>
                  <label className="reception-consent"><input type="checkbox" checked={registerForm.consent} onChange={(event) => setRegisterForm({ ...registerForm, consent: event.target.checked })} required /> Patient consents to processing of health data.</label>
                  <div className="acts"><button className="btn" disabled={busy}>{busy ? "Registering…" : "Register patient"}</button></div>
                </form>
              )
            ) : (
              <form onSubmit={createWalkIn}>
                <label className="l" htmlFor="patient-search">Find existing patient by name, phone, email, MRN, or ABHA ID</label>
                <input className="inp" id="patient-search" value={search} onChange={(event) => { setSearch(event.target.value); setSelectedPatient(null); setError(""); }} placeholder="Type at least 2 characters" />
                {patients.length > 0 && !selectedPatient && (
                  <div className="patient-results" role="listbox" aria-label="Matching patients">
                    {patients.map((patient) => <button type="button" key={patient.id} onClick={() => { setSelectedPatient(patient); setSearch(`${patient.name} · ${patient.mrn}`); setPatients([]); }}>
                      <strong>{patient.name}</strong><span>{patient.mrn} · {patient.phone}</span>
                    </button>)}
                  </div>
                )}
                {selectedPatient && <p className="msg ok">Selected: {selectedPatient.name} · {selectedPatient.mrn}</p>}
                <label className="l" htmlFor="walkin-doctor">Doctor</label>
                <select className="inp" id="walkin-doctor" value={doctorId} onChange={(event) => setDoctorId(event.target.value)} required>
                  <option value="">Choose a doctor</option>
                  {doctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.name} · {doctor.specialties.map((specialty) => specialty.name).join(", ")}</option>)}
                </select>
                <label className="l" htmlFor="walkin-reason">Reason for visit (optional)</label>
                <input className="inp" id="walkin-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} />
                <div className="acts"><button className="btn" disabled={busy || !selectedPatient}>{busy ? "Adding to queue…" : "Check in walk-in"}</button></div>
              </form>
            )}
          </section>
        </div>
      )}
    </>
  );
}