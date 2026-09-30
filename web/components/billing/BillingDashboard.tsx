"use client";

import Script from "next/script";
import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { api, downloadFile, post } from "@/lib/api";
import type { StaffRole } from "@/lib/roles";
import { ReceptionShell } from "@/components/reception/RD-sidebar";

declare global {
  interface Window {
    Razorpay?: new (options: {
      key: string; amount: number; currency: string; name: string; description: string; order_id: string;
      handler: (response: { razorpay_payment_id: string }) => void;
      modal: { ondismiss: () => void };
      theme: { color: string };
    }) => { open: () => void };
  }
}

type Service = {
  id: string; code: string; name: string; category: "SERVICE" | "PROCEDURE"; hsnSacCode: string;
  unitPricePaise: number; taxTreatment: "EXEMPT" | "TAXABLE"; gstRateBps: number;
};
type Counter = { id: string; code: string; name: string };
type Patient = { id: string; name: string; mrn: string; phone: string | null; stateCode: string | null };
type Appointment = { id: string; scheduledFor: string; startTime: string; status: string; reason: string | null };
type Invoice = {
  id: string; invoiceNumber: string; status: string; totalPaise: number; paidPaise: number; outstandingPaise: number;
  discountPaise: number; taxPaise: number; issuedAt: string;
  patient: { name: string; mrn: string };
  appointment: { scheduledFor: string } | null;
  admission: { admissionNumber: string } | null;
  payments: { id: string; mode: string; amountPaise: number; reference: string | null; counter: { name: string } | null; receiptDeliveries: { channel: string; status: string; lastError: string | null }[] }[];
};
type BillingData = {
  date: string; collectedPaise: number; paymentCount: number; outstandingPaise: number; outstandingCount: number;
  pendingDiscounts: number; unassignedCounter: number;
  modeSplit: { mode: string; amountPaise: number }[];
  counters: { id: string; name: string; code: string; amountPaise: number; paymentCount: number; reconciliation: { countedPaise: number; variancePaise: number; closedAt: string; note: string | null } | null }[];
  receivables: Invoice[];
};
type DiscountRequest = { id: string; requestedPaise: number; reason: string; requestedAt: string; invoice: { invoiceNumber: string; patient: { mrn: string; user: { name: string } } } };
type Settings = { name: string; legalName: string | null; gstin: string | null; stateCode: string | null; billingAddress: string | null; discountApprovalBps: number };

type BillingTab = "Overview" | "OPD billing" | "Services & rates" | "Reconciliation" | "GST setup";
const stateOptions = [
  ["01", "Jammu & Kashmir"], ["02", "Himachal Pradesh"], ["03", "Punjab"], ["04", "Chandigarh"], ["05", "Uttarakhand"], ["06", "Haryana"],
  ["07", "Delhi"], ["08", "Rajasthan"], ["09", "Uttar Pradesh"], ["10", "Bihar"], ["11", "Sikkim"], ["12", "Arunachal Pradesh"],
  ["13", "Nagaland"], ["14", "Manipur"], ["15", "Mizoram"], ["16", "Tripura"], ["17", "Meghalaya"], ["18", "Assam"], ["19", "West Bengal"],
  ["20", "Jharkhand"], ["21", "Odisha"], ["22", "Chhattisgarh"], ["23", "Madhya Pradesh"], ["24", "Gujarat"], ["27", "Maharashtra"],
  ["29", "Karnataka"], ["30", "Goa"], ["32", "Kerala"], ["33", "Tamil Nadu"], ["36", "Telangana"], ["37", "Andhra Pradesh"], ["38", "Ladakh"],
];
const payModes = [["CASH", "Cash"], ["CARD", "Card"], ["UPI", "UPI"], ["BANK_TRANSFER", "Bank transfer"], ["INSURANCE", "Insurance / TPA"]] as const;
const formatMoney = (paise: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(paise / 100);
const dateText = (date: string) => new Date(date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
function businessDate() {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)!.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function BillingDashboard({ role }: { role: StaffRole }) {
  const today = businessDate();
  const [tab, setTab] = useState<BillingTab>("Overview");
  const [reportDate, setReportDate] = useState(today);
  const [dashboard, setDashboard] = useState<BillingData | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [counters, setCounters] = useState<Counter[]>([]);
  const [discounts, setDiscounts] = useState<DiscountRequest[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [patientSearch, setPatientSearch] = useState("");
  const [patientResults, setPatientResults] = useState<Patient[]>([]);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [appointmentId, setAppointmentId] = useState("");
  const [placeOfSupply, setPlaceOfSupply] = useState("");
  const [lineItems, setLineItems] = useState<{ serviceItemId: string; quantity: string }[]>([{ serviceItemId: "", quantity: "1" }]);
  const [discountPercent, setDiscountPercent] = useState("0");
  const [discountReason, setDiscountReason] = useState("");
  const [counterId, setCounterId] = useState("");
  const [paymentInvoice, setPaymentInvoice] = useState<Invoice | null>(null);
  const [paymentAmounts, setPaymentAmounts] = useState<Record<string, string>>({});
  const [paymentReferences, setPaymentReferences] = useState<Record<string, string>>({});
  const [serviceDraft, setServiceDraft] = useState({ code: "", name: "", category: "SERVICE", hsnSacCode: "9993", unitPriceRupees: "", taxTreatment: "EXEMPT", gstRateBps: "0" });
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [counterDraft, setCounterDraft] = useState({ code: "", name: "" });
  const [closeAmounts, setCloseAmounts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [downloading, setDownloading] = useState<string | null>(null);
  const canManageServices = role === "ADMIN" || role === "ACCOUNTANT";
  const canManageGst = role === "ADMIN";

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [dashboardResult, invoiceResult, servicesResult, countersResult, discountsResult, settingsResult] = await Promise.all([
        api<BillingData>(`/billing/dashboard?date=${reportDate}`),
        api<{ invoices: Invoice[] }>("/billing/invoices"),
        api<{ services: Service[] }>("/billing/services"),
        api<{ counters: Counter[] }>("/billing/counters"),
        api<{ requests: DiscountRequest[] }>("/billing/pending-discounts"),
        api<{ settings: Settings }>("/billing/gst-settings"),
      ]);
      setDashboard(dashboardResult); setInvoices(invoiceResult.invoices); setServices(servicesResult.services);
      setCounters(countersResult.counters); setDiscounts(discountsResult.requests); setSettings(settingsResult.settings);
      setCounterId((current) => current || countersResult.counters[0]?.id || "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load billing data.");
    } finally { setLoading(false); }
  }

  useEffect(() => { void loadData(); }, [reportDate]);
  useEffect(() => {
    let active = true;
    const query = patientSearch.trim();
    if (query.length < 2) { setPatientResults([]); return; }
    const timer = window.setTimeout(() => {
      api<{ patients: Patient[] }>(`/billing/patients/search?q=${encodeURIComponent(query)}`)
        .then((result) => { if (active) setPatientResults(result.patients); })
        .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Patient search failed."); });
    }, 220);
    return () => { active = false; window.clearTimeout(timer); };
  }, [patientSearch]);
  useEffect(() => {
    if (!patient) { setAppointments([]); setAppointmentId(""); return; }
    let active = true;
    api<{ appointments: Appointment[] }>(`/billing/appointments?patientId=${encodeURIComponent(patient.id)}`)
      .then((result) => { if (active) { setAppointments(result.appointments); setAppointmentId(result.appointments[0]?.id ?? ""); } })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Could not load appointments."); });
    return () => { active = false; };
  }, [patient]);

  const subtotalPaise = useMemo(() => lineItems.reduce((sum, item) => {
    const service = services.find((candidate) => candidate.id === item.serviceItemId);
    return sum + (service?.unitPricePaise ?? 0) * (Number(item.quantity) || 0);
  }, 0), [lineItems, services]);
  const estimatedDiscount = Math.round(subtotalPaise * (Number(discountPercent) || 0) / 100);
  const estimatedTax = lineItems.reduce((sum, item) => {
    const service = services.find((candidate) => candidate.id === item.serviceItemId);
    const lineBase = (service?.unitPricePaise ?? 0) * (Number(item.quantity) || 0);
    return sum + (service?.taxTreatment === "TAXABLE" ? Math.round(lineBase * (service.gstRateBps / 10000) * (1 - (Number(discountPercent) || 0) / 100)) : 0);
  }, 0);
  const estimatedTotal = subtotalPaise - estimatedDiscount + estimatedTax;
  const manualPaymentTotal = payModes.reduce((sum, [mode]) => sum + Math.round((Number(paymentAmounts[mode]) || 0) * 100), 0);

  function selectPatient(selected: Patient) {
    setPatient(selected); setPatientSearch(selected.name); setPatientResults([]); setPlaceOfSupply(selected.stateCode || settings?.stateCode || "");
  }

  async function createInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!patient || !appointmentId) { setError("Choose a patient and an unbilled appointment."); return; }
    const items = lineItems.filter((item) => item.serviceItemId).map((item) => ({ serviceItemId: item.serviceItemId, quantity: Number(item.quantity) }));
    if (!items.length) { setError("Add at least one service or procedure."); return; }
    setBusy(true); setError("");
    try {
      const result = await post<{ invoice: Invoice; requiresApproval: boolean }>("/billing/opd-invoices", {
        appointmentId, counterId: counterId || undefined, placeOfSupplyStateCode: placeOfSupply || undefined,
        discountPercentBps: Math.round((Number(discountPercent) || 0) * 100), discountReason: discountReason || undefined, items,
      });
      setNotice(result.requiresApproval ? `Invoice ${result.invoice.invoiceNumber} is awaiting discount approval.` : `Invoice ${result.invoice.invoiceNumber} issued.`);
      setPatient(null); setPatientSearch(""); setLineItems([{ serviceItemId: "", quantity: "1" }]); setDiscountPercent("0"); setDiscountReason("");
      setTab("Overview"); await loadData();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not issue the invoice."); }
    finally { setBusy(false); }
  }

  async function saveService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const body = { ...serviceDraft, gstRateBps: Number(serviceDraft.gstRateBps) };
      if (editingServiceId) await api(`/billing/services/${editingServiceId}`, { method: "PATCH", body: JSON.stringify(body) });
      else await post("/billing/services", body);
      setServiceDraft({ code: "", name: "", category: "SERVICE", hsnSacCode: "9993", unitPriceRupees: "", taxTreatment: "EXEMPT", gstRateBps: "0" });
      setEditingServiceId(null); setNotice("Service rate card saved."); await loadData();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save the service."); }
    finally { setBusy(false); }
  }

  function editService(service: Service) {
    setServiceDraft({ code: service.code, name: service.name, category: service.category, hsnSacCode: service.hsnSacCode, unitPriceRupees: (service.unitPricePaise / 100).toFixed(2), taxTreatment: service.taxTreatment, gstRateBps: String(service.gstRateBps) });
    setEditingServiceId(service.id);
  }

  async function deactivateService(service: Service) {
    setBusy(true); setError("");
    try { await api(`/billing/services/${service.id}`, { method: "PATCH", body: JSON.stringify({ isActive: false }) }); setNotice(`${service.name} was deactivated.`); await loadData(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not deactivate the service."); }
    finally { setBusy(false); }
  }

  async function saveCounter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try { await post("/billing/counters", counterDraft); setCounterDraft({ code: "", name: "" }); setNotice("Billing counter added."); await loadData(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not add the counter."); }
    finally { setBusy(false); }
  }

  async function closeCounter(counter: BillingData["counters"][number]) {
    const countedRupees = closeAmounts[counter.id];
    if (countedRupees === undefined || countedRupees === "") { setError(`Enter the counted amount for ${counter.name}.`); return; }
    setBusy(true); setError("");
    try {
      await post(`/billing/counters/${counter.id}/reconcile`, { workDate: reportDate, countedRupees });
      setNotice(`${counter.name} reconciled.`); await loadData();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not reconcile this counter."); }
    finally { setBusy(false); }
  }

  async function saveGstSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!settings) return;
    setBusy(true); setError("");
    try {
      const updated = await api<{ settings: Settings }>("/billing/gst-settings", { method: "PATCH", body: JSON.stringify({ ...settings, discountApprovalBps: Math.round(settings.discountApprovalBps) }) });
      setSettings(updated.settings); setNotice("GST and discount settings updated.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save GST settings."); }
    finally { setBusy(false); }
  }

  async function decideDiscount(request: DiscountRequest, decision: "approve" | "reject") {
    setBusy(true); setError("");
    try { await post(`/billing/discount-requests/${request.id}/${decision}`, {}); setNotice(`Discount ${decision}d.`); await loadData(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update discount approval."); }
    finally { setBusy(false); }
  }

  async function capturePayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!paymentInvoice) return;
    const payments = payModes.filter(([mode]) => Number(paymentAmounts[mode]) > 0).map(([mode]) => ({ mode, amountRupees: paymentAmounts[mode], reference: paymentReferences[mode] || undefined }));
    if (!payments.length) { setError("Enter at least one payment amount."); return; }
    setBusy(true); setError("");
    try {
      await api(`/invoices/${paymentInvoice.id}/payments`, { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ counterId: counterId || undefined, payments }) });
      setNotice("Payment recorded. Receipt delivery has been queued."); setPaymentInvoice(null); setPaymentAmounts({}); setPaymentReferences({}); await loadData();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not record payment."); }
    finally { setBusy(false); }
  }

  async function beginRazorpay(invoice: Invoice) {
    if (!window.Razorpay) { setError("Online checkout is still loading. Try again shortly."); return; }
    setBusy(true); setError("");
    try {
      const result = await api<{ order: { id: string; amount: number; currency: string }; keyId: string }>(`/invoices/${invoice.id}/razorpay-order`, { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({}) });
      const checkout = new window.Razorpay({
        key: result.keyId, order_id: result.order.id, amount: result.order.amount, currency: result.order.currency,
        name: settings?.legalName || settings?.name || "MediAccess", description: `Invoice ${invoice.invoiceNumber}`,
        handler: () => { setNotice("Payment submitted. Waiting for verified gateway confirmation."); window.setTimeout(() => void loadData(), 1800); },
        modal: { ondismiss: () => setNotice("Online checkout closed.") }, theme: { color: "#0e7c86" },
      });
      checkout.open();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not start online checkout."); }
    finally { setBusy(false); }
  }

  async function downloadInvoice(invoice: Invoice) {
    setDownloading(invoice.id);
    try { await downloadFile(`/invoices/${invoice.id}/pdf`, `${invoice.invoiceNumber}.pdf`); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not download the invoice."); }
    finally { setDownloading(null); }
  }

  async function retryReceipt(paymentId: string) {
    try { await post(`/payments/${paymentId}/receipts/resend`, {}); setNotice("Receipt delivery retry requested."); await loadData(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not retry receipt delivery."); }
  }

  const workspace = (
    <div className="billing-workspace">
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />
      <header className="billing-header"><div><span className="billing-kicker">REVENUE OPERATIONS</span><h1>Billing & payments</h1></div><div className="billing-header-actions"><label>Business date<input type="date" value={reportDate} onChange={(event) => setReportDate(event.target.value)} /></label><button className="btn ghost sm" onClick={() => void loadData()} disabled={loading}>Refresh</button></div></header>
      <nav className="billing-tabs" aria-label="Billing sections">{(["Overview", "OPD billing", "Services & rates", "Reconciliation", "GST setup"] as BillingTab[]).map((item) => <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item}</button>)}</nav>
      {error && <div className="msg err" role="alert">{error}</div>}{notice && <div className="msg ok" role="status">{notice}</div>}

      {tab === "Overview" && <>
        <section className="billing-metrics">
          <div><span>Collected today</span><strong>{formatMoney(dashboard?.collectedPaise ?? 0)}</strong><small>{dashboard?.paymentCount ?? 0} receipts</small></div>
          <div><span>Outstanding receivables</span><strong>{formatMoney(dashboard?.outstandingPaise ?? 0)}</strong><small>{dashboard?.outstandingCount ?? 0} invoices</small></div>
          <div><span>Awaiting approval</span><strong>{dashboard?.pendingDiscounts ?? 0}</strong><small>discount requests</small></div>
          <div><span>Services available</span><strong>{services.length}</strong><small>active rate cards</small></div>
        </section>
        <div className="billing-overview-grid">
          <section className="billing-panel"><div className="billing-panel-head"><div><span className="billing-kicker">TODAY</span><h2>Collection by mode</h2></div></div>
            {dashboard?.modeSplit.length ? <div className="billing-mode-list">{dashboard.modeSplit.map((item) => <div key={item.mode}><span>{item.mode.replaceAll("_", " ")}</span><strong>{formatMoney(item.amountPaise)}</strong></div>)}</div> : <p className="billing-empty">No payments recorded today.</p>}
          </section>
          <section className="billing-panel"><div className="billing-panel-head"><div><span className="billing-kicker">COUNTERS</span><h2>Counter collection</h2></div><button className="text-action" onClick={() => setTab("Reconciliation")}>Reconcile →</button></div>
            {dashboard?.counters.map((counter) => <div className="billing-counter-row" key={counter.id}><span>{counter.name}<small>{counter.paymentCount} payments</small></span><strong>{formatMoney(counter.amountPaise)}</strong></div>)}
            {!!dashboard?.unassignedCounter && <div className="billing-counter-row"><span>Unassigned counter</span><strong>{formatMoney(dashboard.unassignedCounter)}</strong></div>}
          </section>
        </div>
        {role === "ADMIN" && discounts.length > 0 && <DiscountQueue requests={discounts} busy={busy} onDecision={decideDiscount} />}
        <InvoiceTable invoices={invoices} downloading={downloading} onDownload={downloadInvoice} onPay={(invoice) => setPaymentInvoice(invoice)} onRazorpay={beginRazorpay} onRetryReceipt={retryReceipt} />
      </>}

      {tab === "OPD billing" && <section className="billing-panel billing-create"><div className="billing-panel-head"><div><span className="billing-kicker">NEW CHARGE</span><h2>Create OPD invoice</h2></div></div>
        <form onSubmit={createInvoice}>
          <div className="billing-form-grid"><label><span>Patient</span><input className="inp" value={patientSearch} onChange={(event) => { setPatientSearch(event.target.value); setPatient(null); }} placeholder="Search by name, MRN or phone" />{patientResults.length > 0 && <div className="billing-patient-picks">{patientResults.map((result) => <button key={result.id} type="button" onClick={() => selectPatient(result)}><strong>{result.name}</strong><small>{result.mrn} · {result.phone || "No phone"}</small></button>)}</div>}</label>
            <label><span>Appointment</span><select className="inp" required value={appointmentId} onChange={(event) => setAppointmentId(event.target.value)} disabled={!patient}><option value="">{patient ? "Select unbilled appointment" : "Choose patient first"}</option>{appointments.map((appointment) => <option key={appointment.id} value={appointment.id}>{dateText(appointment.scheduledFor)} · {appointment.startTime} · {appointment.status.replaceAll("_", " ")}</option>)}</select></label>
            <label><span>Billing counter</span><select className="inp" value={counterId} onChange={(event) => setCounterId(event.target.value)}>{counters.map((counter) => <option value={counter.id} key={counter.id}>{counter.name}</option>)}</select></label>
            <label><span>Place of supply</span><select className="inp" value={placeOfSupply} onChange={(event) => setPlaceOfSupply(event.target.value)}><option value="">Use hospital state</option>{stateOptions.map(([code, name]) => <option key={code} value={code}>{code} · {name}</option>)}</select></label>
          </div>
          <div className="billing-panel-head line-head"><h3>Services and procedures</h3><button type="button" className="btn ghost sm" onClick={() => setLineItems((items) => [...items, { serviceItemId: "", quantity: "1" }])}>Add item</button></div>
          <div className="billing-charge-lines">{lineItems.map((item, index) => {
            const selected = services.find((service) => service.id === item.serviceItemId);
            return <div className="billing-charge-line" key={index}><label><span>Rate card item</span><select className="inp" required value={item.serviceItemId} onChange={(event) => setLineItems((items) => items.map((line, lineIndex) => lineIndex === index ? { ...line, serviceItemId: event.target.value } : line))}><option value="">Select service/procedure</option>{services.map((service) => <option key={service.id} value={service.id}>{service.name} · {formatMoney(service.unitPricePaise)}</option>)}</select></label><label><span>Qty</span><input className="inp" type="number" min="1" max="100" step="1" value={item.quantity} onChange={(event) => setLineItems((items) => items.map((line, lineIndex) => lineIndex === index ? { ...line, quantity: event.target.value } : line))} /></label><div className="billing-line-rate"><span>{selected ? `${selected.hsnSacCode} · ${selected.taxTreatment === "EXEMPT" ? "Exempt" : `${selected.gstRateBps / 100}% GST`}` : "HSN/SAC · tax"}</span><strong>{formatMoney((selected?.unitPricePaise ?? 0) * (Number(item.quantity) || 0))}</strong></div><button type="button" className="text-action" onClick={() => setLineItems((items) => items.filter((_, lineIndex) => lineIndex !== index))} disabled={lineItems.length === 1}>Remove</button></div>;
          })}</div>
          <div className="billing-form-grid discount-grid"><label><span>Discount (%)</span><input className="inp" type="number" min="0" max="100" step="0.01" value={discountPercent} onChange={(event) => setDiscountPercent(event.target.value)} /></label><label><span>Reason</span><input className="inp" maxLength={300} value={discountReason} onChange={(event) => setDiscountReason(event.target.value)} placeholder="Required for discounts" /></label></div>
          {settings && Number(discountPercent) * 100 > settings.discountApprovalBps && <div className="msg info">Discounts over {settings.discountApprovalBps / 100}% will wait for administrator approval before payment.</div>}
          <div className="billing-total"><div><span>Subtotal</span><strong>{formatMoney(subtotalPaise)}</strong></div><div><span>Discount</span><strong>-{formatMoney(estimatedDiscount)}</strong></div><div><span>Estimated GST</span><strong>{formatMoney(estimatedTax)}</strong></div><div className="grand"><span>Invoice total</span><strong>{formatMoney(estimatedTotal)}</strong></div></div>
          <div className="billing-form-end"><small>GST is calculated from each service rate card and place of supply.</small><button className="btn" disabled={busy || !services.length}>{busy ? "Issuing…" : "Issue invoice"}</button></div>
        </form>
      </section>}

      {tab === "Services & rates" && <div className="billing-admin-grid">
        {canManageServices && <section className="billing-panel"><div className="billing-panel-head"><div><span className="billing-kicker">RATE CARD</span><h2>{editingServiceId ? "Edit service or procedure" : "Add service or procedure"}</h2></div>{editingServiceId && <button className="text-action" type="button" onClick={() => { setEditingServiceId(null); setServiceDraft({ code: "", name: "", category: "SERVICE", hsnSacCode: "9993", unitPriceRupees: "", taxTreatment: "EXEMPT", gstRateBps: "0" }); }}>Cancel edit</button>}</div><form className="billing-service-form" onSubmit={saveService}>
          <label><span>Code</span><input className="inp" required value={serviceDraft.code} onChange={(event) => setServiceDraft({ ...serviceDraft, code: event.target.value.toUpperCase() })} /></label><label><span>Name</span><input className="inp" required value={serviceDraft.name} onChange={(event) => setServiceDraft({ ...serviceDraft, name: event.target.value })} /></label>
          <label><span>Category</span><select className="inp" value={serviceDraft.category} onChange={(event) => setServiceDraft({ ...serviceDraft, category: event.target.value })}><option value="SERVICE">Service</option><option value="PROCEDURE">Procedure</option></select></label><label><span>HSN / SAC</span><input className="inp" required pattern="[0-9]{4,8}" value={serviceDraft.hsnSacCode} onChange={(event) => setServiceDraft({ ...serviceDraft, hsnSacCode: event.target.value })} /></label>
          <label><span>Unit price (INR)</span><input className="inp" required type="number" min="0" step="0.01" value={serviceDraft.unitPriceRupees} onChange={(event) => setServiceDraft({ ...serviceDraft, unitPriceRupees: event.target.value })} /></label><label><span>Tax treatment</span><select className="inp" value={serviceDraft.taxTreatment} onChange={(event) => setServiceDraft({ ...serviceDraft, taxTreatment: event.target.value, gstRateBps: event.target.value === "EXEMPT" ? "0" : "1800" })}><option value="EXEMPT">Exempt</option><option value="TAXABLE">Taxable</option></select></label>
          <label><span>GST rate</span><select className="inp" value={serviceDraft.gstRateBps} disabled={serviceDraft.taxTreatment === "EXEMPT"} onChange={(event) => setServiceDraft({ ...serviceDraft, gstRateBps: event.target.value })}>{[[0, "0%"], [500, "5%"], [1200, "12%"], [1800, "18%"], [2800, "28%"]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <button className="btn" disabled={busy}>{busy ? "Saving…" : editingServiceId ? "Save changes" : "Save rate card"}</button>
        </form></section>}
        <section className="billing-panel"><div className="billing-panel-head"><div><span className="billing-kicker">ACTIVE CATALOG</span><h2>Services & procedures</h2></div></div><div className="tw"><table><thead><tr><th>Code</th><th>Item</th><th>HSN/SAC</th><th>Tax</th><th>Rate</th><th></th></tr></thead><tbody>{services.map((service) => <tr key={service.id}><td>{service.code}</td><td>{service.name}<small className="table-sub">{service.category}</small></td><td>{service.hsnSacCode}</td><td>{service.taxTreatment === "EXEMPT" ? "Exempt" : `${service.gstRateBps / 100}%`}</td><td>{formatMoney(service.unitPricePaise)}</td><td className="billing-row-actions">{canManageServices && <><button className="text-action" onClick={() => editService(service)}>Edit</button><button className="text-action" onClick={() => void deactivateService(service)} disabled={busy}>Deactivate</button></>}</td></tr>)}{!services.length && <tr><td colSpan={6}>No active rate cards.</td></tr>}</tbody></table></div></section>
      </div>}

      {tab === "Reconciliation" && <div className="billing-overview-grid">
        <section className="billing-panel"><div className="billing-panel-head"><div><span className="billing-kicker">DAILY CLOSE</span><h2>Counter reconciliation</h2></div></div><div className="tw"><table><thead><tr><th>Counter</th><th>Receipts</th><th>Payment count</th><th>Counted total</th><th>Variance</th><th></th></tr></thead><tbody>{dashboard?.counters.map((counter) => <tr key={counter.id}><td>{counter.name}<small className="table-sub">{counter.code}</small></td><td>{formatMoney(counter.amountPaise)}</td><td>{counter.paymentCount}</td><td>{counter.reconciliation ? formatMoney(counter.reconciliation.countedPaise) : canManageServices ? <input className="inp close-amount" type="number" min="0" step="0.01" value={closeAmounts[counter.id] ?? ""} onChange={(event) => setCloseAmounts({ ...closeAmounts, [counter.id]: event.target.value })} aria-label={`Counted amount for ${counter.name}`} /> : "Not closed"}</td><td>{counter.reconciliation ? <strong className={counter.reconciliation.variancePaise === 0 ? "billing-variance balanced" : "billing-variance"}>{formatMoney(counter.reconciliation.variancePaise)}</strong> : "—"}</td><td>{canManageServices && <button className="btn ghost sm" onClick={() => void closeCounter(counter)} disabled={busy}>{counter.reconciliation ? "Update close" : "Close counter"}</button>}</td></tr>)}</tbody></table></div>
          {dashboard?.unassignedCounter ? <p className="msg info">Unassigned counter payments: {formatMoney(dashboard.unassignedCounter)}</p> : null}
          {canManageServices && <form className="billing-counter-form" onSubmit={saveCounter}><input className="inp" placeholder="Counter code" required value={counterDraft.code} onChange={(event) => setCounterDraft({ ...counterDraft, code: event.target.value.toUpperCase() })} /><input className="inp" placeholder="Counter name" required value={counterDraft.name} onChange={(event) => setCounterDraft({ ...counterDraft, name: event.target.value })} /><button className="btn sm" disabled={busy}>Add counter</button></form>}
        </section>
        <section className="billing-panel"><div className="billing-panel-head"><div><span className="billing-kicker">TENDER MIX</span><h2>Payment mode split</h2></div></div>{dashboard?.modeSplit.map((item) => <div className="billing-counter-row" key={item.mode}><span>{item.mode.replaceAll("_", " ")}</span><strong>{formatMoney(item.amountPaise)}</strong></div>)}</section>
      </div>}

      {tab === "GST setup" && settings && <section className="billing-panel billing-settings"><div className="billing-panel-head"><div><span className="billing-kicker">TAX CONFIGURATION</span><h2>Supplier registration & approval rules</h2></div></div><form onSubmit={saveGstSettings}>
        <div className="billing-form-grid"><label><span>Legal entity name</span><input className="inp" disabled={!canManageGst} value={settings.legalName || ""} onChange={(event) => setSettings({ ...settings, legalName: event.target.value })} /></label><label><span>GSTIN</span><input className="inp" disabled={!canManageGst} maxLength={15} value={settings.gstin || ""} onChange={(event) => setSettings({ ...settings, gstin: event.target.value.toUpperCase() })} /></label><label><span>State code</span><select className="inp" disabled={!canManageGst} value={settings.stateCode || ""} onChange={(event) => setSettings({ ...settings, stateCode: event.target.value })}><option value="">Not configured</option>{stateOptions.map(([code, name]) => <option key={code} value={code}>{code} · {name}</option>)}</select></label><label><span>Address</span><input className="inp" disabled={!canManageGst} value={settings.billingAddress || ""} onChange={(event) => setSettings({ ...settings, billingAddress: event.target.value })} /></label><label><span>Auto-approval discount threshold (%)</span><input className="inp" disabled={!canManageGst} type="number" min="0" max="100" step="0.01" value={settings.discountApprovalBps / 100} onChange={(event) => setSettings({ ...settings, discountApprovalBps: Math.round(Number(event.target.value) * 100) })} /></label></div>
        {canManageGst && <div className="billing-form-end"><small>Discounts above this percentage enter the administrator approval queue.</small><button className="btn" disabled={busy}>Save tax settings</button></div>}
      </form></section>}

      {discounts.length > 0 && role === "ADMIN" && tab !== "Overview" && <DiscountQueue requests={discounts} busy={busy} onDecision={decideDiscount} />}
      {paymentInvoice && <div className="modal-scrim"><section className="treatment-modal billing-payment-modal" role="dialog" aria-modal="true" aria-labelledby="payment-title">
        <div className="ph"><div><h2 id="payment-title">Capture payment</h2><p>{paymentInvoice.invoiceNumber} · {paymentInvoice.patient.name} · Balance {formatMoney(paymentInvoice.outstandingPaise)}</p></div><button className="btn ghost sm" type="button" onClick={() => setPaymentInvoice(null)}>Close</button></div>
        <form onSubmit={capturePayment}><label className="l">Counter<select className="inp" value={counterId} onChange={(event) => setCounterId(event.target.value)}>{counters.map((counter) => <option key={counter.id} value={counter.id}>{counter.name}</option>)}</select></label>
          <div className="billing-payment-modes">{payModes.map(([mode, label]) => <label key={mode}><span>{label}</span><input className="inp" type="number" min="0" step="0.01" value={paymentAmounts[mode] || ""} onChange={(event) => setPaymentAmounts({ ...paymentAmounts, [mode]: event.target.value })} /><small>Reference</small><input className="inp" maxLength={100} value={paymentReferences[mode] || ""} onChange={(event) => setPaymentReferences({ ...paymentReferences, [mode]: event.target.value })} /></label>)}</div>
          <div className="invoice-total"><span>Payment total</span><strong>{formatMoney(manualPaymentTotal)}</strong></div>
          {manualPaymentTotal > paymentInvoice.outstandingPaise && <p className="msg err">Payment total exceeds the outstanding balance.</p>}
          <div className="acts"><button className="btn" disabled={busy || manualPaymentTotal <= 0 || manualPaymentTotal > paymentInvoice.outstandingPaise}>{busy ? "Recording…" : "Record payment"}</button><button type="button" className="btn ghost" onClick={() => void beginRazorpay(paymentInvoice)} disabled={busy}>Pay online with Razorpay</button></div>
        </form>
      </section></div>}
    </div>
  );

  if (role === "RECEPTION") return <ReceptionShell active="Billing & payments">{workspace}</ReceptionShell>;
  if (role !== "ADMIN") return workspace;
  return <div className="shell">
    <aside className="side">
      <Link className="logo" href="/hms"><i>+</i>MediAccess</Link>
      <div className="rl">Admin</div>
      <Link className="nav" href="/hms/dashboard/admin"><span className="d" />Overview</Link>
      <Link className="nav" href="/hms/dashboard/admin/users"><span className="d" />User & role management</Link>
      <Link className="nav" href="/hms/dashboard/admin/ipd/overview"><span className="d" />IPD & OT</Link>
      <Link className="nav" href="/hms/dashboard/admin/pharmacy"><span className="d" />Pharmacy Dispensing & Inventory</Link>
      <Link className="nav" href="/hms/dashboard/admin/patients"><span className="d" />Patient records</Link>
      <Link className="nav on" aria-current="page" href="/hms/dashboard/admin/billing"><span className="d" />Billing & payments</Link>
      <Link className="nav" href="/hms/dashboard/admin/prescriptions"><span className="d" />E-prescriptions</Link>
      <Link className="nav" href="/hms/dashboard/admin/investigations"><span className="d" />Investigations & worklists</Link>
    </aside>
    <main className="main"><div className="top"><h1>Admin dashboard</h1></div>{workspace}</main>
  </div>;
}

function InvoiceTable({ invoices, downloading, onDownload, onPay, onRazorpay, onRetryReceipt }: {
  invoices: Invoice[]; downloading: string | null; onDownload: (invoice: Invoice) => void; onPay: (invoice: Invoice) => void;
  onRazorpay: (invoice: Invoice) => void; onRetryReceipt: (paymentId: string) => void;
}) {
  return <section className="billing-panel billing-invoices"><div className="billing-panel-head"><div><span className="billing-kicker">LEDGER</span><h2>Recent invoices & receivables</h2></div></div><div className="tw"><table><thead><tr><th>Invoice</th><th>Patient</th><th>Issued</th><th>Total</th><th>Paid</th><th>Balance</th><th>Actions</th></tr></thead><tbody>{invoices.map((invoice) => <tr key={invoice.id}>
    <td>{invoice.invoiceNumber}<small className="table-sub">{invoice.status}</small></td><td>{invoice.patient.name}<small className="table-sub">{invoice.patient.mrn}</small></td><td>{dateText(invoice.issuedAt)}</td><td>{formatMoney(invoice.totalPaise)}</td><td>{formatMoney(invoice.paidPaise)}</td><td><strong>{formatMoney(invoice.outstandingPaise)}</strong></td>
    <td className="billing-row-actions"><button className="btn ghost sm" onClick={() => onDownload(invoice)} disabled={downloading === invoice.id}>{downloading === invoice.id ? "PDF…" : "PDF"}</button>{invoice.outstandingPaise > 0 && invoice.status === "ISSUED" && <><button className="btn sm" onClick={() => onPay(invoice)}>Capture</button><button className="btn ghost sm" onClick={() => onRazorpay(invoice)}>Razorpay</button></>}{invoice.payments.flatMap((payment) => payment.receiptDeliveries.filter((delivery) => delivery.status === "FAILED").map((delivery) => <button className="text-action" key={`${payment.id}-${delivery.channel}`} onClick={() => onRetryReceipt(payment.id)}>Retry {delivery.channel}</button>))}</td>
  </tr>)}{!invoices.length && <tr><td colSpan={7}>No invoices have been issued.</td></tr>}</tbody></table></div></section>;
}

function DiscountQueue({ requests, busy, onDecision }: { requests: DiscountRequest[]; busy: boolean; onDecision: (request: DiscountRequest, decision: "approve" | "reject") => void }) {
  return <section className="billing-panel discount-queue"><div className="billing-panel-head"><div><span className="billing-kicker">REVIEW REQUIRED</span><h2>Discount approvals</h2></div></div><div className="tw"><table><thead><tr><th>Invoice</th><th>Patient</th><th>Reason</th><th>Requested</th><th></th></tr></thead><tbody>{requests.map((request) => <tr key={request.id}><td>{request.invoice.invoiceNumber}</td><td>{request.invoice.patient.user.name}<small className="table-sub">{request.invoice.patient.mrn}</small></td><td>{request.reason}</td><td>{formatMoney(request.requestedPaise)}</td><td className="billing-row-actions"><button className="btn sm" disabled={busy} onClick={() => onDecision(request, "approve")}>Approve</button><button className="btn danger sm" disabled={busy} onClick={() => onDecision(request, "reject")}>Reject</button></td></tr>)}</tbody></table></div></section>;
}