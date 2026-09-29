"use client";
import { useState, type FormEvent } from "react";
import { post } from "@/lib/api";
import type { AppointmentSummary } from "@/lib/appointments";

interface ChargeLine {
  description: string;
  quantity: string;
  unitPriceRupees: string;
}

export function TreatmentInvoiceForm({ appointment, onClose, onComplete }: {
  appointment: AppointmentSummary;
  onClose: () => void;
  onComplete: (invoice: { invoiceNumber: string; totalPaise: number }) => void;
}) {
  const [summary, setSummary] = useState("");
  const [lines, setLines] = useState<ChargeLine[]>([{ description: "", quantity: "1", unitPriceRupees: "" }]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function updateLine(index: number, field: keyof ChargeLine, value: string) {
    setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, [field]: value } : line));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await post<{ invoice: { invoiceNumber: string; totalPaise: number } }>(`/appointments/${appointment.id}/treatment`, {
        summary,
        items: lines.map((line) => ({
          description: line.description,
          quantity: Number(line.quantity),
          unitPriceRupees: Number(line.unitPriceRupees),
        })),
      });
      onComplete(result.invoice);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not record treatment.");
    } finally {
      setBusy(false);
    }
  }

  const total = lines.reduce((sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unitPriceRupees) || 0), 0);

  return (
    <div className="modal-scrim">
      <section className="treatment-modal" role="dialog" aria-modal="true" aria-labelledby="treatment-title">
        <div className="ph">
          <div>
            <h2 id="treatment-title">Complete treatment and issue invoice</h2>
            <p>{appointment.patient.name} · {appointment.patient.mrn}</p>
          </div>
          <button type="button" className="btn ghost sm" onClick={onClose} aria-label="Close treatment form">Close</button>
        </div>
        {error && <div className="msg err" role="alert">{error}</div>}
        <form onSubmit={submit}>
          <label className="l" htmlFor="treatment-summary">Treatment summary</label>
          <textarea className="inp booking-reason" id="treatment-summary" value={summary} onChange={(event) => setSummary(event.target.value)} minLength={3} maxLength={2000} required />

          <div className="ph invoice-lines-heading"><h3>Charge lines</h3><button type="button" className="btn ghost sm" onClick={() => setLines((current) => [...current, { description: "", quantity: "1", unitPriceRupees: "" }])}>Add line</button></div>
          <div className="treatment-lines">
            {lines.map((line, index) => (
              <div className="treatment-line" key={index}>
                <label><span>Description</span><input className="inp" value={line.description} onChange={(event) => updateLine(index, "description", event.target.value)} minLength={2} maxLength={160} required /></label>
                <label><span>Qty</span><input className="inp" type="number" value={line.quantity} onChange={(event) => updateLine(index, "quantity", event.target.value)} min="1" max="1000" step="1" required /></label>
                <label><span>Unit price (INR)</span><input className="inp" type="number" value={line.unitPriceRupees} onChange={(event) => updateLine(index, "unitPriceRupees", event.target.value)} min="0" max="1000000" step="0.01" required /></label>
                <button type="button" className="btn ghost sm" onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))} disabled={lines.length === 1} aria-label={`Remove charge line ${index + 1}`}>Remove</button>
              </div>
            ))}
          </div>
          <p className="invoice-total">Subtotal and total <strong>{new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(total)}</strong></p>
          <p className="booking-hint">Invoice totals use the prices entered above. No tax is added.</p>
          <div className="acts">
            <button type="submit" className="btn" disabled={busy || lines.length === 0}>{busy ? "Issuing invoice…" : "Complete treatment and issue invoice"}</button>
            <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
          </div>
        </form>
      </section>
    </div>
  );
}