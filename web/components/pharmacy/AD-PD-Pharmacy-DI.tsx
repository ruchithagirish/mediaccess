"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, getMe, post, type SessionUser } from "@/lib/api";
import { ROLE_TO_SLUG, roleLabel, type StaffRole } from "@/lib/roles";
import { MyProfileNavLink } from "@/components/hms/MyProfileNavLink";
import { PharmacySidebar } from "@/components/pharmacy/PharmacyShell";
import type { PharmacyTab } from "@/components/pharmacy/PD-sidebar";

type GenericDrug = { id: string; genericName: string; strength: string; dosageForm: string; route: string; schedule: string; brands?: { id: string; brandName: string; manufacturer: string | null }[] };
type Batch = { id: string; batchNumber: string; expiryDate: string; quantityOnHand: number; expired?: boolean };
type Inventory = { id: string; drugGenericId: string; reorderLevel: number; quantityOnHand: number; drugGeneric: GenericDrug; batches: Batch[] };
type PrescriptionLine = {
  id: string; drugGenericId: string; genericName: string; brandName: string | null; strength: string; dosageForm: string; schedule: string;
  quantity: string; dispensedQuantity: number; remainingQuantity: number; dose: string; route: string;
  frequency: string; durationDays: number; instructions: string | null;
};
type Prescription = {
  id: string; status: string; issuedAt: string; diagnosis: string | null; signatureValid: boolean;
  safetyWarnings?: { type?: string; severity?: string; message?: string; recommendation?: string }[];
  patient: { id: string; mrn: string; user: { name: string } };
  doctor: { user: { name: string } };
  encounter: { chiefComplaint: string; diagnosis: string | null } | null;
  items: PrescriptionLine[];
};
type StockAlert = {
  inventoryItemId: string; drug: GenericDrug; quantityOnHand?: number; reorderLevel?: number;
  batchId?: string; batchNumber?: string; expiryDate?: string;
};
type DispenseBatchDraft = { batchId: string; quantity: string };
type DispenseDraft = { batches: DispenseBatchDraft[]; substitutionReason: string };
type DrugInteraction = { id: string; severity: string; description: string; recommendation: string | null; drugA: { id: string; genericName: string }; drugB: { id: string; genericName: string } };
type HistoryPrescription = { id: string; status: string; issuedAt: string; diagnosis: string | null; patient: { mrn: string; user: { name: string } }; doctor: { user: { name: string } }; items: { genericName: string; brandName: string | null; strength: string; quantity: string; dispensedQuantity: number }[] };
type ControlledRegisterEntry = {
  id: string; createdAt: string; pharmacistNote: string | null; pharmacist: { name: string };
  prescription: { id: string; issuedAt: string | null; patient: { mrn: string; user: { name: string } }; doctor: { user: { name: string } } };
  lines: { quantity: number; batch: { batchNumber: string }; prescriptionItem: { genericName: string; brandName: string | null; strength: string; drugGeneric: { schedule: string } } }[];
};

const formatDate = (value: string) => new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const formatQuantity = (value: string | number) => Number(value).toLocaleString("en-IN");

export function PharmacyDashboard({ role, showOverview = false, initialTab }: { role: StaffRole; showOverview?: boolean; initialTab?: PharmacyTab }) {
  const router = useRouter();
  const isAdmin = role === "ADMIN";
  const [user, setUser] = useState<SessionUser | null>(null);
  const [tab, setTab] = useState<PharmacyTab>(initialTab ?? (isAdmin || showOverview ? "Overview" : "Dispense queue"));
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [inventory, setInventory] = useState<Inventory[]>([]);
  const [drugs, setDrugs] = useState<GenericDrug[]>([]);
  const [interactions, setInteractions] = useState<DrugInteraction[]>([]);
  const [prescriptionHistory, setPrescriptionHistory] = useState<HistoryPrescription[]>([]);
  const [controlledRegister, setControlledRegister] = useState<ControlledRegisterEntry[]>([]);
  const [historySearch, setHistorySearch] = useState("");
  const [alerts, setAlerts] = useState<{ lowStock: StockAlert[]; nearExpiry: StockAlert[]; expired: StockAlert[] }>({ lowStock: [], nearExpiry: [], expired: [] });
  const [selected, setSelected] = useState<Prescription | null>(null);
  const [draft, setDraft] = useState<Record<string, DispenseDraft>>({});
  const [pharmacistNote, setPharmacistNote] = useState("");
  const [safetyWarningsReviewed, setSafetyWarningsReviewed] = useState(false);
  const [inventoryItemId, setInventoryItemId] = useState("");
  const [reorderLevel, setReorderLevel] = useState("10");
  const [batchDraft, setBatchDraft] = useState({ batchNumber: "", expiryDate: "", quantity: "", unitCostRupees: "", note: "" });
  const [drugDraft, setDrugDraft] = useState({ genericName: "", strength: "", dosageForm: "", route: "", schedule: "UNSCHEDULED" });
  const [brandDraft, setBrandDraft] = useState({ drugGenericId: "", brandName: "", manufacturer: "" });
  const [interactionDraft, setInteractionDraft] = useState({ drugAId: "", drugBId: "", severity: "MODERATE", description: "", recommendation: "" });
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => { getMe().then(setUser).catch(() => router.replace("/staff/login")); }, [router]);

  async function loadData() {
    setLoading(true); setError("");
    try {
      const [queue, stock, catalog, alertData, interactionData, historyData, registerData] = await Promise.all([
        api<{ prescriptions: Prescription[] }>("/pharmacy/dispense-queue"),
        api<{ inventory: Inventory[] }>("/pharmacy/inventory"),
        api<{ drugs: GenericDrug[] }>("/clinical/drugs"),
        api<typeof alerts>("/pharmacy/alerts"),
        api<{ interactions: DrugInteraction[] }>("/clinical/drug-interactions"),
        api<{ prescriptions: HistoryPrescription[] }>("/clinical/prescriptions"),
        api<{ dispenses: ControlledRegisterEntry[] }>("/pharmacy/controlled-register"),
      ]);
      setPrescriptions(queue.prescriptions); setInventory(stock.inventory); setDrugs(catalog.drugs); setAlerts(alertData);
      setInteractions(interactionData.interactions); setPrescriptionHistory(historyData.prescriptions); setControlledRegister(registerData.dispenses);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load pharmacy data."); }
    finally { setLoading(false); }
  }

  useEffect(() => { void loadData(); const timer = window.setInterval(() => void loadData(), 30_000); return () => window.clearInterval(timer); }, []);

  const stats = useMemo(() => ({
    waiting: prescriptions.filter((prescription) => prescription.status === "ISSUED").length,
    partial: prescriptions.filter((prescription) => prescription.status === "PARTIALLY_DISPENSED").length,
    low: alerts.lowStock.length,
    expiry: alerts.nearExpiry.length + alerts.expired.length,
  }), [prescriptions, alerts]);
  const refillHistory = prescriptionHistory.filter((prescription) => {
    const query = historySearch.trim().toLowerCase();
    return !query || prescription.patient.user.name.toLowerCase().includes(query) || prescription.patient.mrn.toLowerCase().includes(query);
  });
  function openDispense(prescription: Prescription) {
    setSelected(prescription);
    setPharmacistNote(""); setSafetyWarningsReviewed(false);
    setDraft(Object.fromEntries(prescription.items.filter((item) => item.remainingQuantity > 0).map((item) => {
      const matchingItem = inventory.find((entry) => entry.drugGenericId === item.drugGenericId);
      const preferredBatch = matchingItem?.batches.find((batch) => !batch.expired && batch.quantityOnHand > 0);
      return [item.id, { batches: [{ batchId: preferredBatch?.id ?? "", quantity: "" }], substitutionReason: "" }];
    })));
  }

  async function receiveBatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!inventoryItemId) { setError("Choose an inventory item first."); return; }
    setBusy(true); setError("");
    try {
      await post(`/pharmacy/inventory/items/${inventoryItemId}/batches`, {
        ...batchDraft,
        quantity: Number(batchDraft.quantity),
        unitCostPaise: batchDraft.unitCostRupees ? Math.round(Number(batchDraft.unitCostRupees) * 100) : undefined,
      });
      setBatchDraft({ batchNumber: "", expiryDate: "", quantity: "", unitCostRupees: "", note: "" });
      setNotice("Stock received and added to the inventory ledger."); await loadData();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not receive batch."); }
    finally { setBusy(false); }
  }

  async function configureItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!inventoryItemId) { setError("Choose a generic drug first."); return; }
    setBusy(true); setError("");
    try {
      await post("/pharmacy/inventory/items", { drugGenericId: inventoryItemId, reorderLevel: Number(reorderLevel) });
      setNotice("Inventory item and reorder threshold saved."); await loadData();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not configure inventory item."); }
    finally { setBusy(false); }
  }

  async function saveGeneric(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      await post("/clinical/drugs", drugDraft);
      setDrugDraft({ genericName: "", strength: "", dosageForm: "", route: "", schedule: "UNSCHEDULED" });
      setNotice("Drug generic added to the master catalog."); await loadData();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not add drug generic."); }
    finally { setBusy(false); }
  }

  async function mapBrand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!brandDraft.drugGenericId) { setError("Choose a generic drug first."); return; }
    setBusy(true); setError("");
    try {
      await post(`/clinical/drugs/${brandDraft.drugGenericId}/brands`, { brandName: brandDraft.brandName, manufacturer: brandDraft.manufacturer || undefined });
      setBrandDraft({ ...brandDraft, brandName: "", manufacturer: "" });
      setNotice("Brand mapping added."); await loadData();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not map brand."); }
    finally { setBusy(false); }
  }

  async function addInteraction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      await post("/clinical/drug-interactions", { ...interactionDraft, recommendation: interactionDraft.recommendation || undefined });
      setInteractionDraft({ drugAId: "", drugBId: "", severity: "MODERATE", description: "", recommendation: "" });
      setNotice("Drug interaction rule added."); await loadData();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not add interaction rule."); }
    finally { setBusy(false); }
  }

  async function logout() {
    await post("/auth/logout").catch(() => {});
    router.push("/staff/login");
  }

  async function dispense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected) return;
    const allocations = selected.items.flatMap((item) => {
      const line = draft[item.id];
      const batches = line?.batches.filter((batch) => batch.batchId && Number(batch.quantity) > 0).map((batch) => ({ batchId: batch.batchId, quantity: Number(batch.quantity) })) ?? [];
      if (!batches.length) return [];
      return [{
        prescriptionItemId: item.id,
        batches,
        substitutionReason: line.substitutionReason || undefined,
      }];
    });
    if (!allocations.length) { setError("Enter a dispense quantity and batch for at least one medication."); return; }
    setBusy(true); setError("");
    try {
      const result = await api<{ dispense: { status: string } }>(`/pharmacy/prescriptions/${selected.id}/dispense`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ allocations, pharmacistNote: pharmacistNote.trim() || undefined, safetyWarningsReviewed }),
      });
      setNotice(result.dispense.status === "COMPLETE" ? "Prescription fully dispensed." : "Partial dispense recorded; remaining items stay in the queue.");
      setSelected(null); setDraft({}); setPharmacistNote(""); setSafetyWarningsReviewed(false); await loadData();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Dispense transaction failed; stock was not changed."); }
    finally { setBusy(false); }
  }

  function batchesFor(line: PrescriptionLine) {
    return inventory.flatMap((item) => item.batches.filter((batch) => !batch.expired && batch.quantityOnHand > 0).map((batch) => ({
      ...batch,
      inventoryItemId: item.id,
      drugGenericId: item.drugGenericId,
      drugName: `${item.drugGeneric.genericName} ${item.drugGeneric.strength}`,
      substituted: item.drugGenericId !== line.drugGenericId,
    }))).sort((first, second) => first.expiryDate.localeCompare(second.expiryDate));
  }

  const pharmacyTabs: PharmacyTab[] = ["Overview", "Dispense queue", "Inventory & batches", "Drug master & safety", "Schedule H/H1 register", "Patient refill history", "Alerts", "Inventory & ERP"];

  const workspace = (
    <div className="pharmacy-workspace">
      <header className="pharmacy-header"><div><span className="pharmacy-kicker">PHARMACY OPERATIONS</span><h1>Dispensing & inventory</h1><p>E-prescriptions, safety checks, stock and controlled-drug records.</p></div><div className="pharmacy-header-tools"><span>Refreshes every 30 seconds</span><Link className="btn ghost sm" href="/hms/dashboard/pharmacy/profile">My profile</Link><button className="btn ghost sm" onClick={() => void loadData()} disabled={loading}>Refresh</button></div></header>
      <section className="pharmacy-stats"><div><span>Awaiting dispense</span><strong>{stats.waiting}</strong></div><div><span>Partially dispensed</span><strong>{stats.partial}</strong></div><div><span>Low stock</span><strong className={stats.low ? "alert-number" : ""}>{stats.low}</strong></div><div><span>Expiry alerts</span><strong className={stats.expiry ? "alert-number" : ""}>{stats.expiry}</strong></div></section>
      {isAdmin && <nav className="pharmacy-tabs" aria-label="Pharmacy sections">{pharmacyTabs.map((value) => <button key={value} className={tab === value ? "active" : ""} onClick={() => setTab(value)}>{value}</button>)}</nav>}
      {error && <div className="msg err" role="alert">{error}</div>}{notice && <div className="msg ok" role="status">{notice}</div>}

      {tab === "Overview" && <>
        <div className="pharmacy-overview-grid">
          <section className="pharmacy-panel"><div className="pharmacy-panel-head"><div><span className="pharmacy-kicker">DISPENSING</span><h2>Queue requiring attention</h2></div><button className="text-action" type="button" onClick={() => setTab("Dispense queue")}>Open queue →</button></div>
            {prescriptions.slice(0, 5).map((prescription) => <article className="pharmacy-overview-queue-row" key={prescription.id}><div><strong>{prescription.patient.user.name}</strong><span>{prescription.patient.mrn} · Dr. {prescription.doctor.user.name}</span></div><span className={`pharmacy-status ${prescription.status.toLowerCase()}`}>{prescription.status.replaceAll("_", " ")}</span></article>)}
            {!prescriptions.length && <p className="pharmacy-empty">No issued prescriptions are waiting to be dispensed.</p>}
          </section>
          <section className="pharmacy-panel"><div className="pharmacy-panel-head"><div><span className="pharmacy-kicker">STOCK RISK</span><h2>Expiry & reorder alerts</h2></div><button className="text-action" type="button" onClick={() => setTab("Alerts")}>View alerts →</button></div>
            <div className="pharmacy-risk-row"><span>Below reorder level</span><strong className={stats.low ? "alert-number" : ""}>{stats.low}</strong></div>
            <div className="pharmacy-risk-row"><span>Expiring within 90 days</span><strong className={alerts.nearExpiry.length ? "alert-number" : ""}>{alerts.nearExpiry.length}</strong></div>
            <div className="pharmacy-risk-row"><span>Expired stock on hand</span><strong className={alerts.expired.length ? "alert-number" : ""}>{alerts.expired.length}</strong></div>
          </section>
        </div>
        <section className="pharmacy-panel pharmacy-controlled-register"><div className="pharmacy-panel-head"><div><span className="pharmacy-kicker">CONTROLLED MEDICINES</span><h2>Schedule H / H1 dispense register</h2></div><button className="text-action" type="button" onClick={() => setTab("Schedule H/H1 register")}>Open register →</button></div>
          <div className="pharmacy-controlled-summary"><strong>{controlledRegister.length}</strong><span>recorded H/H1 dispense entries</span></div>
          <p className="pharmacy-transaction-note">Each entry captures prescription, patient, prescriber, dispensed batch and quantity, pharmacist, timestamp, and pharmacist notes.</p>
        </section>
        <section className="pharmacy-transaction-banner"><strong>Safe dispense confirmation</strong><span>Safety warnings must be reviewed before confirmation; dispense records and stock decrements commit together, and failed validation rolls the transaction back.</span><small>Pharmacist notes and substitution reasons are retained with the dispense transaction.</small></section>
      </>}

      {tab === "Dispense queue" && <section className="pharmacy-panel"><div className="pharmacy-panel-head"><div><span className="pharmacy-kicker">ISSUED PRESCRIPTIONS</span><h2>Dispense queue</h2></div><span className="pharmacy-count">{prescriptions.length} active</span></div>
        <div className="pharmacy-prescription-list">{prescriptions.map((prescription) => <article className="pharmacy-prescription" key={prescription.id}><div className="pharmacy-prescription-head"><div><strong>{prescription.patient.user.name}</strong><span>{prescription.patient.mrn} · Dr. {prescription.doctor.user.name}</span></div><span className={`pharmacy-status ${prescription.status.toLowerCase()}`}>{prescription.status.replaceAll("_", " ")}</span></div><div className="pharmacy-diagnosis">{prescription.diagnosis || prescription.encounter?.diagnosis || prescription.encounter?.chiefComplaint || "No diagnosis recorded"}</div>{!!prescription.safetyWarnings?.length && <div className="pharmacy-safety-flags"><strong>Clinical safety flags</strong>{prescription.safetyWarnings.map((warning, index) => <span key={`${prescription.id}-warning-${index}`}><b>{warning.severity || warning.type || "Review"}</b> · {warning.message || "Review prescription warning."}{warning.recommendation ? ` ${warning.recommendation}` : ""}</span>)}</div>}<div className="pharmacy-prescription-items">{prescription.items.map((item) => <div className="pharmacy-prescription-item" key={item.id}><span>{item.brandName || item.genericName} {item.strength} <small>{item.schedule.replaceAll("_", " ")}</small></span><span>{item.dose} · {item.route} · {item.frequency} · {item.durationDays} days</span><b>{item.dispensedQuantity}/{formatQuantity(item.quantity)} dispensed</b></div>)}</div><div className="pharmacy-prescription-foot"><small>Issued {prescription.issuedAt ? formatDate(prescription.issuedAt) : "—"}</small>{prescription.signatureValid ? <button className="btn sm" onClick={() => openDispense(prescription)}>Dispense</button> : <span className="pharmacy-status invalid">Signature invalid · contact prescriber</span>}</div></article>)}{!prescriptions.length && <p className="pharmacy-empty">No issued prescriptions are waiting to be dispensed.</p>}</div>
      </section>}

      {tab === "Inventory & batches" && <div className="pharmacy-inventory-layout"><section className="pharmacy-panel"><div className="pharmacy-panel-head"><div><span className="pharmacy-kicker">STOCK CONTROL</span><h2>Inventory items</h2></div></div>
        <div className="pharmacy-inventory-list">{inventory.map((item) => <article className="pharmacy-inventory-item" key={item.id}><div className="pharmacy-prescription-head"><div><strong>{item.drugGeneric.genericName} · {item.drugGeneric.strength}</strong><span>{item.drugGeneric.dosageForm} · {item.drugGeneric.schedule.replaceAll("_", " ")}</span></div><b className={item.quantityOnHand <= item.reorderLevel ? "alert-number" : ""}>{item.quantityOnHand} units</b></div><div className="pharmacy-batch-list">{item.batches.map((batch) => <div className={batch.expired ? "pharmacy-batch expired" : "pharmacy-batch"} key={batch.id}><span>{batch.batchNumber}</span><span>Expiry {formatDate(batch.expiryDate)}</span><strong>{batch.quantityOnHand}</strong>{batch.expired && <em>Expired</em>}</div>)}{!item.batches.length && <p className="pharmacy-empty">No stock batches recorded.</p>}</div></article>)}{!inventory.length && <p className="pharmacy-empty">Configure inventory items from the form.</p>}</div>
      </section><aside className="pharmacy-panel pharmacy-stock-forms"><form onSubmit={configureItem}><div className="pharmacy-panel-head"><div><span className="pharmacy-kicker">FORMULARY LINK</span><h2>Configure item</h2></div></div><label><span>Generic drug</span><select className="inp" required value={inventoryItemId} onChange={(event) => setInventoryItemId(event.target.value)}><option value="">Select generic</option>{drugs.map((drug) => <option key={drug.id} value={drug.id}>{drug.genericName} · {drug.strength}</option>)}</select></label><label><span>Low-stock threshold</span><input className="inp" type="number" min="0" step="1" value={reorderLevel} onChange={(event) => setReorderLevel(event.target.value)} /></label><button className="btn sm" disabled={busy}>Save inventory item</button></form>
        <form onSubmit={receiveBatch}><div className="pharmacy-panel-head"><div><span className="pharmacy-kicker">RECEIVING</span><h2>Receive batch</h2></div></div><label><span>Inventory item</span><select className="inp" required value={inventoryItemId} onChange={(event) => setInventoryItemId(event.target.value)}><option value="">Select inventory item</option>{inventory.map((item) => <option key={item.id} value={item.id}>{item.drugGeneric.genericName} · {item.drugGeneric.strength}</option>)}</select></label><label><span>Batch number</span><input className="inp" required maxLength={80} value={batchDraft.batchNumber} onChange={(event) => setBatchDraft({ ...batchDraft, batchNumber: event.target.value })} /></label><div className="pharmacy-form-row"><label><span>Expiry</span><input className="inp" type="date" required value={batchDraft.expiryDate} onChange={(event) => setBatchDraft({ ...batchDraft, expiryDate: event.target.value })} /></label><label><span>Quantity</span><input className="inp" type="number" min="1" step="1" required value={batchDraft.quantity} onChange={(event) => setBatchDraft({ ...batchDraft, quantity: event.target.value })} /></label></div><label><span>Unit cost (INR)</span><input className="inp" type="number" min="0" step="0.01" value={batchDraft.unitCostRupees} onChange={(event) => setBatchDraft({ ...batchDraft, unitCostRupees: event.target.value })} /></label><label><span>Note</span><input className="inp" maxLength={300} value={batchDraft.note} onChange={(event) => setBatchDraft({ ...batchDraft, note: event.target.value })} /></label><button className="btn sm" disabled={busy || !inventoryItemId}>Receive stock</button></form></aside></div>}

      {tab === "Alerts" && <div className="pharmacy-alert-grid"><AlertList title="Low stock" tone="low" items={alerts.lowStock.map((item) => ({ id: item.inventoryItemId, primary: `${item.drug.genericName} · ${item.drug.strength}`, secondary: `${item.quantityOnHand} on hand · reorder at ${item.reorderLevel}` }))} /><AlertList title="Near expiry · 90 days" tone="expiry" items={alerts.nearExpiry.map((item) => ({ id: item.batchId!, primary: `${item.drug.genericName} · ${item.drug.strength}`, secondary: `Batch ${item.batchNumber} · expires ${formatDate(item.expiryDate!)} · ${item.quantityOnHand} units` }))} /><AlertList title="Expired stock" tone="expired" items={alerts.expired.map((item) => ({ id: item.batchId!, primary: `${item.drug.genericName} · ${item.drug.strength}`, secondary: `Batch ${item.batchNumber} · expired ${formatDate(item.expiryDate!)} · ${item.quantityOnHand} units` }))} /></div>}

      {tab === "Schedule H/H1 register" && <section className="pharmacy-panel"><div className="pharmacy-panel-head"><div><span className="pharmacy-kicker">REGULATORY REGISTER</span><h2>Schedule H / H1 dispenses</h2></div><span className="pharmacy-count">Latest {controlledRegister.length} entries</span></div><div className="pharmacy-register-list">{controlledRegister.map((entry) => <article key={entry.id}><header><div><strong>{entry.prescription.patient.user.name} · {entry.prescription.patient.mrn}</strong><span>Rx {entry.prescription.id} · prescribed by {entry.prescription.doctor.user.name}</span></div><time>{formatDate(entry.createdAt)}</time></header><div className="pharmacy-register-lines">{entry.lines.map((line, index) => <div key={`${entry.id}-${index}`}><strong>{line.prescriptionItem.brandName || line.prescriptionItem.genericName} · {line.prescriptionItem.strength}</strong><span>{line.prescriptionItem.drugGeneric.schedule.replaceAll("_", " ")} · batch {line.batch.batchNumber} · {line.quantity} dispensed</span></div>)}</div><footer><span>Dispensed by {entry.pharmacist.name}</span>{entry.pharmacistNote && <p>{entry.pharmacistNote}</p>}</footer></article>)}{!controlledRegister.length && <p className="pharmacy-empty">No Schedule H or H1 dispenses have been recorded.</p>}</div><p className="pharmacy-capability-note">This register lists recorded H/H1 dispense transactions and pharmacist notes. Confirm statutory register fields required by your jurisdiction before treating it as the official legal register.</p></section>}

      {tab === "Inventory & ERP" && <section className="pharmacy-erp-workspace">
        <div className="pharmacy-erp-heading"><div><span className="pharmacy-kicker">MODULE 9 · INVENTORY & ERP</span><h2>Stores, procurement & reconciliation</h2></div><span className="pharmacy-count">Pharmacy stock is live · ERP workflows require setup</span></div>
        <div className="pharmacy-erp-grid">
          <section className="pharmacy-panel pharmacy-erp-panel"><div className="pharmacy-panel-head"><div><span className="pharmacy-kicker">STORES & TRACEABILITY</span><h2>Item tracking</h2></div></div><div className="pharmacy-erp-row"><span>Pharmacy medicines · batch and expiry</span><b className="pharmacy-erp-state live">Live</b></div><div className="pharmacy-erp-row"><span>Central store and department locations</span><b className="pharmacy-erp-state setup">Not configured</b></div><div className="pharmacy-erp-row"><span>Consumables and surgical implants</span><b className="pharmacy-erp-state setup">Not configured</b></div><div className="pharmacy-erp-row"><span>Serial number tracking</span><b className="pharmacy-erp-state setup">Not configured</b></div></section>
          <section className="pharmacy-panel pharmacy-erp-panel"><div className="pharmacy-panel-head"><div><span className="pharmacy-kicker">AUTOMATED CONTROLS</span><h2>Stock planning</h2></div></div><div className="pharmacy-erp-row"><span>Low-stock and near-expiry alerts</span><b className="pharmacy-erp-state live">Live</b></div><div className="pharmacy-erp-row"><span>Store-manager alert routing</span><b className="pharmacy-erp-state setup">Not configured</b></div><div className="pharmacy-erp-row"><span>Consumption-velocity purchase suggestions</span><b className="pharmacy-erp-state setup">Not configured</b></div></section>
          <section className="pharmacy-panel pharmacy-erp-panel"><div className="pharmacy-panel-head"><div><span className="pharmacy-kicker">PROCUREMENT</span><h2>Purchase-to-invoice</h2></div></div><div className="pharmacy-erp-row"><span>Vendor master and rate contracts</span><b className="pharmacy-erp-state setup">Not configured</b></div><div className="pharmacy-erp-row"><span>Purchase requisitions and purchase orders</span><b className="pharmacy-erp-state setup">Not configured</b></div><div className="pharmacy-erp-row"><span>Goods receipt notes</span><b className="pharmacy-erp-state setup">Not configured</b></div><div className="pharmacy-erp-row"><span>Three-way invoice matching</span><b className="pharmacy-erp-state setup">Not configured</b></div></section>
          <section className="pharmacy-panel pharmacy-erp-panel"><div className="pharmacy-panel-head"><div><span className="pharmacy-kicker">HOSPITAL STORES</span><h2>Issue & audit</h2></div></div><div className="pharmacy-erp-row"><span>Department indents and issues</span><b className="pharmacy-erp-state setup">Not configured</b></div><div className="pharmacy-erp-row"><span>Physical stock verification</span><b className="pharmacy-erp-state setup">Not configured</b></div><div className="pharmacy-erp-row"><span>Variance reporting</span><b className="pharmacy-erp-state setup">Not configured</b></div></section>
        </div>
        <div className="pharmacy-erp-billing"><div><span className="pharmacy-kicker">BILLING INTEGRATION</span><strong>Medication charges are not posted during dispense</strong></div><p>Dispense confirmation and inventory decrement are atomic. Automatic invoice posting needs an approved medication price and tax configuration before it can be enabled.</p><Link className="btn ghost sm" href="/hms/dashboard/admin/billing">Open billing</Link></div>
      </section>}

      {tab === "Drug master & safety" && <div className="pharmacy-master-layout">
        <section className="pharmacy-panel"><div className="pharmacy-panel-head"><div><span className="pharmacy-kicker">DRUG MASTER</span><h2>Generics, brands & schedules</h2></div><span className="pharmacy-count">{drugs.length} active</span></div>
          <div className="pharmacy-master-list">{drugs.map((drug) => <article key={drug.id}><div><strong>{drug.genericName} · {drug.strength}</strong><span>{drug.dosageForm} · {drug.route} · {drug.schedule.replaceAll("_", " ")}</span></div><div className="pharmacy-brand-list">{drug.brands?.map((brand) => <span key={brand.id}>{brand.brandName}{brand.manufacturer ? ` · ${brand.manufacturer}` : ""}</span>)}</div></article>)}{!drugs.length && <p className="pharmacy-empty">No active generic drugs in the master catalog.</p>}</div>
          <div className="pharmacy-interaction-list"><div className="pharmacy-panel-head"><div><span className="pharmacy-kicker">CLINICAL SAFETY</span><h2>Drug interaction rules</h2></div><span className="pharmacy-count">{interactions.length}</span></div>{interactions.map((interaction) => <article key={interaction.id}><span className={`pharmacy-severity ${interaction.severity.toLowerCase()}`}>{interaction.severity}</span><div><strong>{interaction.drugA.genericName} + {interaction.drugB.genericName}</strong><span>{interaction.description}{interaction.recommendation ? ` ${interaction.recommendation}` : ""}</span></div></article>)}{!interactions.length && <p className="pharmacy-empty">No drug interaction rules configured.</p>}</div>
        </section>
        <aside className="pharmacy-panel pharmacy-master-forms">
          <form onSubmit={saveGeneric}><div className="pharmacy-panel-head"><div><span className="pharmacy-kicker">FORMULARY</span><h2>Add generic drug</h2></div></div><label><span>Generic name</span><input className="inp" required maxLength={120} value={drugDraft.genericName} onChange={(event) => setDrugDraft({ ...drugDraft, genericName: event.target.value })} /></label><div className="pharmacy-form-row"><label><span>Strength</span><input className="inp" required maxLength={60} value={drugDraft.strength} onChange={(event) => setDrugDraft({ ...drugDraft, strength: event.target.value })} /></label><label><span>Dosage form</span><input className="inp" required maxLength={60} value={drugDraft.dosageForm} onChange={(event) => setDrugDraft({ ...drugDraft, dosageForm: event.target.value })} /></label></div><div className="pharmacy-form-row"><label><span>Route</span><input className="inp" required maxLength={60} value={drugDraft.route} onChange={(event) => setDrugDraft({ ...drugDraft, route: event.target.value })} /></label><label><span>Schedule</span><select className="inp" value={drugDraft.schedule} onChange={(event) => setDrugDraft({ ...drugDraft, schedule: event.target.value })}>{["UNSCHEDULED", "SCHEDULE_H", "SCHEDULE_H1", "SCHEDULE_X", "NDPS"].map((schedule) => <option key={schedule} value={schedule}>{schedule.replaceAll("_", " ")}</option>)}</select></label></div><button className="btn sm" disabled={busy}>Add generic</button></form>
          <form onSubmit={mapBrand}><div className="pharmacy-panel-head"><div><span className="pharmacy-kicker">BRAND MAPPING</span><h2>Map brand</h2></div></div><label><span>Generic drug</span><select className="inp" required value={brandDraft.drugGenericId} onChange={(event) => setBrandDraft({ ...brandDraft, drugGenericId: event.target.value })}><option value="">Select generic</option>{drugs.map((drug) => <option key={drug.id} value={drug.id}>{drug.genericName} · {drug.strength}</option>)}</select></label><label><span>Brand name</span><input className="inp" required maxLength={120} value={brandDraft.brandName} onChange={(event) => setBrandDraft({ ...brandDraft, brandName: event.target.value })} /></label><label><span>Manufacturer</span><input className="inp" maxLength={120} value={brandDraft.manufacturer} onChange={(event) => setBrandDraft({ ...brandDraft, manufacturer: event.target.value })} /></label><button className="btn ghost sm" disabled={busy || !brandDraft.drugGenericId}>Map brand</button></form>
          <form onSubmit={addInteraction}><div className="pharmacy-panel-head"><div><span className="pharmacy-kicker">SAFETY RULE</span><h2>Add drug interaction</h2></div></div><div className="pharmacy-form-row"><label><span>Drug A</span><select className="inp" required value={interactionDraft.drugAId} onChange={(event) => setInteractionDraft({ ...interactionDraft, drugAId: event.target.value })}><option value="">Choose drug</option>{drugs.map((drug) => <option key={drug.id} value={drug.id}>{drug.genericName} · {drug.strength}</option>)}</select></label><label><span>Drug B</span><select className="inp" required value={interactionDraft.drugBId} onChange={(event) => setInteractionDraft({ ...interactionDraft, drugBId: event.target.value })}><option value="">Choose drug</option>{drugs.map((drug) => <option key={drug.id} value={drug.id}>{drug.genericName} · {drug.strength}</option>)}</select></label></div><label><span>Severity</span><select className="inp" value={interactionDraft.severity} onChange={(event) => setInteractionDraft({ ...interactionDraft, severity: event.target.value })}>{["MODERATE", "MAJOR", "CONTRAINDICATED"].map((severity) => <option key={severity} value={severity}>{severity}</option>)}</select></label><label><span>Clinical description</span><textarea className="inp" required minLength={5} maxLength={500} rows={2} value={interactionDraft.description} onChange={(event) => setInteractionDraft({ ...interactionDraft, description: event.target.value })} /></label><label><span>Recommendation</span><input className="inp" maxLength={500} value={interactionDraft.recommendation} onChange={(event) => setInteractionDraft({ ...interactionDraft, recommendation: event.target.value })} /></label><button className="btn ghost sm" disabled={busy || !interactionDraft.drugAId || !interactionDraft.drugBId || interactionDraft.drugAId === interactionDraft.drugBId}>Add interaction rule</button></form>
        </aside>
      </div>}

      {tab === "Patient refill history" && <section className="pharmacy-panel"><div className="pharmacy-panel-head"><div><span className="pharmacy-kicker">PRESCRIPTION HISTORY</span><h2>Patient refills</h2></div><label className="pharmacy-history-search"><span>Patient name or MRN</span><input className="inp" value={historySearch} onChange={(event) => setHistorySearch(event.target.value)} placeholder="Search patient" /></label></div><div className="pharmacy-history-list">{refillHistory.map((prescription) => <article key={prescription.id}><header><div><strong>{prescription.patient.user.name}</strong><span>{prescription.patient.mrn} · Dr. {prescription.doctor.user.name} · {prescription.issuedAt ? formatDate(prescription.issuedAt) : "Date unavailable"}</span></div><span className={`pharmacy-status ${prescription.status.toLowerCase()}`}>{prescription.status.replaceAll("_", " ")}</span></header><div>{prescription.items.map((item, index) => <span key={`${prescription.id}-${index}`}>{item.brandName || item.genericName} {item.strength} · {item.dispensedQuantity}/{formatQuantity(item.quantity)} dispensed</span>)}</div></article>)}{!refillHistory.length && <p className="pharmacy-empty">No prescription history matches this patient search.</p>}</div><p className="pharmacy-capability-note">History displays the most recent 200 tenant prescriptions from the clinical record endpoint; dedicated refill intervals and automatic refill eligibility are not modeled.</p></section>}

      {selected && <div className="modal-scrim"><section className="treatment-modal pharmacy-dispense-modal" role="dialog" aria-modal="true" aria-labelledby="dispense-title"><div className="ph"><div><h2 id="dispense-title">Dispense prescription</h2><p>{selected.patient.user.name} · {selected.patient.mrn} · Dr. {selected.doctor.user.name}</p></div><button type="button" className="btn ghost sm" onClick={() => setSelected(null)}>Close</button></div><form onSubmit={dispense}>{!!selected.safetyWarnings?.length && <div className="pharmacy-safety-flags"><strong>Safety review required before dispense</strong>{selected.safetyWarnings.map((warning, index) => <span key={`${selected.id}-modal-warning-${index}`}><b>{warning.severity || warning.type || "Review"}</b> · {warning.message || "Review prescription warning."}{warning.recommendation ? ` ${warning.recommendation}` : ""}</span>)}</div>}{!!selected.safetyWarnings?.length && <label className="pharmacy-safety-review"><input type="checkbox" checked={safetyWarningsReviewed} onChange={(event) => setSafetyWarningsReviewed(event.target.checked)} /><span>I reviewed the allergy, interaction, and schedule warnings above.</span></label>}<div className="pharmacy-dispense-lines">{selected.items.filter((item) => item.remainingQuantity > 0).map((line) => {
        const candidates = batchesFor(line);
        const lineDraft = draft[line.id] ?? { batches: [{ batchId: "", quantity: "" }], substitutionReason: "" };
        const substitutionRequired = lineDraft.batches.some((allocation) => candidates.some((batch) => batch.id === allocation.batchId && batch.substituted));
        const updateBatch = (index: number, changes: Partial<DispenseBatchDraft>) => setDraft((current) => ({
          ...current,
          [line.id]: { ...lineDraft, ...current[line.id], batches: (current[line.id]?.batches ?? lineDraft.batches).map((batch, batchIndex) => batchIndex === index ? { ...batch, ...changes } : batch) },
        }));
        return <article className="pharmacy-dispense-line" key={line.id}><div><strong>{line.brandName || line.genericName} · {line.strength}</strong><span>{line.dose} · {line.route} · {line.frequency} · {line.durationDays} days</span><small>{line.dispensedQuantity} dispensed · {line.remainingQuantity} remaining</small></div>{lineDraft.batches.map((allocation, index) => {
          const selectedBatch = candidates.find((batch) => batch.id === allocation.batchId);
          const otherQuantity = lineDraft.batches.reduce((sum, batch, batchIndex) => batchIndex === index ? sum : sum + (Number(batch.quantity) || 0), 0);
          const maxQuantity = Math.max(0, Math.min(line.remainingQuantity - otherQuantity, selectedBatch?.quantityOnHand ?? line.remainingQuantity));
          const availableCandidates = candidates.filter((batch) => batch.id === allocation.batchId || !lineDraft.batches.some((other, batchIndex) => batchIndex !== index && other.batchId === batch.id));
          return <div className="pharmacy-form-row" key={`${line.id}-${index}`}><label><span>Batch {index + 1} {candidates.length ? "· FEFO order" : "· no eligible stock"}</span><select className="inp" value={allocation.batchId} onChange={(event) => updateBatch(index, { batchId: event.target.value, quantity: "" })}><option value="">Choose batch</option>{availableCandidates.map((batch) => <option key={batch.id} value={batch.id}>{batch.drugName} · {batch.batchNumber} · exp {formatDate(batch.expiryDate)} · {batch.quantityOnHand} available{batch.substituted ? " · SUBSTITUTE" : ""}</option>)}</select></label><label><span>Quantity</span><input className="inp" type="number" min="0" max={maxQuantity} step="1" value={allocation.quantity} onChange={(event) => updateBatch(index, { quantity: event.target.value })} /></label></div>;
        })}<button type="button" className="btn ghost sm" disabled={!candidates.some((batch) => !lineDraft.batches.some((allocation) => allocation.batchId === batch.id))} onClick={() => setDraft((current) => ({ ...current, [line.id]: { ...lineDraft, ...current[line.id], batches: [...(current[line.id]?.batches ?? lineDraft.batches), { batchId: "", quantity: "" }] } }))}>Add batch</button>{substitutionRequired && <label className="clinical-field substitution-note"><span>Substitution reason required · prescribed {line.genericName}</span><input className="inp" required value={lineDraft.substitutionReason} onChange={(event) => setDraft((current) => ({ ...current, [line.id]: { ...lineDraft, ...current[line.id], substitutionReason: event.target.value } }))} maxLength={500} /></label>}</article>;
      })}</div><label className="pharmacy-note-field"><span>Pharmacist notes · optional</span><textarea className="inp" rows={3} maxLength={1000} value={pharmacistNote} onChange={(event) => setPharmacistNote(event.target.value)} /></label><p className="pharmacy-transaction-note">All selected stock decrements and dispense records commit together; any failed validation rolls back the entire dispense.</p><div className="acts"><button className="btn" disabled={busy || (!!selected.safetyWarnings?.length && !safetyWarningsReviewed)}>{busy ? "Committing…" : "Commit dispense"}</button><button className="btn ghost" type="button" onClick={() => setSelected(null)}>Cancel</button></div></form></section></div>}
      {loading && <div className="clinical-loading">Refreshing pharmacy records…</div>}
    </div>
  );

  if (role === "PHARMACIST") return <div className="shell">
    <aside className="side">
      <Link className="logo" href="/hms"><i>+</i>MediAccess</Link>
      <div className="rl">Pharmacist</div>
      <PharmacySidebar active={tab} onSectionSelect={setTab} />
    </aside>
    <main className="main pharmacy-admin-main"><div className="top"><h1>Pharmacy dashboard</h1><span style={{ color: "var(--muted)", fontSize: 14 }}>{user?.name}</span><button className="btn ghost sm" onClick={() => void logout()}>Log out</button></div>{workspace}</main>
  </div>;
  if (!isAdmin) return workspace;
  return <div className="shell">
    <aside className="side">
      <Link className="logo" href="/hms"><i>+</i>MediAccess</Link>
      <div className="rl">{roleLabel("ADMIN")}</div>
      <Link className="nav" href="/hms/dashboard/admin"><span className="d" />Overview</Link>
      <Link className="nav" href="/hms/dashboard/admin/users"><span className="d" />User & role management</Link>
      <Link className="nav" href={`/hms/dashboard/${ROLE_TO_SLUG.ADMIN}/ipd/overview`}><span className="d" />IPD & OT</Link>
      <Link className="nav on" aria-current="page" href="/hms/dashboard/admin/pharmacy"><span className="d" />Pharmacy Dispensing & Inventory</Link>
      <Link className="nav" href="/hms/dashboard/admin/patients"><span className="d" />Patient records</Link>
      <Link className="nav" href="/hms/dashboard/admin/billing"><span className="d" />Billing & payments</Link>
      <Link className="nav" href="/hms/dashboard/admin/prescriptions"><span className="d" />E-prescriptions</Link>
      <Link className="nav" href="/hms/dashboard/admin/investigations"><span className="d" />Investigations & worklists</Link>
      <MyProfileNavLink role="ADMIN" />
    </aside>
    <main className="main pharmacy-admin-main"><div className="top"><h1>Admin dashboard</h1><span style={{ color: "var(--muted)", fontSize: 14 }}>{user?.name}</span><button className="btn ghost sm" onClick={() => void logout()}>Log out</button></div>{workspace}</main>
  </div>;
}

function AlertList({ title, tone, items }: { title: string; tone: string; items: { id: string; primary: string; secondary: string }[] }) {
  return <section className={`pharmacy-panel pharmacy-alert-panel ${tone}`}><div className="pharmacy-panel-head"><div><span className="pharmacy-kicker">INVENTORY ALERT</span><h2>{title}</h2></div><strong>{items.length}</strong></div>{items.map((item) => <article key={item.id}><b>{item.primary}</b><span>{item.secondary}</span></article>)}{!items.length && <p className="pharmacy-empty">No alerts.</p>}</section>;
}