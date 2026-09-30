"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { api, patch, post } from "@/lib/api";
import { ROLE_TO_SLUG, roleLabel, type StaffRole } from "@/lib/roles";
import { ReceptionShell } from "@/components/reception/RD-sidebar";

type SearchPatient = {
  id: string; mrn: string; dob: string; sex: string | null;
  name: string; email: string; phone: string | null;
};

type PrescriptionRecord = {
  id: string; status: string; diagnosis: string | null; notes: string | null; signedAt: string | null; issuedAt: string | null; createdAt: string;
  doctor: { user: { name: string } };
  items: { genericName: string; brandName: string | null; strength: string; dose: string; route: string; frequency: string; durationDays: number; quantity: string; dispensedQuantity: number; instructions: string | null; dispenseLines: { id: string; quantity: number; substitutionReason: string | null; dispense: { id: string; status: string; createdAt: string; pharmacist: { name: string } }; batch: { batchNumber: string; expiryDate: string } }[] }[];
};
type InvestigationRecord = {
  id: string; status: string; priority: string; clinicalNotes: string | null; orderedAt: string;
  test: { code: string; name: string; department: string };
  orderedBy: { user: { name: string } };
  reports: { id: string; fileName: string; contentType: string; sizeBytes: number; summary: string | null; isCritical: boolean; uploadedAt: string }[];
};
type AdmissionRecord = {
  id: string; admissionNumber: string; diagnosis: string; status: string; admittedAt: string; dischargedAt: string | null; dischargeSummary: string | null;
  attendingDoctor: { user: { name: string } };
  bed: { bedNumber: string; ward: { name: string } };
  invoice: { id: string; invoiceNumber: string; totalPaise: number; status: string; issuedAt: string } | null;
};
type PatientInvoice = {
  id: string; invoiceNumber: string; subtotalPaise: number; discountPaise: number; taxPaise: number; totalPaise: number; status: string; issuedAt: string;
  lines: { id: string; description: string; quantity: number; unitPricePaise: number; lineTotalPaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number }[];
  payments: { id: string; mode: string; amountPaise: number; reference: string | null; receivedAt: string; receiptDeliveries: { channel: string; status: string; destination: string; sentAt: string | null }[] }[];
};

type PatientProfile = SearchPatient & {
  abhaId: string | null;
  address: string | null;
  allergies: { id: string; substance: string; reaction: string | null; severity: string | null; notes: string | null }[];
  insurances: { id: string; provider: string; policyNumber: string; memberId: string | null; coverageStart: string | null; coverageEnd: string | null }[];
  emergencyContacts: { id: string; name: string; relationship: string; phone: string }[];
  encounters: Encounter[];
  appointments: { id: string; scheduledFor: string; startTime: string; status: string; reason: string | null; doctor: { user: { name: string } }; treatment: { summary: string; completedAt: string } | null }[];
  vitals: Vital[];
  clinicalRecords: { id: string; type: string; title: string; summary: string | null; status: string | null; occurredAt: string }[];
  prescriptions: PrescriptionRecord[];
  investigationOrders: InvestigationRecord[];
  admissions: AdmissionRecord[];
  invoices: PatientInvoice[];
};

type Encounter = {
  id: string; specialty: string | null; chiefComplaint: string; subjective: string; objective: string;
  assessment: string; plan: string; icd10Code: string | null; diagnosis: string | null; createdAt: string;
  doctor: { user: { name: string } };
};

type Vital = {
  id: string; systolic: number | null; diastolic: number | null; pulse: number | null; temperature: number | null;
  respiratoryRate: number | null; oxygenSaturation: number | null; height: number | null; weight: number | null;
  abnormal: boolean; notes: string | null; recordedAt: string;
};

type TimelineItem = { id: string; date: string; label: string; detail: string; status?: string; kind: string };
type SoapField = "chiefComplaint" | "subjective" | "objective" | "assessment" | "plan";
type SpeechAlternativeLike = { transcript: string };
type SpeechResultLike = ArrayLike<SpeechAlternativeLike>;
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { resultIndex: number; results: ArrayLike<SpeechResultLike> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

type ProfileDraft = {
  sex: string; address: string; allergySubstance: string; allergyReaction: string; allergySeverity: string;
  insuranceProvider: string; insurancePolicy: string; insuranceMember: string; coverageStart: string; coverageEnd: string;
  contactName: string; contactRelationship: string; contactPhone: string;
};

const emptyProfileDraft: ProfileDraft = {
  sex: "", address: "", allergySubstance: "", allergyReaction: "", allergySeverity: "",
  insuranceProvider: "", insurancePolicy: "", insuranceMember: "", coverageStart: "", coverageEnd: "",
  contactName: "", contactRelationship: "", contactPhone: "",
};

const icdOptions = [
  ["I10", "Essential (primary) hypertension"], ["E11.9", "Type 2 diabetes mellitus without complications"],
  ["J06.9", "Acute upper respiratory infection, unspecified"], ["J18.9", "Pneumonia, unspecified organism"],
  ["M54.5", "Low back pain"], ["R50.9", "Fever, unspecified"], ["R51.9", "Headache, unspecified"],
  ["K21.9", "Gastro-esophageal reflux disease without esophagitis"], ["I25.10", "Atherosclerotic heart disease of native coronary artery"],
];

const specialtyTemplates: Record<string, { complaint: string; subjective: string; objective: string; assessment: string; plan: string }> = {
  "General Medicine": { complaint: "", subjective: "Onset, duration, associated symptoms, relevant history:", objective: "General examination, systems review:", assessment: "Working diagnosis and differential:", plan: "Investigations, treatment, follow-up:" },
  Cardiology: { complaint: "", subjective: "Chest pain, dyspnoea, palpitations, exercise tolerance:", objective: "Pulse, blood pressure, JVP, heart sounds, ECG:", assessment: "Cardiac assessment and risk:", plan: "Cardiac investigations, treatment, follow-up:" },
  Orthopedics: { complaint: "", subjective: "Pain site, onset, trauma, function, weight-bearing:", objective: "Inspection, range of motion, tenderness, neurovascular status:", assessment: "Injury or musculoskeletal diagnosis:", plan: "Imaging, immobilisation, medication, review:" },
  Pediatrics: { complaint: "", subjective: "Symptoms, feeding, immunisation, birth and developmental history:", objective: "Weight, growth, hydration, age-appropriate examination:", assessment: "Pediatric assessment:", plan: "Treatment, caregiver guidance, follow-up:" },
};

const vitalFields = [
  ["systolic", "Systolic BP", "mmHg", 40, 300, 1], ["diastolic", "Diastolic BP", "mmHg", 20, 200, 1],
  ["pulse", "Pulse", "bpm", 20, 250, 1], ["temperature", "Temperature", "°C", 25, 45, 0.1],
  ["respiratoryRate", "Respiratory rate", "/min", 4, 80, 1], ["oxygenSaturation", "Oxygen saturation", "%", 50, 100, 1],
  ["height", "Height", "cm", 30, 250, 0.1], ["weight", "Weight", "kg", 1, 350, 0.1],
] as const;

function displayDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function ageAt(dob: string) {
  const birth = new Date(`${dob.slice(0, 10)}T00:00:00`);
  const now = new Date();
  return now.getFullYear() - birth.getFullYear() - (now < new Date(now.getFullYear(), birth.getMonth(), birth.getDate()) ? 1 : 0);
}

function hasAbnormal(values: Record<string, string>) {
  const number = (key: string) => values[key] ? Number(values[key]) : undefined;
  return (number("systolic") !== undefined && (number("systolic")! < 90 || number("systolic")! > 140))
    || (number("diastolic") !== undefined && (number("diastolic")! < 60 || number("diastolic")! > 90))
    || (number("pulse") !== undefined && (number("pulse")! < 50 || number("pulse")! > 100))
    || (number("temperature") !== undefined && (number("temperature")! < 36 || number("temperature")! > 38))
    || (number("respiratoryRate") !== undefined && (number("respiratoryRate")! < 12 || number("respiratoryRate")! > 20))
    || (number("oxygenSaturation") !== undefined && number("oxygenSaturation")! < 95);
}

export function PatientWorkspace({ role, patientId }: { role: StaffRole; patientId?: string }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchPatient[]>([]);
  const [patient, setPatient] = useState<PatientProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileDraft, setProfileDraft] = useState<ProfileDraft>(emptyProfileDraft);
  const [savingProfile, setSavingProfile] = useState(false);
  const [timelineFilter, setTimelineFilter] = useState("All activity");
  const [vitals, setVitals] = useState<Record<string, string>>({});
  const [vitalsNotes, setVitalsNotes] = useState("");
  const [savingVitals, setSavingVitals] = useState(false);
  const [specialty, setSpecialty] = useState("General Medicine");
  const [soap, setSoap] = useState({ chiefComplaint: "", subjective: "", objective: "", assessment: "", plan: "", icd10Code: "", diagnosis: "" });
  const [activeSoapField, setActiveSoapField] = useState<SoapField>("chiefComplaint");
  const [voiceConsent, setVoiceConsent] = useState(false);
  const [voiceActive, setVoiceActive] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const [savingEncounter, setSavingEncounter] = useState(false);
  const [openingReportId, setOpeningReportId] = useState("");
  const canRecordVitals = role === "NURSE" || role === "ADMIN";
  const canConsult = role === "DOCTOR";
  const canEditProfile = role === "RECEPTION" || role === "ADMIN";

  useEffect(() => () => recognitionRef.current?.abort(), []);

  useEffect(() => {
    let active = true;
    const term = query.trim();
    if (term.length < 3) { setResults([]); return; }
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError("");
      api<{ patients: SearchPatient[] }>(`/clinical/patients/search?q=${encodeURIComponent(term)}`)
        .then((data) => { if (active) setResults(data.patients); })
        .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Patient search failed."); })
        .finally(() => { if (active) setLoading(false); });
    }, 220);
    return () => { active = false; window.clearTimeout(timer); };
  }, [query]);

  useEffect(() => {
    if (!patientId) { setPatient(null); return; }
    let active = true;
    setLoading(true);
    setError("");
    api<{ patient: PatientProfile }>(`/clinical/patients/${encodeURIComponent(patientId)}`)
      .then((data) => { if (active) setPatient(data.patient); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Could not load this patient."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [patientId]);

  const timeline = useMemo<TimelineItem[]>(() => {
    if (!patient) return [];
    return [
      ...patient.appointments.map((item) => ({ id: `visit-${item.id}`, date: item.scheduledFor, label: item.treatment ? "Encounter" : "Appointment", detail: `${item.doctor.user.name}${item.reason ? ` · ${item.reason}` : ""}${item.treatment ? ` · ${item.treatment.summary}` : ""}`, status: item.status.replaceAll("_", " "), kind: "Visit" })),
      ...patient.encounters.map((item) => ({ id: `soap-${item.id}`, date: item.createdAt, label: item.diagnosis || item.chiefComplaint, detail: `${item.doctor.user.name}${item.icd10Code ? ` · ${item.icd10Code}` : ""}`, status: item.specialty || undefined, kind: "Visit" })),
      ...patient.vitals.map((item) => ({ id: `vitals-${item.id}`, date: item.recordedAt, label: "Vitals recorded", detail: [item.systolic !== null && item.diastolic !== null ? `BP ${item.systolic}/${item.diastolic} mmHg` : "", item.pulse !== null ? `Pulse ${item.pulse} bpm` : "", item.temperature !== null ? `${item.temperature} °C` : "", item.oxygenSaturation !== null ? `SpO₂ ${item.oxygenSaturation}%` : ""].filter(Boolean).join(" · "), status: item.abnormal ? "Abnormal" : undefined, kind: "Vitals" })),
      ...patient.prescriptions.map((item) => ({ id: `prescription-${item.id}`, date: item.issuedAt || item.signedAt || item.createdAt, label: `Prescription · ${item.diagnosis || "Clinical order"}`, detail: `${item.doctor.user.name} · ${item.items.length} medication${item.items.length === 1 ? "" : "s"}`, status: item.status.replaceAll("_", " "), kind: "Prescription" })),
      ...patient.investigationOrders.map((item) => ({ id: `investigation-${item.id}`, date: item.orderedAt, label: item.test.name, detail: `${item.test.code} · ${item.orderedBy.user.name}`, status: item.status.replaceAll("_", " "), kind: "Diagnostics" })),
      ...patient.investigationOrders.flatMap((order) => order.reports.map((report) => ({ id: `report-${report.id}`, date: report.uploadedAt, label: report.fileName, detail: report.summary || order.test.name, status: report.isCritical ? "Critical finding" : "Verified report", kind: "Diagnostics" }))),
      ...patient.admissions.map((item) => ({ id: `admission-${item.id}`, date: item.admittedAt, label: `Admission ${item.admissionNumber}`, detail: `${item.diagnosis} · ${item.bed.ward.name} / ${item.bed.bedNumber}`, status: item.status.replaceAll("_", " "), kind: "Admissions" })),
      ...patient.invoices.map((item) => ({ id: `invoice-${item.id}`, date: item.issuedAt, label: `Invoice ${item.invoiceNumber}`, detail: `₹${(item.totalPaise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`, kind: "Billing" })),
      ...patient.invoices.flatMap((invoice) => invoice.payments.map((payment) => ({ id: `payment-${payment.id}`, date: payment.receivedAt, label: `Payment · ${invoice.invoiceNumber}`, detail: `₹${(payment.amountPaise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })} · ${payment.mode}`, kind: "Billing" }))),
      ...patient.clinicalRecords.map((item) => ({ id: `record-${item.id}`, date: item.occurredAt, label: item.title, detail: item.summary || item.type.toLowerCase(), status: item.status || undefined, kind: item.type === "ADMISSION" ? "Admissions" : "Document" })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [patient]);
  const previousVisits = useMemo(() => {
    if (!patient) return [];
    return [
      ...patient.encounters.map((encounter) => ({
        id: `encounter-${encounter.id}`, date: encounter.createdAt,
        title: encounter.diagnosis || encounter.chiefComplaint,
        detail: `${encounter.doctor.user.name}${encounter.icd10Code ? ` · ${encounter.icd10Code}` : ""}`,
      })),
      ...patient.appointments.filter((appointment) => appointment.status === "COMPLETED").map((appointment) => ({
        id: `appointment-${appointment.id}`, date: appointment.scheduledFor,
        title: appointment.treatment?.summary || appointment.reason || "Completed visit",
        detail: appointment.doctor.user.name,
      })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [patient]);
  const visibleTimeline = timeline.filter((item) => timelineFilter === "All activity"
    || (timelineFilter === "Visits" && item.kind === "Visit")
    || (timelineFilter === "Vitals" && item.kind === "Vitals")
    || (timelineFilter === "Prescriptions" && item.kind === "Prescription")
    || (timelineFilter === "Diagnostics" && item.kind === "Diagnostics")
    || (timelineFilter === "Admissions" && item.kind === "Admissions")
    || (timelineFilter === "Documents & billing" && ["Billing", "Document", "Admission"].includes(item.kind)));

  async function saveVitals(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!patient) return;
    const systolic = vitals.systolic;
    const diastolic = vitals.diastolic;
    if (Boolean(systolic) !== Boolean(diastolic)) { setError("Enter both systolic and diastolic blood pressure."); return; }
    const data = Object.fromEntries(Object.entries(vitals).filter(([, value]) => value !== "").map(([key, value]) => [key, Number(value)]));
    if (!Object.keys(data).length) { setError("Enter at least one measurement."); return; }
    setSavingVitals(true);
    setError("");
    try {
      await post(`/clinical/patients/${patient.id}/vitals`, { ...data, notes: vitalsNotes });
      setVitals({}); setVitalsNotes("");
      setNotice("Vitals saved to the patient timeline.");
      const updated = await api<{ patient: PatientProfile }>(`/clinical/patients/${patient.id}`);
      setPatient(updated.patient);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save vitals.");
    } finally { setSavingVitals(false); }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!patient) return;
    const body = {
      sex: profileDraft.sex,
      address: profileDraft.address,
      ...(profileDraft.allergySubstance.trim() ? { allergy: {
        substance: profileDraft.allergySubstance,
        reaction: profileDraft.allergyReaction,
        severity: profileDraft.allergySeverity,
      } } : {}),
      ...(profileDraft.insuranceProvider.trim() || profileDraft.insurancePolicy.trim() ? { insurance: {
        provider: profileDraft.insuranceProvider,
        policyNumber: profileDraft.insurancePolicy,
        memberId: profileDraft.insuranceMember,
        coverageStart: profileDraft.coverageStart,
        coverageEnd: profileDraft.coverageEnd,
      } } : {}),
      ...(profileDraft.contactName.trim() || profileDraft.contactPhone.trim() ? { emergencyContact: {
        name: profileDraft.contactName,
        relationship: profileDraft.contactRelationship,
        phone: profileDraft.contactPhone,
      } } : {}),
    };
    setSavingProfile(true);
    setError("");
    try {
      await patch(`/clinical/patients/${patient.id}/profile`, body);
      const updated = await api<{ patient: PatientProfile }>(`/clinical/patients/${patient.id}`);
      setPatient(updated.patient);
      setProfileDraft(emptyProfileDraft);
      setProfileOpen(false);
      setNotice("Patient profile updated.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update the patient profile.");
    } finally { setSavingProfile(false); }
  }

  async function saveEncounter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!patient) return;
    recognitionRef.current?.stop();
    setSavingEncounter(true);
    setError("");
    try {
      await post(`/clinical/patients/${patient.id}/encounters`, { ...soap, specialty });
      setSoap({ chiefComplaint: "", subjective: "", objective: "", assessment: "", plan: "", icd10Code: "", diagnosis: "" });
      setNotice("Consultation saved.");
      const updated = await api<{ patient: PatientProfile }>(`/clinical/patients/${patient.id}`);
      setPatient(updated.patient);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the consultation.");
    } finally { setSavingEncounter(false); }
  }

  async function openReport(reportId: string) {
    const reportWindow = window.open("about:blank", "_blank");
    if (reportWindow) reportWindow.opener = null;
    setOpeningReportId(reportId);
    setError("");
    try {
      const { url } = await api<{ url: string; fileName: string }>(`/clinical/investigation-reports/${encodeURIComponent(reportId)}/download-url`);
      if (reportWindow) reportWindow.location.href = url;
      else window.location.assign(url);
    } catch (cause) {
      reportWindow?.close();
      setError(cause instanceof Error ? cause.message : "Could not open the investigation report.");
    } finally { setOpeningReportId(""); }
  }

  function toggleVoiceDictation() {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      return;
    }
    if (!voiceConsent) {
      setError("Confirm the patient's consent before using browser speech recognition.");
      return;
    }
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) {
      setError("Voice dictation is not supported by this browser.");
      return;
    }

    const targetField = activeSoapField;
    const recognition = new Recognition();
    recognition.lang = "en-IN";
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = Array.from({ length: event.results.length - event.resultIndex }, (_, index) =>
        event.results[event.resultIndex + index]?.[0]?.transcript.trim() ?? "",
      ).filter(Boolean).join(" ");
      if (transcript) {
        setSoap((current) => ({
          ...current,
          [targetField]: [current[targetField].trim(), transcript].filter(Boolean).join(" "),
        }));
      }
    };
    recognition.onerror = () => {
      setError("Voice dictation stopped. Check microphone permission and try again.");
      recognitionRef.current = null;
      setVoiceActive(false);
    };
    recognition.onend = () => {
      if (recognitionRef.current === recognition) recognitionRef.current = null;
      setVoiceActive(false);
    };
    recognitionRef.current = recognition;
    setError("");
    setVoiceActive(true);
    recognition.start();
  }

  function applyTemplate(value: string) {
    setSpecialty(value);
    const template = specialtyTemplates[value];
    if (template) setSoap((current) => ({ ...current, ...template }));
  }

  function choosePatient(id: string) {
    router.push(`/hms/dashboard/${ROLE_TO_SLUG[role]}/patients/${encodeURIComponent(id)}`);
  }

  const workspace = (
    <div className="patient-workspace">
      <header className="patient-topbar">
        <div>
          {role !== "ADMIN" && <Link href={`/hms/dashboard/${ROLE_TO_SLUG[role]}`} className="patient-back">← {roleLabel(role)} dashboard</Link>}
          <h1>Patient records</h1>
        </div>
        <label className="patient-search">
          <span>Search patients</span>
          <input className="inp" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, MRN, phone or email" aria-label="Search patients by name, MRN, phone or email" />
          <small>{query.trim().length < 3 ? "Enter at least 3 characters" : loading ? "Searching…" : `${results.length} matches`}</small>
        </label>
      </header>
      {error && <div className="msg err" role="alert">{error}</div>}
      {notice && <div className="msg ok" role="status">{notice}</div>}
      <div className="patient-layout">
        <aside className="patient-results-panel" aria-label="Patient search results">
          {query.trim().length < 3 && !patient && <p className="patient-empty">Search by a patient’s name, MRN, phone or email.</p>}
          {query.trim().length >= 3 && !loading && results.length === 0 && !error && <p className="patient-empty">No matching patients.</p>}
          {results.map((item) => (
            <button className={`patient-result ${patientId === item.id ? "selected" : ""}`} key={item.id} onClick={() => choosePatient(item.id)}>
              <strong>{item.name}</strong><span>{item.mrn}</span><small>{item.phone || item.email} · {ageAt(item.dob)} yrs</small>
            </button>
          ))}
        </aside>

        {!patientId && <section className="patient-welcome">
          <span className="patient-index">CLINICAL RECORDS</span>
          <h2>Find a patient</h2>
          <p>Search the current clinic directory to open demographics, clinical history and care tools.</p>
        </section>}

        {patientId && loading && !patient && <section className="patient-welcome"><h2>Loading patient record…</h2></section>}
        {patient && <main className="patient-record">
          <section className="patient-profile-head">
            <div className="patient-avatar" aria-hidden="true">{patient.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</div>
            <div className="patient-identity"><span className="patient-index">{patient.mrn}</span><h2>{patient.name}</h2><p>{ageAt(patient.dob)} years{patient.sex ? ` · ${patient.sex}` : ""} · Born {displayDate(patient.dob)}</p></div>
            {patient.abhaId && <div className="patient-abha"><small>ABHA ID</small><strong>{patient.abhaId}</strong></div>}
            {canEditProfile && <button type="button" className="btn ghost sm" onClick={() => { setProfileDraft({ ...emptyProfileDraft, sex: patient.sex || "", address: patient.address || "" }); setProfileOpen((open) => !open); }}>{profileOpen ? "Close editor" : "Edit profile"}</button>}
          </section>

          <section className="patient-facts" aria-label="Patient demographics">
            <div><span>Email</span><strong>{patient.email}</strong></div><div><span>Phone</span><strong>{patient.phone || "Not recorded"}</strong></div><div><span>Address</span><strong>{patient.address || "Not recorded"}</strong></div>
          </section>

          {profileOpen && <section className="patient-section patient-entry">
            <div className="patient-section-title"><div><span className="patient-index">REGISTRATION</span><h3>Update patient profile</h3></div></div>
            <form onSubmit={saveProfile}>
              <div className="patient-form-top">
                <label><span>Sex</span><select className="inp" value={profileDraft.sex} onChange={(event) => setProfileDraft({ ...profileDraft, sex: event.target.value })}><option value="">Not recorded</option><option>Female</option><option>Male</option><option>Intersex</option><option>Other</option><option>Prefer not to say</option></select></label>
                <label><span>Address</span><input className="inp" maxLength={500} value={profileDraft.address} onChange={(event) => setProfileDraft({ ...profileDraft, address: event.target.value })} /></label>
              </div>
              <div className="profile-add-grid">
                <fieldset><legend>Allergy</legend><label><span>Substance</span><input className="inp" maxLength={120} value={profileDraft.allergySubstance} onChange={(event) => setProfileDraft({ ...profileDraft, allergySubstance: event.target.value })} /></label><label><span>Reaction</span><input className="inp" maxLength={240} value={profileDraft.allergyReaction} onChange={(event) => setProfileDraft({ ...profileDraft, allergyReaction: event.target.value })} /></label><label><span>Severity</span><input className="inp" maxLength={40} value={profileDraft.allergySeverity} onChange={(event) => setProfileDraft({ ...profileDraft, allergySeverity: event.target.value })} /></label></fieldset>
                <fieldset><legend>Insurance</legend><label><span>Provider</span><input className="inp" maxLength={160} value={profileDraft.insuranceProvider} onChange={(event) => setProfileDraft({ ...profileDraft, insuranceProvider: event.target.value })} /></label><label><span>Policy number</span><input className="inp" maxLength={120} value={profileDraft.insurancePolicy} onChange={(event) => setProfileDraft({ ...profileDraft, insurancePolicy: event.target.value })} /></label><label><span>Member ID</span><input className="inp" maxLength={120} value={profileDraft.insuranceMember} onChange={(event) => setProfileDraft({ ...profileDraft, insuranceMember: event.target.value })} /></label><div className="profile-dates"><label><span>Coverage start</span><input className="inp" type="date" value={profileDraft.coverageStart} onChange={(event) => setProfileDraft({ ...profileDraft, coverageStart: event.target.value })} /></label><label><span>Coverage end</span><input className="inp" type="date" value={profileDraft.coverageEnd} onChange={(event) => setProfileDraft({ ...profileDraft, coverageEnd: event.target.value })} /></label></div></fieldset>
                <fieldset><legend>Emergency contact</legend><label><span>Name</span><input className="inp" maxLength={100} value={profileDraft.contactName} onChange={(event) => setProfileDraft({ ...profileDraft, contactName: event.target.value })} /></label><label><span>Relationship</span><input className="inp" maxLength={60} value={profileDraft.contactRelationship} onChange={(event) => setProfileDraft({ ...profileDraft, contactRelationship: event.target.value })} /></label><label><span>Phone</span><input className="inp" type="tel" maxLength={20} value={profileDraft.contactPhone} onChange={(event) => setProfileDraft({ ...profileDraft, contactPhone: event.target.value })} /></label></fieldset>
              </div>
              <div className="patient-form-end"><span>Leave a section blank to skip it; new records are added to the profile.</span><button className="btn sm" disabled={savingProfile}>{savingProfile ? "Saving…" : "Save profile"}</button></div>
            </form>
          </section>}

          <div className="patient-profile-grid">
            <section className="patient-section"><div className="patient-section-title"><h3>Allergies</h3><span>{patient.allergies.length}</span></div>
              {patient.allergies.length ? patient.allergies.map((allergy) => <div className="patient-list-item" key={allergy.id}><strong>{allergy.substance}</strong><span>{[allergy.reaction, allergy.severity].filter(Boolean).join(" · ") || "Details not recorded"}</span></div>) : <p className="patient-empty">No allergies recorded</p>}
            </section>
            <section className="patient-section"><div className="patient-section-title"><h3>Insurance</h3><span>{patient.insurances.length}</span></div>
              {patient.insurances.length ? patient.insurances.map((insurance) => <div className="patient-list-item" key={insurance.id}><strong>{insurance.provider}</strong><span>Policy {insurance.policyNumber}{insurance.memberId ? ` · Member ${insurance.memberId}` : ""}</span></div>) : <p className="patient-empty">No insurance on file</p>}
            </section>
            <section className="patient-section"><div className="patient-section-title"><h3>Emergency contacts</h3><span>{patient.emergencyContacts.length}</span></div>
              {patient.emergencyContacts.length ? patient.emergencyContacts.map((contact) => <div className="patient-list-item" key={contact.id}><strong>{contact.name} <small>{contact.relationship}</small></strong><span>{contact.phone}</span></div>) : <p className="patient-empty">No emergency contact recorded</p>}
            </section>
            <section className="patient-section patient-previous"><div className="patient-section-title"><h3>Previous visits</h3><span>{previousVisits.length}</span></div>
              {previousVisits.length ? previousVisits.slice(0, 4).map((visit) => <article className="patient-visit" key={visit.id}><time>{displayDate(visit.date)}</time><strong>{visit.title}</strong><span>{visit.detail}</span></article>) : <p className="patient-empty">No consultations recorded</p>}
            </section>
          </div>

          <div className="patient-record-history-grid">
            <section className="patient-section"><div className="patient-section-title"><div><span className="patient-index">OBSERVATIONS</span><h3>Vitals history</h3></div><span>{patient.vitals.length} entries</span></div>
              {patient.vitals.length ? patient.vitals.slice(0, 12).map((item) => {
                const bmi = item.height && item.weight ? item.weight / ((item.height / 100) ** 2) : null;
                return <article className={`patient-history-row ${item.abnormal ? "abnormal" : ""}`} key={item.id}><div><strong>{displayDate(item.recordedAt)}</strong>{item.abnormal && <b className="patient-record-flag">Abnormal</b>}</div><span>{[item.systolic !== null && item.diastolic !== null ? `BP ${item.systolic}/${item.diastolic}` : null, item.pulse !== null ? `Pulse ${item.pulse} bpm` : null, item.temperature !== null ? `${item.temperature} °C` : null, item.oxygenSaturation !== null ? `SpO2 ${item.oxygenSaturation}%` : null, item.respiratoryRate !== null ? `RR ${item.respiratoryRate}/min` : null, item.height !== null ? `${item.height} cm` : null, item.weight !== null ? `${item.weight} kg` : null, bmi !== null ? `BMI ${bmi.toFixed(1)}` : null].filter(Boolean).join(" · ")}</span>{item.notes && <small>{item.notes}</small>}</article>;
              }) : <p className="patient-empty">No vitals recorded.</p>}
            </section>

            <section className="patient-section"><div className="patient-section-title"><div><span className="patient-index">CONSULTATIONS</span><h3>Encounter notes</h3></div><span>{patient.encounters.length} entries</span></div>
              {patient.encounters.length ? patient.encounters.map((item) => <details className="patient-detail-disclosure" key={item.id}><summary><span><strong>{item.diagnosis || item.chiefComplaint}</strong><small>{displayDate(item.createdAt)} · {item.doctor.user.name}{item.icd10Code ? ` · ${item.icd10Code}` : ""}</small></span><b>{item.specialty || "Encounter"}</b></summary><dl><dt>Chief complaint</dt><dd>{item.chiefComplaint}</dd><dt>Subjective</dt><dd>{item.subjective}</dd><dt>Objective</dt><dd>{item.objective}</dd><dt>Assessment</dt><dd>{item.assessment}</dd><dt>Plan</dt><dd>{item.plan}</dd></dl></details>) : <p className="patient-empty">No signed consultation notes recorded.</p>}
            </section>

            <section className="patient-section"><div className="patient-section-title"><div><span className="patient-index">MEDICATIONS</span><h3>E-prescriptions</h3></div><span>{patient.prescriptions.length} records</span></div>
              {patient.prescriptions.length ? patient.prescriptions.map((item) => <article className="patient-history-card" key={item.id}><header><div><strong>{item.diagnosis || "Prescription"}</strong><small>{displayDate(item.issuedAt || item.signedAt || item.createdAt)} · Dr. {item.doctor.user.name}</small></div><b className="patient-record-state">{item.status.replaceAll("_", " ")}</b></header>{item.notes && <p>{item.notes}</p>}{item.items.map((drug, index) => <div className="patient-medication-row" key={`${item.id}-${index}`}><strong>{drug.brandName || drug.genericName} · {drug.strength}</strong><span>{drug.dose} · {drug.route} · {drug.frequency} · {drug.durationDays} days · {drug.dispensedQuantity}/{drug.quantity} dispensed</span>{drug.instructions && <small>{drug.instructions}</small>}{drug.dispenseLines.map((line) => <small className="patient-dispense-detail" key={line.id}>{line.quantity} from batch {line.batch.batchNumber} · {line.dispense.pharmacist.name}{line.substitutionReason ? ` · Substitution: ${line.substitutionReason}` : ""}</small>)}</div>)}</article>) : <p className="patient-empty">No prescriptions recorded.</p>}
            </section>

            <section className="patient-section"><div className="patient-section-title"><div><span className="patient-index">DIAGNOSTICS</span><h3>Orders & reports</h3></div><span>{patient.investigationOrders.length} orders</span></div>
              {patient.investigationOrders.length ? patient.investigationOrders.map((order) => <article className="patient-history-card" key={order.id}><header><div><strong>{order.test.name}</strong><small>{order.test.code} · {order.test.department} · {displayDate(order.orderedAt)} · {order.orderedBy.user.name}</small></div><b className="patient-record-state">{order.status.replaceAll("_", " ")}</b></header>{order.clinicalNotes && <p>{order.clinicalNotes}</p>}{order.reports.map((report) => <div className={`patient-report-row ${report.isCritical ? "critical" : ""}`} key={report.id}><div><strong>{report.fileName}</strong><small>{report.contentType} · {(report.sizeBytes / 1024).toFixed(0)} KB · {displayDate(report.uploadedAt)}{report.summary ? ` · ${report.summary}` : ""}</small></div>{report.isCritical && <b className="patient-record-flag">Critical</b>}<button type="button" className="btn ghost sm" disabled={openingReportId === report.id} onClick={() => void openReport(report.id)}>{openingReportId === report.id ? "Opening…" : "Open report"}</button></div>)}</article>) : <p className="patient-empty">No diagnostic orders recorded.</p>}
            </section>

            <section className="patient-section"><div className="patient-section-title"><div><span className="patient-index">INPATIENT CARE</span><h3>Admissions & discharge</h3></div><span>{patient.admissions.length} admissions</span></div>
              {patient.admissions.length ? patient.admissions.map((item) => <article className="patient-history-card" key={item.id}><header><div><strong>{item.admissionNumber} · {item.diagnosis}</strong><small>{displayDate(item.admittedAt)}{item.dischargedAt ? ` – ${displayDate(item.dischargedAt)}` : " – Current stay"}</small></div><b className="patient-record-state">{item.status.replaceAll("_", " ")}</b></header><span className="patient-history-muted">{item.bed.ward.name} · Bed {item.bed.bedNumber} · Dr. {item.attendingDoctor.user.name}</span>{item.dischargeSummary && <p>{item.dischargeSummary}</p>}{item.invoice && <small>Invoice {item.invoice.invoiceNumber} · ₹{(item.invoice.totalPaise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</small>}</article>) : <p className="patient-empty">No admissions recorded.</p>}
            </section>

            <section className="patient-section patient-financial-records"><div className="patient-section-title"><div><span className="patient-index">FINANCIAL RECORDS</span><h3>Invoices, payments & receipts</h3></div><span>{patient.invoices.length} invoices</span></div>
              {patient.invoices.length ? patient.invoices.map((invoice) => {
                const paidPaise = invoice.payments.reduce((total, payment) => total + payment.amountPaise, 0);
                return <article className="patient-history-card" key={invoice.id}><header><div><strong>{invoice.invoiceNumber}</strong><small>{displayDate(invoice.issuedAt)} · {invoice.status.replaceAll("_", " ")}</small></div><b>₹{(invoice.totalPaise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</b></header><div className="patient-invoice-lines">{invoice.lines.map((line) => <div key={line.id}><span>{line.description} · {line.quantity} × ₹{(line.unitPricePaise / 100).toFixed(2)}</span><b>₹{(line.lineTotalPaise / 100).toFixed(2)}</b></div>)}</div><div className="patient-invoice-balance"><span>Subtotal ₹{(invoice.subtotalPaise / 100).toFixed(2)} · Tax ₹{(invoice.taxPaise / 100).toFixed(2)} · Paid ₹{(paidPaise / 100).toFixed(2)}</span><strong>Balance ₹{(Math.max(0, invoice.totalPaise - paidPaise) / 100).toFixed(2)}</strong></div>{invoice.payments.map((payment) => <div className="patient-payment-row" key={payment.id}><span>{displayDate(payment.receivedAt)} · {payment.mode}{payment.reference ? ` · ${payment.reference}` : ""}</span><strong>₹{(payment.amountPaise / 100).toFixed(2)}</strong>{payment.receiptDeliveries.map((receipt) => <small key={`${payment.id}-${receipt.channel}`}>Receipt {receipt.channel.toLowerCase()} · {receipt.status.toLowerCase()}{receipt.sentAt ? ` · ${displayDate(receipt.sentAt)}` : ""}</small>)}</div>)}</article>;
              }) : <p className="patient-empty">No invoices recorded.</p>}
            </section>

            <section className="patient-section"><div className="patient-section-title"><div><span className="patient-index">DOCUMENTS & CONSENT</span><h3>Clinical files & permissions</h3></div></div>
              {patient.clinicalRecords.length ? patient.clinicalRecords.map((item) => <article className="patient-history-row" key={item.id}><strong>{item.title}</strong><span>{item.type.replaceAll("_", " ")} · {displayDate(item.occurredAt)}{item.status ? ` · ${item.status}` : ""}</span>{item.summary && <small>{item.summary}</small>}</article>) : <p className="patient-empty">No additional clinical records attached.</p>}
              <div className="patient-availability-note"><strong>Consent versions and general document storage are not configured.</strong><span>Investigation reports are available in Diagnostics. The current schema has no versioned consent or general patient-file repository.</span></div>
            </section>
          </div>

          <section className="patient-section patient-timeline">
            <div className="patient-section-title"><div><span className="patient-index">LONGITUDINAL RECORD</span><h3>Timeline</h3></div>
              <div className="patient-filters" role="group" aria-label="Filter timeline">{["All activity", "Visits", "Vitals", "Prescriptions", "Diagnostics", "Admissions", "Documents & billing"].map((filter) => <button key={filter} className={timelineFilter === filter ? "active" : ""} onClick={() => setTimelineFilter(filter)}>{filter}</button>)}</div>
            </div>
            {visibleTimeline.length ? <div className="timeline-list">{visibleTimeline.map((item) => <article className="timeline-item" key={item.id}><time>{displayDate(item.date)}</time><i className={`timeline-dot ${item.kind.toLowerCase()}`} /><div><div className="timeline-line"><strong>{item.label}</strong><span>{item.kind}{item.status ? ` · ${item.status}` : ""}</span></div><p>{item.detail || "No additional details"}</p></div></article>)}</div> : <p className="patient-empty">No activity in this timeline yet.</p>}
          </section>

          {canRecordVitals && <section className="patient-section patient-entry">
            <div className="patient-section-title"><div><span className="patient-index">NURSING</span><h3>Record vitals</h3></div>{hasAbnormal(vitals) && <span className="vital-alert">Abnormal range</span>}</div>
            <form onSubmit={saveVitals}>
              <div className="vital-grid">{vitalFields.map(([key, label, unit, min, max, step]) => <label key={key}><span>{label}<small>{unit}</small></span><input className="inp" type="number" inputMode="decimal" min={min} max={max} step={step} value={vitals[key] || ""} onChange={(event) => setVitals((current) => ({ ...current, [key]: event.target.value }))} aria-label={`${label} in ${unit}`} /></label>)}</div>
              <label className="patient-field"><span>Notes</span><textarea className="inp" rows={2} value={vitalsNotes} onChange={(event) => setVitalsNotes(event.target.value)} maxLength={1000} /></label>
              <div className="patient-form-end"><span>Units are fixed per measurement. Values are validated before saving.</span><button className="btn sm" disabled={savingVitals}>{savingVitals ? "Saving…" : "Save vitals"}</button></div>
            </form>
          </section>}

          {canConsult && <section className="patient-section patient-entry">
            <div className="patient-section-title"><div><span className="patient-index">DOCTOR</span><h3>Consultation note</h3></div></div>
            <form onSubmit={saveEncounter}>
              <div className="voice-controls">
                <label className="voice-consent"><input type="checkbox" checked={voiceConsent} onChange={(event) => setVoiceConsent(event.target.checked)} /> Patient consented to browser speech recognition; audio may be processed by the browser provider.</label>
                <button type="button" className={`voice-button ${voiceActive ? "active" : ""}`} aria-pressed={voiceActive} onClick={toggleVoiceDictation}>{voiceActive ? "Stop dictation" : "Start dictation"}</button>
                <span>Dictates into the focused note field.</span>
              </div>
              <div className="patient-form-top"><label><span>Specialty template</span><select className="inp" value={specialty} onChange={(event) => applyTemplate(event.target.value)}>{Object.keys(specialtyTemplates).map((item) => <option key={item}>{item}</option>)}</select></label><label><span>Chief complaint</span><input className="inp" required minLength={2} maxLength={500} value={soap.chiefComplaint} onFocus={() => setActiveSoapField("chiefComplaint")} onChange={(event) => setSoap({ ...soap, chiefComplaint: event.target.value })} /></label></div>
              <div className="soap-grid">{(["subjective", "objective", "assessment", "plan"] as const).map((field) => <label key={field}><span>{field[0].toUpperCase() + field.slice(1)}</span><textarea className="inp" required rows={4} maxLength={8000} value={soap[field]} onFocus={() => setActiveSoapField(field)} onChange={(event) => setSoap({ ...soap, [field]: event.target.value })} /></label>)}</div>
              <div className="patient-form-top diagnosis-row"><label><span>ICD-10 diagnosis</span><select className="inp" value={soap.icd10Code} onChange={(event) => { const option = icdOptions.find(([code]) => code === event.target.value); setSoap({ ...soap, icd10Code: event.target.value, diagnosis: option?.[1] || soap.diagnosis }); }}><option value="">Select a diagnosis</option>{icdOptions.map(([code, label]) => <option key={code} value={code}>{code} · {label}</option>)}</select></label><label><span>Diagnosis description</span><input className="inp" value={soap.diagnosis} onChange={(event) => setSoap({ ...soap, diagnosis: event.target.value })} maxLength={250} /></label></div>
              <div className="patient-form-end"><span>Saved to the patient’s encounter history.</span><button className="btn sm" disabled={savingEncounter}>{savingEncounter ? "Saving…" : "Save consultation"}</button></div>
            </form>
          </section>}
        </main>}
      </div>
    </div>
  );

  if (role === "RECEPTION") return <ReceptionShell active="Patient records">{workspace}</ReceptionShell>;
  if (role !== "ADMIN") return workspace;
  return <div className="shell">
    <aside className="side">
      <Link className="logo" href="/hms"><i>+</i>MediAccess</Link>
      <div className="rl">{roleLabel("ADMIN")}</div>
      <Link className="nav" href="/hms/dashboard/admin"><span className="d" />Overview</Link>
      <Link className="nav" href="/hms/dashboard/admin/users"><span className="d" />User & role management</Link>
      <Link className="nav" href={`/hms/dashboard/${ROLE_TO_SLUG.ADMIN}/ipd/overview`}><span className="d" />IPD & OT</Link>
      <Link className="nav" href="/hms/dashboard/admin/pharmacy"><span className="d" />Pharmacy Dispensing & Inventory</Link>
      <Link className="nav on" aria-current="page" href="/hms/dashboard/admin/patients"><span className="d" />Patient records</Link>
      <Link className="nav" href="/hms/dashboard/admin/billing"><span className="d" />Billing & payments</Link>
      <Link className="nav" href="/hms/dashboard/admin/prescriptions"><span className="d" />E-prescriptions</Link>
      <Link className="nav" href="/hms/dashboard/admin/investigations"><span className="d" />Investigations & worklists</Link>
    </aside>
    <main className="main patient-admin-main"><div className="top"><h1>Admin dashboard</h1></div>{workspace}</main>
  </div>;
}