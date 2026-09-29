"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { api, post } from "@/lib/api";
import type { StaffRole } from "@/lib/roles";

type PharmacyTab = "Dispense queue" | "Inventory & batches" | "Alerts";
type GenericDrug = { id: string; genericName: string; strength: string; dosageForm: string; schedule: string };
type Batch = { id: string; batchNumber: string; expiryDate: string; quantityOnHand: number; expired?: boolean };
type Inventory = { id: string; drugGenericId: string; reorderLevel: number; quantityOnHand: number; drugGeneric: GenericDrug; batches: Batch[] };
type PrescriptionLine = {
  id: string; drugGenericId: string; genericName: string; brandName: string | null; strength: string; dosageForm: string; schedule: string;
  quantity: string; dispensedQuantity: number; remainingQuantity: number; dose: string; route: string;
  frequency: string; durationDays: number; instructions: string | null;
};
type Prescription = {
  id: string; status: string; issuedAt: string; diagnosis: string | null; signatureValid: boolean;
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

const formatDate = (value: string) => new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const formatQuantity = (value: string | number) => Number(value).toLocaleString("en-IN");

export function PharmacyDashboard({ role }: { role: StaffRole }) {
  const [tab, setTab] = useState<PharmacyTab>("Dispense queue");
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [inventory, setInventory] = useState<Inventory[]>([]);
  const [drugs, setDrugs] = useState<GenericDrug[]>([]);
  const [alerts, setAlerts] = useState<{ lowStock: StockAlert[]; nearExpiry: StockAlert[]; expired: StockAlert[] }>({ lowStock: [], nearExpiry: [], expired: [] });
  const [selected, setSelected] = useState<Prescription | null>(null);
  const [draft, setDraft] = useState<Record<string, DispenseDraft>>({});
  const [inventoryItemId, setInventoryItemId] = useState("");
  const [reorderLevel, setReorderLevel] = useState("10");
  const [batchDraft, setBatchDraft] = useState({ batchNumber: "", expiryDate: "", quantity: "", unitCostRupees: "", note: "" });
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadData() {
    setLoading(true); setError("");
    try {
      const [queue, stock, catalog, alertData] = await Promise.all([
        api<{ prescriptions: Prescription[] }>("/pharmacy/dispense-queue"),
        api<{ inventory: Inventory[] }>("/pharmacy/inventory"),
        api<{ drugs: GenericDrug[] }>("/clinical/drugs"),
        api<typeof alerts>("/pharmacy/alerts"),
      ]);
      setPrescriptions(queue.prescriptions); setInventory(stock.inventory); setDrugs(catalog.drugs); setAlerts(alertData);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load pharmacy data."); }
    finally { setLoading(false); }
  }

  useEffect(() => { void loadData(); }, []);

  const stats = useMemo(() => ({
    waiting: prescriptions.filter((prescription) => prescription.status === "ISSUED").length,
    partial: prescriptions.filter((prescription) => prescription.status === "PARTIALLY_DISPENSED").length,
    low: alerts.lowStock.length,
    expiry: alerts.nearExpiry.length + alerts.expired.length,
  }), [prescriptions, alerts]);

  function openDispense(prescription: Prescription) {
    setSelected(prescription);
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
        body: JSON.stringify({ allocations }),
      });
      setNotice(result.dispense.status === "COMPLETE" ? "Prescription fully dispensed." : "Partial dispense recorded; remaining items stay in the queue.");
      setSelected(null); setDraft({}); await loadData();
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
    })));
  }

  return (
    <div className="pharmacy-workspace">
      <header className="pharmacy-header"><div><span className="pharmacy-kicker">PHARMACY OPERATIONS</span><h1>Dispensing & inventory</h1></div><button className="btn ghost sm" onClick={() => void loadData()} disabled={loading}>Refresh</button></header>
      <section className="pharmacy-stats"><div><span>Awaiting dispense</span><strong>{stats.waiting}</strong></div><div><span>Partially dispensed</span><strong>{stats.partial}</strong></div><div><span>Low stock</span><strong className={stats.low ? "alert-number" : ""}>{stats.low}</strong></div><div><span>Expiry alerts</span><strong className={stats.expiry ? "alert-number" : ""}>{stats.expiry}</strong></div></section>
      <nav className="pharmacy-tabs" aria-label="Pharmacy sections">{(["Dispense queue", "Inventory & batches", "Alerts"] as PharmacyTab[]).map((value) => <button key={value} className={tab === value ? "active" : ""} onClick={() => setTab(value)}>{value}</button>)}</nav>
      {error && <div className="msg err" role="alert">{error}</div>}{notice && <div className="msg ok" role="status">{notice}</div>}

      {tab === "Dispense queue" && <section className="pharmacy-panel"><div className="pharmacy-panel-head"><div><span className="pharmacy-kicker">ISSUED PRESCRIPTIONS</span><h2>Dispense queue</h2></div><span className="pharmacy-count">{prescriptions.length} active</span></div>
        <div className="pharmacy-prescription-list">{prescriptions.map((prescription) => <article className="pharmacy-prescription" key={prescription.id}><div className="pharmacy-prescription-head"><div><strong>{prescription.patient.user.name}</strong><span>{prescription.patient.mrn} · Dr. {prescription.doctor.user.name}</span></div><span className={`pharmacy-status ${prescription.status.toLowerCase()}`}>{prescription.status.replaceAll("_", " ")}</span></div><div className="pharmacy-diagnosis">{prescription.diagnosis || prescription.encounter?.diagnosis || prescription.encounter?.chiefComplaint || "No diagnosis recorded"}</div><div className="pharmacy-prescription-items">{prescription.items.map((item) => <div className="pharmacy-prescription-item" key={item.id}><span>{item.brandName || item.genericName} {item.strength} <small>{item.schedule.replaceAll("_", " ")}</small></span><span>{item.dose} · {item.route} · {item.frequency} · {item.durationDays} days</span><b>{item.dispensedQuantity}/{formatQuantity(item.quantity)} dispensed</b></div>)}</div><div className="pharmacy-prescription-foot"><small>Issued {prescription.issuedAt ? formatDate(prescription.issuedAt) : "—"}</small>{prescription.signatureValid ? <button className="btn sm" onClick={() => openDispense(prescription)}>Dispense</button> : <span className="pharmacy-status invalid">Signature invalid · contact prescriber</span>}</div></article>)}{!prescriptions.length && <p className="pharmacy-empty">No issued prescriptions are waiting to be dispensed.</p>}</div>
      </section>}

      {tab === "Inventory & batches" && <div className="pharmacy-inventory-layout"><section className="pharmacy-panel"><div className="pharmacy-panel-head"><div><span className="pharmacy-kicker">STOCK CONTROL</span><h2>Inventory items</h2></div></div>
        <div className="pharmacy-inventory-list">{inventory.map((item) => <article className="pharmacy-inventory-item" key={item.id}><div className="pharmacy-prescription-head"><div><strong>{item.drugGeneric.genericName} · {item.drugGeneric.strength}</strong><span>{item.drugGeneric.dosageForm} · {item.drugGeneric.schedule.replaceAll("_", " ")}</span></div><b className={item.quantityOnHand <= item.reorderLevel ? "alert-number" : ""}>{item.quantityOnHand} units</b></div><div className="pharmacy-batch-list">{item.batches.map((batch) => <div className={batch.expired ? "pharmacy-batch expired" : "pharmacy-batch"} key={batch.id}><span>{batch.batchNumber}</span><span>Expiry {formatDate(batch.expiryDate)}</span><strong>{batch.quantityOnHand}</strong>{batch.expired && <em>Expired</em>}</div>)}{!item.batches.length && <p className="pharmacy-empty">No stock batches recorded.</p>}</div></article>)}{!inventory.length && <p className="pharmacy-empty">Configure inventory items from the form.</p>}</div>
      </section><aside className="pharmacy-panel pharmacy-stock-forms"><form onSubmit={configureItem}><div className="pharmacy-panel-head"><div><span className="pharmacy-kicker">FORMULARY LINK</span><h2>Configure item</h2></div></div><label><span>Generic drug</span><select className="inp" required value={inventoryItemId} onChange={(event) => setInventoryItemId(event.target.value)}><option value="">Select generic</option>{drugs.map((drug) => <option key={drug.id} value={drug.id}>{drug.genericName} · {drug.strength}</option>)}</select></label><label><span>Low-stock threshold</span><input className="inp" type="number" min="0" step="1" value={reorderLevel} onChange={(event) => setReorderLevel(event.target.value)} /></label><button className="btn sm" disabled={busy}>Save inventory item</button></form>
        <form onSubmit={receiveBatch}><div className="pharmacy-panel-head"><div><span className="pharmacy-kicker">RECEIVING</span><h2>Receive batch</h2></div></div><label><span>Inventory item</span><select className="inp" required value={inventoryItemId} onChange={(event) => setInventoryItemId(event.target.value)}><option value="">Select inventory item</option>{inventory.map((item) => <option key={item.id} value={item.id}>{item.drugGeneric.genericName} · {item.drugGeneric.strength}</option>)}</select></label><label><span>Batch number</span><input className="inp" required maxLength={80} value={batchDraft.batchNumber} onChange={(event) => setBatchDraft({ ...batchDraft, batchNumber: event.target.value })} /></label><div className="pharmacy-form-row"><label><span>Expiry</span><input className="inp" type="date" required value={batchDraft.expiryDate} onChange={(event) => setBatchDraft({ ...batchDraft, expiryDate: event.target.value })} /></label><label><span>Quantity</span><input className="inp" type="number" min="1" step="1" required value={batchDraft.quantity} onChange={(event) => setBatchDraft({ ...batchDraft, quantity: event.target.value })} /></label></div><label><span>Unit cost (INR)</span><input className="inp" type="number" min="0" step="0.01" value={batchDraft.unitCostRupees} onChange={(event) => setBatchDraft({ ...batchDraft, unitCostRupees: event.target.value })} /></label><label><span>Note</span><input className="inp" maxLength={300} value={batchDraft.note} onChange={(event) => setBatchDraft({ ...batchDraft, note: event.target.value })} /></label><button className="btn sm" disabled={busy || !inventoryItemId}>Receive stock</button></form></aside></div>}

      {tab === "Alerts" && <div className="pharmacy-alert-grid"><AlertList title="Low stock" tone="low" items={alerts.lowStock.map((item) => ({ id: item.inventoryItemId, primary: `${item.drug.genericName} · ${item.drug.strength}`, secondary: `${item.quantityOnHand} on hand · reorder at ${item.reorderLevel}` }))} /><AlertList title="Near expiry · 90 days" tone="expiry" items={alerts.nearExpiry.map((item) => ({ id: item.batchId!, primary: `${item.drug.genericName} · ${item.drug.strength}`, secondary: `Batch ${item.batchNumber} · expires ${formatDate(item.expiryDate!)} · ${item.quantityOnHand} units` }))} /><AlertList title="Expired stock" tone="expired" items={alerts.expired.map((item) => ({ id: item.batchId!, primary: `${item.drug.genericName} · ${item.drug.strength}`, secondary: `Batch ${item.batchNumber} · expired ${formatDate(item.expiryDate!)} · ${item.quantityOnHand} units` }))} /></div>}

      {selected && <div className="modal-scrim"><section className="treatment-modal pharmacy-dispense-modal" role="dialog" aria-modal="true" aria-labelledby="dispense-title"><div className="ph"><div><h2 id="dispense-title">Dispense prescription</h2><p>{selected.patient.user.name} · {selected.patient.mrn} · Dr. {selected.doctor.user.name}</p></div><button type="button" className="btn ghost sm" onClick={() => setSelected(null)}>Close</button></div><form onSubmit={dispense}><div className="pharmacy-dispense-lines">{selected.items.filter((item) => item.remainingQuantity > 0).map((line) => {
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
      })}</div><p className="pharmacy-transaction-note">All selected stock decrements and dispense records commit together; any failed validation rolls back the entire dispense.</p><div className="acts"><button className="btn" disabled={busy}>{busy ? "Committing…" : "Commit dispense"}</button><button className="btn ghost" type="button" onClick={() => setSelected(null)}>Cancel</button></div></form></section></div>}
      {loading && <div className="clinical-loading">Refreshing pharmacy records…</div>}
    </div>
  );
}

function AlertList({ title, tone, items }: { title: string; tone: string; items: { id: string; primary: string; secondary: string }[] }) {
  return <section className={`pharmacy-panel pharmacy-alert-panel ${tone}`}><div className="pharmacy-panel-head"><div><span className="pharmacy-kicker">INVENTORY ALERT</span><h2>{title}</h2></div><strong>{items.length}</strong></div>{items.map((item) => <article key={item.id}><b>{item.primary}</b><span>{item.secondary}</span></article>)}{!items.length && <p className="pharmacy-empty">No alerts.</p>}</section>;
}