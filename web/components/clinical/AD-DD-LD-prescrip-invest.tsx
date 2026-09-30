"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { api, downloadFile, patch, post } from "@/lib/api";
import type { StaffRole } from "@/lib/roles";
import { MyProfileNavLink } from "@/components/hms/MyProfileNavLink";
import { DoctorShell } from "@/components/doctor/DD-sidebar";
import { PharmacyShell } from "@/components/pharmacy/PharmacyShell";
import { LabShell } from "@/components/clinical/LabShell";
import { isLabSection, type LabNavigationItem, type LabSection } from "@/components/clinical/LD-sidebar";

type Department = "LAB" | "RADIOLOGY" | "AUDIOLOGY";
type Drug = {
  id: string; genericName: string; strength: string; dosageForm: string; route: string; schedule: string;
  brands: { id: string; brandName: string; manufacturer: string | null }[];
};
type Favorite = { id: string; drugGenericId: string; defaultDose: string; defaultRoute: string; defaultFrequency: string; defaultDurationDays: number; defaultQuantity: string; instructions: string | null; drugGeneric: Drug };
type Template = { id: string; name: string; specialty: string | null; diagnosis: string | null; items: unknown };
type Test = { id: string; code: string; name: string; department: Department; description: string | null };
type Patient = { id: string; name: string; mrn: string; dob: string };
type Encounter = { id: string; chiefComplaint: string; diagnosis: string | null; createdAt: string };
type Order = {
  id: string; department: Department; priority: string; status: string; clinicalNotes: string | null; orderedAt: string; updatedAt?: string;
  test: Test; patient: { id: string; mrn: string; dob?: string; user: { name: string; phone?: string | null } };
  orderedBy: { user: { name: string; email?: string } }; encounter: { id: string; chiefComplaint: string } | null;
  reports: { id: string; fileName: string; summary: string | null; isCritical: boolean; uploadedAt: string }[];
};
type Warning = { type: string; severity: string; message: string; recommendation?: string; allergen?: string; reaction?: string | null; drugs?: string[] };
type Notice = { id: string; type: string; title: string; message: string; createdAt: string; readAt: string | null };
type PrescriptionItemDraft = { drugGenericId: string; drugBrandId: string; dose: string; route: string; frequency: string; durationDays: string; unitsPerDose: string; quantity: string; instructions: string };

const blankPrescriptionItem = (): PrescriptionItemDraft => ({ drugGenericId: "", drugBrandId: "", dose: "", route: "", frequency: "Once daily", durationDays: "5", unitsPerDose: "1", quantity: "5", instructions: "" });
const departments: { id: Department; label: string }[] = [{ id: "LAB", label: "Laboratory" }, { id: "RADIOLOGY", label: "Radiology" }, { id: "AUDIOLOGY", label: "Audiology" }];
const frequencies = [{ label: "Once daily", doses: 1 }, { label: "Twice daily", doses: 2 }, { label: "Three times daily", doses: 3 }, { label: "Four times daily", doses: 4 }, { label: "Every 8 hours", doses: 3 }, { label: "As needed", doses: 1 }];
const dateText = (date: string) => new Date(date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const elapsedMinutes = (start: string, end: string | number) => Math.max(0, Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 60_000));
const durationText = (minutes: number) => minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;

export function ClinicalWorkspace({ role, initialPanel = "prescriptions", initialLabSection = "Worklist", labNavigationItem }: { role: StaffRole; initialPanel?: "prescriptions" | "investigations" | "drug-master"; initialLabSection?: LabSection; labNavigationItem?: LabNavigationItem }) {
  const [panel, setPanel] = useState<"prescriptions" | "investigations" | "drug-master">(initialPanel);
  const [labSection, setLabSection] = useState<LabSection>(initialLabSection);
  const [drugs, setDrugs] = useState<Drug[]>([]);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [interactions, setInteractions] = useState<{ id: string; severity: string; description: string; recommendation: string | null; drugA: { id: string; genericName: string }; drugB: { id: string; genericName: string } }[]>([]);
  const [tests, setTests] = useState<Test[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [reportedOrders, setReportedOrders] = useState<Order[]>([]);
  const [notifications, setNotifications] = useState<Notice[]>([]);
  const [department, setDepartment] = useState<Department>("LAB");
  const [sampleLookup, setSampleLookup] = useState("");
  const [patientQuery, setPatientQuery] = useState("");
  const [patientResults, setPatientResults] = useState<Patient[]>([]);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [encounters, setEncounters] = useState<Encounter[]>([]);
  const [encounterId, setEncounterId] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [items, setItems] = useState<PrescriptionItemDraft[]>([blankPrescriptionItem()]);
  const [diagnosis, setDiagnosis] = useState("");
  const [prescriptionNotes, setPrescriptionNotes] = useState("");
  const [safetyWarnings, setSafetyWarnings] = useState<Warning[]>([]);
  const [safetyReviewed, setSafetyReviewed] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [drugDraft, setDrugDraft] = useState({ genericName: "", strength: "", dosageForm: "", route: "Oral", schedule: "UNSCHEDULED" });
  const [brandDraft, setBrandDraft] = useState({ drugGenericId: "", brandName: "", manufacturer: "" });
  const [interactionDraft, setInteractionDraft] = useState({ drugAId: "", drugBId: "", severity: "MODERATE", description: "", recommendation: "" });
  const [orderDraft, setOrderDraft] = useState({ testId: "", priority: "ROUTINE", clinicalNotes: "" });
  const [reportDraft, setReportDraft] = useState<Record<string, { file: File | null; summary: string; isCritical: boolean }>>({});
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const canPrescribe = role === "DOCTOR";
  const canManageDrugs = role === "PHARMACIST" || role === "ADMIN";
  const canManageOrders = role === "LAB_TECH" || role === "ADMIN";

  useEffect(() => { setLabSection(initialLabSection); }, [initialLabSection]);

  async function loadClinicalData() {
    setLoading(true); setError("");
    try {
      if (role !== "LAB_TECH") {
        const catalog = await api<{ drugs: Drug[] }>("/clinical/drugs");
        setDrugs(catalog.drugs);
      }
      if (canPrescribe) {
        const [favoriteData, templateData, doctorData] = await Promise.all([
          api<{ favorites: Favorite[] }>("/clinical/prescription-favorites"),
          api<{ templates: Template[] }>("/clinical/prescription-templates"),
          role === "DOCTOR" ? api<{ doctor: { registrationNumber: string | null } }>("/clinical/doctor-profile") : Promise.resolve({ doctor: { registrationNumber: null } }),
        ]);
        setFavorites(favoriteData.favorites); setTemplates(templateData.templates); setRegistrationNumber(doctorData.doctor.registrationNumber || "");
      }
      if (role === "PHARMACIST" || role === "ADMIN") {
        const rules = await api<{ interactions: typeof interactions }>("/clinical/drug-interactions");
        setInteractions(rules.interactions);
      }
      if (panel === "investigations" || role === "LAB_TECH") {
        const [testData, orderData] = await Promise.all([
          api<{ tests: Test[] }>(`/clinical/investigation-tests?department=${department}`),
          role === "LAB_TECH" || role === "ADMIN"
            ? api<{ orders: Order[] }>(`/clinical/worklists/${department}`)
            : api<{ orders: Order[] }>("/clinical/investigation-orders"),
        ]);
        setTests(testData.tests); setOrders(orderData.orders);
        if (role === "LAB_TECH") {
          const reportedData = await api<{ orders: Order[] }>(`/clinical/worklists/${department}?status=REPORTED`);
          setReportedOrders(reportedData.orders);
        } else setReportedOrders([]);
      }
      if (role === "DOCTOR" || role === "LAB_TECH" || role === "ADMIN") {
        const data = await api<{ notifications: Notice[] }>("/clinical/notifications");
        setNotifications(data.notifications);
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load clinical workspace."); }
    finally { setLoading(false); }
  }

  useEffect(() => { void loadClinicalData(); }, [panel, department]);
  useEffect(() => {
    let active = true;
    const query = patientQuery.trim();
    if (query.length < 3) { setPatientResults([]); return; }
    const timer = window.setTimeout(() => {
      api<{ patients: Patient[] }>(`/clinical/patients/search?q=${encodeURIComponent(query)}`)
        .then((result) => { if (active) setPatientResults(result.patients); })
        .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Patient search failed."); });
    }, 220);
    return () => { active = false; window.clearTimeout(timer); };
  }, [patientQuery]);
  useEffect(() => {
    if (!patient || !["prescriptions", "investigations"].includes(panel)) { setEncounters([]); return; }
    let active = true;
    api<{ patient: { encounters: Encounter[] } }>(`/clinical/patients/${patient.id}`)
      .then((result) => { if (active) { setEncounters(result.patient.encounters); setEncounterId(result.patient.encounters[0]?.id ?? ""); } })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Could not load patient encounters."); });
    return () => { active = false; };
  }, [patient, panel]);

  const availableDepartments = role === "LAB_TECH" ? departments.filter((item) => item.id === "LAB") : departments;
  const lookup = sampleLookup.trim().toLowerCase();
  const labOrders = role === "LAB_TECH" && labSection === "Sample collection"
    ? orders.filter((order) => ["ORDERED", "COLLECTED"].includes(order.status) && (!lookup || [order.id, order.patient.mrn, order.test.code].some((value) => value.toLowerCase().includes(lookup))))
    : role === "LAB_TECH" && labSection === "Upload reports"
      ? orders.filter((order) => ["IN_PROGRESS", "COMPLETED"].includes(order.status))
      : orders;
  const criticalReports = reportedOrders.flatMap((order) => order.reports.filter((report) => report.isCritical).map((report) => ({ order, report })));
  const completedTurnaround = reportedOrders.flatMap((order) => order.reports.map((report) => elapsedMinutes(order.orderedAt, report.uploadedAt)));
  const averageTurnaround = completedTurnaround.length ? Math.round(completedTurnaround.reduce((sum, minutes) => sum + minutes, 0) / completedTurnaround.length) : 0;

  const availableTabs = [
    ...(canPrescribe || role === "PHARMACIST" || role === "ADMIN" ? [{ id: "prescriptions" as const, label: canPrescribe ? "E-prescriptions" : "Prescriptions" }] : []),
    ...(role === "DOCTOR" || role === "LAB_TECH" || role === "ADMIN" ? [{ id: "investigations" as const, label: "Investigations" }] : []),
    ...(canManageDrugs ? [{ id: "drug-master" as const, label: "Drug master & rules" }] : []),
  ];

  function pickPatient(selected: Patient) {
    setPatient(selected); setPatientQuery(selected.name); setPatientResults([]); setSafetyWarnings([]); setSafetyReviewed(false);
  }

  function updateItem(index: number, update: Partial<PrescriptionItemDraft>) {
    setItems((current) => current.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      const next = { ...item, ...update };
      const frequency = frequencies.find((option) => option.label === next.frequency)?.doses ?? 1;
      const duration = Number(next.durationDays) || 0;
      const units = Number(next.unitsPerDose) || 0;
      if ("durationDays" in update || "unitsPerDose" in update || "frequency" in update) next.quantity = String(duration * units * frequency);
      return next;
    }));
    setSafetyReviewed(false); setSafetyWarnings([]);
  }

  function selectDrug(index: number, drugId: string) {
    const drug = drugs.find((candidate) => candidate.id === drugId);
    updateItem(index, { drugGenericId: drugId, drugBrandId: "", route: drug?.route ?? "Oral" });
  }

  function applyFavorite(favorite: Favorite) {
    setItems((current) => [...current, {
      ...blankPrescriptionItem(), drugGenericId: favorite.drugGenericId, dose: favorite.defaultDose,
      route: favorite.defaultRoute, frequency: favorite.defaultFrequency, durationDays: String(favorite.defaultDurationDays),
      quantity: favorite.defaultQuantity, instructions: favorite.instructions || "",
    }]);
  }

  function applyTemplate(template: Template) {
    const saved = Array.isArray(template.items) ? template.items as Partial<PrescriptionItemDraft>[] : [];
    if (saved.length) setItems(saved.map((item) => ({ ...blankPrescriptionItem(), ...item, drugBrandId: item.drugBrandId || "" })));
    setDiagnosis(template.diagnosis || ""); setSafetyWarnings([]); setSafetyReviewed(false);
  }

  async function issuePrescription(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!patient) { setError("Choose a patient before prescribing."); return; }
    const cleanItems = items.filter((item) => item.drugGenericId).map(({ unitsPerDose: _units, ...item }) => ({
      ...item, drugBrandId: item.drugBrandId || undefined, durationDays: Number(item.durationDays),
    }));
    if (!cleanItems.length) { setError("Add at least one medication."); return; }
    setBusy(true); setError("");
    try {
      const check = await post<{ warnings: Warning[] }>("/clinical/prescriptions/safety-check", { patientId: patient.id, drugGenericIds: cleanItems.map((item) => item.drugGenericId) });
      const selectedControlled = drugs.filter((drug) => cleanItems.some((item) => item.drugGenericId === drug.id) && ["SCHEDULE_H1", "SCHEDULE_X", "NDPS"].includes(drug.schedule));
      setSafetyWarnings(check.warnings);
      if ((check.warnings.length || selectedControlled.length) && !safetyReviewed) {
        setNotice("Review safety and schedule warnings before issuing.");
        return;
      }
      const result = await post<{ prescription: { id: string; signatureDigest: string } }>(`/clinical/patients/${patient.id}/prescriptions`, {
        encounterId: encounterId || undefined, diagnosis, notes: prescriptionNotes,
        acknowledgeWarnings: true, items: cleanItems,
      });
      setNotice(`Prescription issued and digitally signed · ${result.prescription.signatureDigest.slice(0, 12)}…`);
      await downloadFile(`/clinical/prescriptions/${result.prescription.id}/pdf`, `prescription-${result.prescription.id}.pdf`);
      setItems([blankPrescriptionItem()]); setDiagnosis(""); setPrescriptionNotes(""); setSafetyWarnings([]); setSafetyReviewed(false);
    } catch (cause) {
      const details = (cause as { details?: { warnings?: Warning[] } }).details;
      if (details?.warnings) setSafetyWarnings(details.warnings);
      setError(cause instanceof Error ? cause.message : "Could not issue prescription.");
    } finally { setBusy(false); }
  }

  async function saveDoctorRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try { await patch("/clinical/doctor-profile", { registrationNumber }); setNotice("Registration number saved for signed prescriptions."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save registration number."); }
    finally { setBusy(false); }
  }

  async function saveFavorite(index: number) {
    const item = items[index];
    if (!item.drugGenericId || !item.dose) { setError("Select a drug and dosage before saving a favorite."); return; }
    setBusy(true); setError("");
    try {
      await post("/clinical/prescription-favorites", {
        drugGenericId: item.drugGenericId, defaultDose: item.dose, defaultRoute: item.route,
        defaultFrequency: item.frequency, defaultDurationDays: Number(item.durationDays), defaultQuantity: item.quantity,
        instructions: item.instructions || undefined,
      });
      setNotice("Favorite dosage saved."); await loadClinicalData();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save favorite."); }
    finally { setBusy(false); }
  }

  async function saveTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanItems = items.filter((item) => item.drugGenericId).map(({ unitsPerDose: _units, ...item }) => ({ ...item, drugBrandId: item.drugBrandId || undefined, durationDays: Number(item.durationDays) }));
    if (!cleanItems.length) { setError("Add medications before saving a template."); return; }
    setBusy(true); setError("");
    try {
      await post("/clinical/prescription-templates", { name: templateName, diagnosis, items: cleanItems });
      setTemplateName(""); setNotice("Prescription template saved."); await loadClinicalData();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save the template."); }
    finally { setBusy(false); }
  }

  async function saveDrug(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      await post("/clinical/drugs", drugDraft);
      setDrugDraft({ genericName: "", strength: "", dosageForm: "", route: "Oral", schedule: "UNSCHEDULED" });
      setNotice("Generic drug added."); await loadClinicalData();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save drug."); }
    finally { setBusy(false); }
  }

  async function saveBrand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      await post(`/clinical/drugs/${brandDraft.drugGenericId}/brands`, { brandName: brandDraft.brandName, manufacturer: brandDraft.manufacturer });
      setBrandDraft({ ...brandDraft, brandName: "", manufacturer: "" }); setNotice("Brand mapped to generic."); await loadClinicalData();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not map brand."); }
    finally { setBusy(false); }
  }

  async function saveInteraction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      await post("/clinical/drug-interactions", interactionDraft);
      setInteractionDraft({ drugAId: "", drugBId: "", severity: "MODERATE", description: "", recommendation: "" });
      setNotice("Interaction rule added."); await loadClinicalData();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not add interaction rule."); }
    finally { setBusy(false); }
  }

  async function createOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!patient) { setError("Choose a patient first."); return; }
    setBusy(true); setError("");
    try {
      await post("/clinical/investigation-orders", { patientId: patient.id, testId: orderDraft.testId, encounterId: encounterId || undefined, priority: orderDraft.priority, clinicalNotes: orderDraft.clinicalNotes });
      setOrderDraft({ ...orderDraft, clinicalNotes: "" }); setNotice("Investigation order routed to its department worklist."); await loadClinicalData();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not place investigation order."); }
    finally { setBusy(false); }
  }

  async function transitionOrder(order: Order, status: string) {
    setBusyId(order.id); setError("");
    try { await patch(`/clinical/investigation-orders/${order.id}/status`, { status }); setNotice(`${order.test.name}: ${status.toLowerCase().replaceAll("_", " ")}.`); await loadClinicalData(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update order status."); }
    finally { setBusyId(null); }
  }

  async function uploadReport(order: Order) {
    const draft = reportDraft[order.id];
    if (!draft?.file) { setError("Choose a report file first."); return; }
    setBusyId(order.id); setError("");
    try {
      const signed = await post<{ uploadUrl: string; objectKey: string; requiredHeaders: Record<string, string> }>(`/clinical/investigation-orders/${order.id}/upload-url`, { fileName: draft.file.name, contentType: draft.file.type });
      const uploaded = await fetch(signed.uploadUrl, { method: "PUT", headers: signed.requiredHeaders, body: draft.file });
      if (!uploaded.ok) throw new Error("Report upload to secure storage failed.");
      await post(`/clinical/investigation-orders/${order.id}/reports`, {
        objectKey: signed.objectKey, fileName: draft.file.name, contentType: draft.file.type,
        summary: draft.summary, isCritical: draft.isCritical,
      });
      setNotice(draft.isCritical ? "Critical report uploaded; the patient and ordering doctor were alerted." : "Report uploaded; the patient was notified.");
      setReportDraft((current) => ({ ...current, [order.id]: { file: null, summary: "", isCritical: false } })); await loadClinicalData();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not upload report."); }
    finally { setBusyId(null); }
  }

  async function downloadReport(reportId: string) {
    try {
      const result = await api<{ url: string }>(`/clinical/reports/${reportId}/download-url`);
      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not open report."); }
  }

  async function markRead(notification: Notice) {
    try { await patch(`/clinical/notifications/${notification.id}/read`, {}); setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, readAt: new Date().toISOString() } : item)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not mark notification read."); }
  }

  const currentTests = useMemo(() => tests.filter((test) => test.department === department), [tests, department]);

  const workspace = (
    <div className="clinical-workspace">
      <header className="clinical-header"><div><span className="clinical-kicker">{role === "LAB_TECH" ? "LABORATORY OPERATIONS" : "CLINICAL OPERATIONS"}</span><h1>{role === "LAB_TECH" ? labSection : panel === "drug-master" ? "Drug master & safety" : panel === "investigations" ? "Investigations" : "E-prescriptions"}</h1></div><button className="btn ghost sm" onClick={() => void loadClinicalData()} disabled={loading}>Refresh</button></header>
      {role !== "LAB_TECH" && <nav className="clinical-tabs" aria-label="Clinical workspace">{availableTabs.map((tab) => <button key={tab.id} className={panel === tab.id ? "active" : ""} onClick={() => setPanel(tab.id)}>{tab.label}</button>)}</nav>}
      {error && <div className="msg err" role="alert">{error}</div>}{notice && <div className="msg ok" role="status">{notice}</div>}
      {notifications.length > 0 && (role === "DOCTOR" || role === "ADMIN" || role === "LAB_TECH") && <section className="clinical-alert-strip"><strong>Clinical alerts</strong>{notifications.filter((notification) => !notification.readAt).slice(0, 3).map((notification) => <button key={notification.id} onClick={() => void markRead(notification)} className={notification.type === "CRITICAL_RESULT" ? "critical" : ""}><span>{notification.title}</span><small>{notification.message}</small></button>)}</section>}

      {panel === "prescriptions" && <>
        {role === "DOCTOR" && <form className="clinical-registration" onSubmit={saveDoctorRegistration}><label><span>Medical registration number</span><input className="inp" required maxLength={80} value={registrationNumber} onChange={(event) => setRegistrationNumber(event.target.value)} placeholder="Required on signed prescriptions" /></label><button className="btn sm" disabled={busy}>Save registration</button></form>}
        {canPrescribe ? <div className="clinical-prescription-layout">
          <section className="clinical-main-panel"><div className="clinical-panel-head"><div><span className="clinical-kicker">NEW PRESCRIPTION</span><h2>Composer</h2></div></div>
            <label className="clinical-field"><span>Patient</span><input className="inp" value={patientQuery} onChange={(event) => { setPatientQuery(event.target.value); setPatient(null); }} placeholder="Search name, MRN or phone" />{patientResults.length > 0 && <div className="clinical-patient-picks">{patientResults.map((result) => <button key={result.id} type="button" onClick={() => pickPatient(result)}><strong>{result.name}</strong><small>{result.mrn} · {result.dob}</small></button>)}</div>}</label>
            <div className="clinical-form-row"><label className="clinical-field"><span>Encounter</span><select className="inp" value={encounterId} onChange={(event) => setEncounterId(event.target.value)} disabled={!patient}><option value="">No linked encounter</option>{encounters.map((encounter) => <option key={encounter.id} value={encounter.id}>{dateText(encounter.createdAt)} · {encounter.diagnosis || encounter.chiefComplaint}</option>)}</select></label><label className="clinical-field"><span>Diagnosis</span><input className="inp" value={diagnosis} onChange={(event) => setDiagnosis(event.target.value)} maxLength={250} /></label></div>
            <div className="clinical-panel-head clinical-items-head"><h3>Medication builder</h3><button className="btn ghost sm" type="button" onClick={() => setItems((current) => [...current, blankPrescriptionItem()])}>Add medication</button></div>
            <div className="prescription-items">{items.map((item, index) => {
              const drug = drugs.find((candidate) => candidate.id === item.drugGenericId);
              const brands = drug?.brands ?? [];
              return <article className="prescription-item" key={index}>
                <div className="clinical-form-row drug-primary"><label className="clinical-field"><span>Generic drug</span><select className="inp" required value={item.drugGenericId} onChange={(event) => selectDrug(index, event.target.value)}><option value="">Select drug</option>{drugs.map((option) => <option key={option.id} value={option.id}>{option.genericName} · {option.strength} · {option.dosageForm}</option>)}</select></label><label className="clinical-field"><span>Brand</span><select className="inp" value={item.drugBrandId} onChange={(event) => updateItem(index, { drugBrandId: event.target.value })} disabled={!drug}><option value="">Generic</option>{brands.map((brand) => <option value={brand.id} key={brand.id}>{brand.brandName}{brand.manufacturer ? ` · ${brand.manufacturer}` : ""}</option>)}</select></label><div className="schedule-flag"><span>Schedule</span><strong>{drug?.schedule.replaceAll("_", " ") || "—"}</strong></div></div>
                <div className="dosage-builder"><label className="clinical-field"><span>Dose</span><input className="inp" required value={item.dose} onChange={(event) => updateItem(index, { dose: event.target.value })} placeholder="e.g. 500 mg" /></label><label className="clinical-field"><span>Route</span><input className="inp" required value={item.route} onChange={(event) => updateItem(index, { route: event.target.value })} /></label><label className="clinical-field"><span>Frequency</span><select className="inp" value={item.frequency} onChange={(event) => updateItem(index, { frequency: event.target.value })}>{frequencies.map((frequency) => <option key={frequency.label}>{frequency.label}</option>)}</select></label><label className="clinical-field"><span>Days</span><input className="inp" type="number" min="1" max="365" value={item.durationDays} onChange={(event) => updateItem(index, { durationDays: event.target.value })} /></label><label className="clinical-field"><span>Units per dose</span><input className="inp" type="number" min="1" max="20" value={item.unitsPerDose} onChange={(event) => updateItem(index, { unitsPerDose: event.target.value })} /></label><label className="clinical-field"><span>Quantity</span><input className="inp" value={item.quantity} onChange={(event) => updateItem(index, { quantity: event.target.value })} /></label></div>
                <label className="clinical-field"><span>Instructions</span><input className="inp" value={item.instructions} onChange={(event) => updateItem(index, { instructions: event.target.value })} maxLength={500} placeholder="With food, after meals, etc." /></label>
                <div className="prescription-item-actions"><button className="text-action" type="button" onClick={() => void saveFavorite(index)} disabled={busy || !item.drugGenericId}>Save favorite dosage</button><button className="text-action" type="button" onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))} disabled={items.length === 1}>Remove medication</button></div>
              </article>;
            })}</div>
            <label className="clinical-field"><span>Prescription notes</span><textarea className="inp" rows={2} value={prescriptionNotes} onChange={(event) => setPrescriptionNotes(event.target.value)} maxLength={2000} /></label>
            {safetyWarnings.length > 0 && <div className="prescription-warnings"><strong>Safety check</strong>{safetyWarnings.map((warning, index) => <p key={`${warning.type}-${index}`}><b>{warning.severity} · {warning.type}</b> {warning.message}{warning.recommendation ? ` ${warning.recommendation}` : ""}</p>)}<label><input type="checkbox" checked={safetyReviewed} onChange={(event) => setSafetyReviewed(event.target.checked)} /> I reviewed these warnings and am proceeding with clinical judgment.</label></div>}
            <div className="clinical-form-end"><small>Schedule H1/X/NDPS items require review and acknowledgement. The signed PDF includes an integrity digest.</small><button className="btn" disabled={busy || !patient || !registrationNumber}>{busy ? "Checking & signing…" : "Issue & sign prescription"}</button></div>
            {!registrationNumber && role === "DOCTOR" && <p className="msg info">Add your medical registration number above before issuing prescriptions.</p>}
          </section>
          <aside className="clinical-side-panel"><section className="clinical-side-section"><div className="clinical-panel-head"><h3>Favorites</h3></div>{favorites.map((favorite) => <button className="clinical-favorite" type="button" key={favorite.id} onClick={() => applyFavorite(favorite)}><strong>{favorite.drugGeneric.genericName} · {favorite.drugGeneric.strength}</strong><small>{favorite.defaultDose} · {favorite.defaultFrequency} · {favorite.defaultDurationDays} days</small></button>)}{!favorites.length && <p className="clinical-empty">Save a dosage as a favorite from a medication row.</p>}</section>
            <section className="clinical-side-section"><div className="clinical-panel-head"><h3>Templates</h3></div>{templates.map((template) => <button className="clinical-favorite" type="button" key={template.id} onClick={() => applyTemplate(template)}><strong>{template.name}</strong><small>{template.specialty || "General"}{template.diagnosis ? ` · ${template.diagnosis}` : ""}</small></button>)}<form className="clinical-template-form" onSubmit={saveTemplate}><input className="inp" required value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="Template name"/><button className="btn ghost sm" disabled={busy}>Save current as template</button></form></section></aside>
        </div> : <PrescriptionList />}
      </>}

      {panel === "drug-master" && <div className="clinical-master-grid">
        {canManageDrugs && <section className="clinical-main-panel"><div className="clinical-panel-head"><div><span className="clinical-kicker">FORMULARY</span><h2>Add generic drug</h2></div></div><form className="clinical-drug-form" onSubmit={saveDrug}>
          <label className="clinical-field"><span>Generic name</span><input className="inp" required value={drugDraft.genericName} onChange={(event) => setDrugDraft({ ...drugDraft, genericName: event.target.value })} /></label><label className="clinical-field"><span>Strength</span><input className="inp" required value={drugDraft.strength} onChange={(event) => setDrugDraft({ ...drugDraft, strength: event.target.value })} placeholder="500 mg" /></label><label className="clinical-field"><span>Dosage form</span><input className="inp" required value={drugDraft.dosageForm} onChange={(event) => setDrugDraft({ ...drugDraft, dosageForm: event.target.value })} placeholder="Tablet" /></label><label className="clinical-field"><span>Route</span><input className="inp" required value={drugDraft.route} onChange={(event) => setDrugDraft({ ...drugDraft, route: event.target.value })} /></label><label className="clinical-field"><span>Schedule classification</span><select className="inp" value={drugDraft.schedule} onChange={(event) => setDrugDraft({ ...drugDraft, schedule: event.target.value })}>{Object.values(["UNSCHEDULED", "SCHEDULE_H", "SCHEDULE_H1", "SCHEDULE_X", "NDPS"]).map((schedule) => <option key={schedule} value={schedule}>{schedule.replaceAll("_", " ")}</option>)}</select></label><button className="btn" disabled={busy}>Add generic</button>
        </form>
        <form className="clinical-brand-form" onSubmit={saveBrand}><h3>Map brand to generic</h3><label className="clinical-field"><span>Generic</span><select className="inp" required value={brandDraft.drugGenericId} onChange={(event) => setBrandDraft({ ...brandDraft, drugGenericId: event.target.value })}><option value="">Choose generic</option>{drugs.map((drug) => <option value={drug.id} key={drug.id}>{drug.genericName} · {drug.strength}</option>)}</select></label><label className="clinical-field"><span>Brand</span><input className="inp" required value={brandDraft.brandName} onChange={(event) => setBrandDraft({ ...brandDraft, brandName: event.target.value })} /></label><label className="clinical-field"><span>Manufacturer</span><input className="inp" value={brandDraft.manufacturer} onChange={(event) => setBrandDraft({ ...brandDraft, manufacturer: event.target.value })} /></label><button className="btn ghost sm" disabled={busy || !drugs.length}>Add mapping</button></form>
        <section className="clinical-brand-list"><h3>Drug catalogue</h3>{drugs.map((drug) => <article key={drug.id}><strong>{drug.genericName} · {drug.strength}</strong><span>{drug.dosageForm} · {drug.route} · {drug.schedule.replaceAll("_", " ")}</span><small>{drug.brands.map((brand) => brand.brandName).join(", ") || "No brands mapped"}</small></article>)}</section></section>}
        <section className="clinical-main-panel"><div className="clinical-panel-head"><div><span className="clinical-kicker">RULES ENGINE</span><h2>Drug interactions</h2></div></div>{canManageDrugs && <form className="clinical-rule-form" onSubmit={saveInteraction}><label className="clinical-field"><span>Drug A</span><select className="inp" required value={interactionDraft.drugAId} onChange={(event) => setInteractionDraft({ ...interactionDraft, drugAId: event.target.value })}><option value="">Choose drug</option>{drugs.map((drug) => <option key={drug.id} value={drug.id}>{drug.genericName} · {drug.strength}</option>)}</select></label><label className="clinical-field"><span>Drug B</span><select className="inp" required value={interactionDraft.drugBId} onChange={(event) => setInteractionDraft({ ...interactionDraft, drugBId: event.target.value })}><option value="">Choose drug</option>{drugs.map((drug) => <option key={drug.id} value={drug.id}>{drug.genericName} · {drug.strength}</option>)}</select></label><label className="clinical-field"><span>Severity</span><select className="inp" value={interactionDraft.severity} onChange={(event) => setInteractionDraft({ ...interactionDraft, severity: event.target.value })}><option>MODERATE</option><option>MAJOR</option><option>CONTRAINDICATED</option></select></label><label className="clinical-field"><span>Rule</span><input className="inp" required value={interactionDraft.description} onChange={(event) => setInteractionDraft({ ...interactionDraft, description: event.target.value })} /></label><label className="clinical-field"><span>Recommendation</span><input className="inp" value={interactionDraft.recommendation} onChange={(event) => setInteractionDraft({ ...interactionDraft, recommendation: event.target.value })} /></label><button className="btn" disabled={busy || drugs.length < 2}>Add interaction rule</button></form>}
          <div className="clinical-rule-list">{interactions.map((rule) => <article key={rule.id}><span className={`interaction-severity ${rule.severity.toLowerCase()}`}>{rule.severity}</span><strong>{rule.drugA.genericName} + {rule.drugB.genericName}</strong><p>{rule.description}</p>{rule.recommendation && <small>{rule.recommendation}</small>}</article>)}{!interactions.length && <p className="clinical-empty">No interaction rules configured. Add local formulary rules; this is not an AI check.</p>}</div>
        </section>
      </div>}

      {role === "LAB_TECH" && labSection === "Critical alerts" && <section className="clinical-main-panel"><div className="clinical-panel-head"><div><span className="clinical-kicker">CRITICAL RESULTS</span><h2>Critical reports</h2></div><span>{criticalReports.length} flagged</span></div>{criticalReports.map(({ order, report }) => <article className="clinical-order" key={report.id}><div className="clinical-order-head"><div><strong>{order.test.name} · {order.patient.user.name}</strong><span>{order.patient.mrn} · Dr. {order.orderedBy.user.name}</span></div><span className="priority-tag stat">CRITICAL</span></div><div className="clinical-order-meta"><span>Uploaded {dateText(report.uploadedAt)}</span><span>{report.fileName}</span></div>{report.summary && <p className="clinical-order-note">{report.summary}</p>}<button className="text-action" onClick={() => void downloadReport(report.id)}>Open report</button></article>)}{!criticalReports.length && <p className="clinical-empty">No critical reports have been recorded for this department.</p>}<p className="clinical-order-note">Uploading a report marked critical sends a notification to its ordering doctor.</p></section>}

      {role === "LAB_TECH" && labSection === "Turnaround" && <section className="clinical-main-panel"><div className="clinical-panel-head"><div><span className="clinical-kicker">DEPARTMENT PERFORMANCE</span><h2>Laboratory turnaround</h2></div><span>{completedTurnaround.length} reported orders</span></div><div className="clinical-turnaround-metrics"><article><span>Average completed TAT</span><strong>{completedTurnaround.length ? durationText(averageTurnaround) : "No completed reports"}</strong></article><article><span>Orders in progress</span><strong>{orders.length}</strong></article><article><span>STAT orders open</span><strong>{orders.filter((order) => order.priority === "STAT").length}</strong></article></div><div className="tw"><table><thead><tr><th>Order</th><th>Patient</th><th>Test</th><th>Priority</th><th>Status</th><th>Elapsed TAT</th></tr></thead><tbody>{[...orders, ...reportedOrders].map((order) => { const lastReport = order.reports.reduce<string | null>((latest, report) => !latest || report.uploadedAt > latest ? report.uploadedAt : latest, null); const elapsed = elapsedMinutes(order.orderedAt, lastReport ?? Date.now()); return <tr key={order.id}><td>{order.id}</td><td>{order.patient.user.name}<small className="table-sub">{order.patient.mrn}</small></td><td>{order.test.name}</td><td>{order.priority}</td><td>{order.status.replaceAll("_", " ")}</td><td>{durationText(elapsed)}</td></tr>; })}{!orders.length && !reportedOrders.length && <tr><td colSpan={6}>No lab orders found.</td></tr>}</tbody></table></div></section>}

      {panel === "investigations" && !(role === "LAB_TECH" && ["Critical alerts", "Turnaround"].includes(labSection)) && <div className="clinical-investigation-grid">
        {canPrescribe && <section className="clinical-main-panel"><div className="clinical-panel-head"><div><span className="clinical-kicker">ORDER ENTRY</span><h2>New investigation</h2></div></div><form onSubmit={createOrder}>
          <label className="clinical-field"><span>Patient</span><input className="inp" value={patientQuery} onChange={(event) => { setPatientQuery(event.target.value); setPatient(null); }} placeholder="Search name, MRN or phone" />{patientResults.length > 0 && <div className="clinical-patient-picks">{patientResults.map((result) => <button key={result.id} type="button" onClick={() => pickPatient(result)}><strong>{result.name}</strong><small>{result.mrn}</small></button>)}</div>}</label>
          <div className="clinical-form-row"><label className="clinical-field"><span>Encounter</span><select className="inp" value={encounterId} onChange={(event) => setEncounterId(event.target.value)} disabled={!patient}><option value="">No linked encounter</option>{encounters.map((encounter) => <option key={encounter.id} value={encounter.id}>{dateText(encounter.createdAt)} · {encounter.chiefComplaint}</option>)}</select></label><label className="clinical-field"><span>Department</span><select className="inp" value={department} onChange={(event) => setDepartment(event.target.value as Department)}>{departments.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label></div>
          <div className="clinical-form-row"><label className="clinical-field"><span>Investigation</span><select className="inp" required value={orderDraft.testId} onChange={(event) => setOrderDraft({ ...orderDraft, testId: event.target.value })}><option value="">Choose investigation</option>{currentTests.map((test) => <option key={test.id} value={test.id}>{test.name} · {test.code}</option>)}</select></label><label className="clinical-field"><span>Priority</span><select className="inp" value={orderDraft.priority} onChange={(event) => setOrderDraft({ ...orderDraft, priority: event.target.value })}><option>ROUTINE</option><option>URGENT</option><option>STAT</option></select></label></div>
          <label className="clinical-field"><span>Clinical notes</span><textarea className="inp" rows={3} value={orderDraft.clinicalNotes} onChange={(event) => setOrderDraft({ ...orderDraft, clinicalNotes: event.target.value })} maxLength={1000} /></label><button className="btn" disabled={busy || !patient || !currentTests.length}>Route order</button>
        </form></section>}
        <section className="clinical-main-panel worklist-panel">{role === "LAB_TECH" && labSection === "Sample collection" && <label className="clinical-field lab-sample-lookup"><span>Scan sample barcode or enter sample ID</span><input className="inp" value={sampleLookup} onChange={(event) => setSampleLookup(event.target.value)} placeholder="Barcode, order ID, MRN, or test code" /><small>Barcode scanners that type into the focused field can locate the matching order.</small></label>}<div className="clinical-panel-head"><div><span className="clinical-kicker">DEPARTMENT QUEUE</span><h2>{role === "LAB_TECH" && labSection === "Upload reports" ? "Orders ready for reports" : labSection === "Sample collection" ? "Sample collection queue" : `${departments.find((item) => item.id === department)?.label} worklist`}</h2></div><select className="inp department-select" value={department} onChange={(event) => setDepartment(event.target.value as Department)}>{availableDepartments.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></div>
          <div className="clinical-order-list">{labOrders.map((order) => <article className="clinical-order" key={order.id}><div className="clinical-order-head"><div><strong>{order.test.name}</strong><span>{order.patient.user.name} · {order.patient.mrn}</span></div><span className={`priority-tag ${order.priority.toLowerCase()}`}>{order.priority}</span></div><div className="clinical-order-meta"><span>{dateText(order.orderedAt)}</span><span>{order.status.replaceAll("_", " ")}</span><span>Dr. {order.orderedBy.user.name}</span>{role === "LAB_TECH" && <span>Sample ID {order.id}</span>}</div>{order.encounter && <p className="clinical-order-note">Encounter: {order.encounter.chiefComplaint}</p>}{order.clinicalNotes && <p className="clinical-order-note">{order.clinicalNotes}</p>}
            {order.reports.map((report) => <div className={`clinical-report-row ${report.isCritical ? "critical" : ""}`} key={report.id}><span>{report.fileName}{report.isCritical ? " · Critical" : ""}</span><button className="text-action" onClick={() => void downloadReport(report.id)}>Open report</button></div>)}
            {canManageOrders && !["REPORTED", "CANCELLED"].includes(order.status) && <div className="clinical-order-actions">{order.status === "ORDERED" && <button className="btn ghost sm" disabled={busyId === order.id} onClick={() => void transitionOrder(order, "COLLECTED")}>Mark collected</button>}{order.status === "COLLECTED" && <button className="btn ghost sm" disabled={busyId === order.id} onClick={() => void transitionOrder(order, "IN_PROGRESS")}>Start processing</button>}{order.status === "IN_PROGRESS" && <button className="btn ghost sm" disabled={busyId === order.id} onClick={() => void transitionOrder(order, "COMPLETED")}>Mark complete</button>}{["IN_PROGRESS", "COMPLETED"].includes(order.status) && <ReportUpload order={order} draft={reportDraft[order.id]} disabled={busyId === order.id} onChange={(next) => setReportDraft((current) => ({ ...current, [order.id]: next }))} onSubmit={() => void uploadReport(order)} />}{!(["CANCELLED", "REPORTED"].includes(order.status)) && <button className="text-action" disabled={busyId === order.id} onClick={() => void transitionOrder(order, "CANCELLED")}>Cancel</button>}</div>}
          </article>)}{labOrders.length === 0 && <p className="clinical-empty">{labSection === "Upload reports" ? "No orders are ready for report upload." : sampleLookup ? "No sample matches that barcode or identifier." : "No investigation orders in this department queue."}</p>}</div>
        </section>
      </div>}
      {loading && <div className="clinical-loading">Refreshing clinical records…</div>}
    </div>
  );

  if (role === "DOCTOR") return <DoctorShell active={panel === "investigations" ? "Investigations" : "E-prescriptions"}>{workspace}</DoctorShell>;
  if (role === "PHARMACIST") return <PharmacyShell active="Drug master & safety">{workspace}</PharmacyShell>;
  if (role === "LAB_TECH") return <LabShell active={labNavigationItem ?? labSection}>{workspace}</LabShell>;
  if (role !== "ADMIN") return workspace;
  const prescriptionsActive = panel !== "investigations";
  return <div className="shell">
    <aside className="side">
      <Link className="logo" href="/hms"><i>+</i>MediAccess</Link>
      <div className="rl">Admin</div>
      <Link className="nav" href="/hms/dashboard/admin"><span className="d" />Overview</Link>
      <Link className="nav" href="/hms/dashboard/admin/users"><span className="d" />User & role management</Link>
      <Link className="nav" href="/hms/dashboard/admin/ipd/overview"><span className="d" />IPD & OT</Link>
      <Link className="nav" href="/hms/dashboard/admin/pharmacy"><span className="d" />Pharmacy Dispensing & Inventory</Link>
      <Link className="nav" href="/hms/dashboard/admin/patients"><span className="d" />Patient records</Link>
      <Link className="nav" href="/hms/dashboard/admin/billing"><span className="d" />Billing & payments</Link>
      <Link className={`nav ${prescriptionsActive ? "on" : ""}`} aria-current={prescriptionsActive ? "page" : undefined} href="/hms/dashboard/admin/prescriptions"><span className="d" />E-prescriptions</Link>
      <Link className={`nav ${!prescriptionsActive ? "on" : ""}`} aria-current={!prescriptionsActive ? "page" : undefined} href="/hms/dashboard/admin/investigations"><span className="d" />Investigations & worklists</Link>
      <MyProfileNavLink role="ADMIN" />
    </aside>
    <main className="main"><div className="top"><h1>Admin dashboard</h1></div>{workspace}</main>
  </div>;
}

function ReportUpload({ order, draft, disabled, onChange, onSubmit }: {
  order: Order; draft?: { file: File | null; summary: string; isCritical: boolean }; disabled: boolean;
  onChange: (draft: { file: File | null; summary: string; isCritical: boolean }) => void; onSubmit: () => void;
}) {
  const value = draft ?? { file: null, summary: "", isCritical: false };
  return <div className="report-upload"><label className="report-file-control"><span>{value.file?.name || "Choose PDF, PNG, or JPEG"}</span><input type="file" accept="application/pdf,image/png,image/jpeg" onChange={(event) => onChange({ ...value, file: event.target.files?.[0] ?? null })} /></label><input className="inp" placeholder="Result summary" value={value.summary} onChange={(event) => onChange({ ...value, summary: event.target.value })} maxLength={2000} /><label className="critical-check"><input type="checkbox" checked={value.isCritical} onChange={(event) => onChange({ ...value, isCritical: event.target.checked })} /> Critical value</label><button className="btn sm" type="button" disabled={disabled || !value.file} onClick={onSubmit}>Upload report</button></div>;
}

function PrescriptionList() {
  const [prescriptions, setPrescriptions] = useState<{ id: string; issuedAt: string | null; patient: { mrn: string; user: { name: string } }; items: { genericName: string; brandName: string | null; strength: string; schedule: string }[] }[]>([]);
  const [error, setError] = useState("");
  useEffect(() => { api<{ prescriptions: typeof prescriptions }>("/clinical/prescriptions").then((result) => setPrescriptions(result.prescriptions)).catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load prescriptions.")); }, []);
  return <section className="clinical-main-panel"><div className="clinical-panel-head"><div><span className="clinical-kicker">PRESCRIPTION QUEUE</span><h2>Issued prescriptions</h2></div></div>{error && <div className="msg err">{error}</div>}<div className="tw"><table><thead><tr><th>Patient</th><th>Issued</th><th>Medications</th><th>Schedule</th></tr></thead><tbody>{prescriptions.map((prescription) => <tr key={prescription.id}><td>{prescription.patient.user.name}<small className="table-sub">{prescription.patient.mrn}</small></td><td>{prescription.issuedAt ? dateText(prescription.issuedAt) : "Draft"}</td><td>{prescription.items.map((item) => `${item.brandName || item.genericName} ${item.strength}`).join(", ")}</td><td>{prescription.items.some((item) => item.schedule !== "UNSCHEDULED") ? "Controlled classification" : "Unscheduled"}</td></tr>)}{prescriptions.length === 0 && <tr><td colSpan={4}>No issued prescriptions.</td></tr>}</tbody></table></div></section>;
}