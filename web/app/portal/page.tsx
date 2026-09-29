"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, downloadFile, getMe, patch, post, type SessionUser } from "@/lib/api";
import type { AppointmentSummary } from "@/lib/appointments";
import type { InvoiceSummary } from "@/lib/billing";

export default function Portal() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [appointments, setAppointments] = useState<AppointmentSummary[] | null>(null);
  const [appointmentError, setAppointmentError] = useState("");
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([]);
  const [invoiceError, setInvoiceError] = useState("");
  const [downloading, setDownloading] = useState<string | null>(null);
  const [reports, setReports] = useState<{ id: string; fileName: string; summary: string | null; isCritical: boolean; uploadedAt: string; investigationOrder: { test: { name: string; department: string }; orderedBy: { user: { name: string } } } }[]>([]);
  const [notifications, setNotifications] = useState<{ id: string; type: string; title: string; message: string; createdAt: string; readAt: string | null }[]>([]);
  const [reportError, setReportError] = useState("");
  useEffect(() => {
    let active = true;
    getMe()
      .then(async (currentUser) => {
        if (active) setUser(currentUser);
        const [appointmentResult, invoiceResult, reportResult, notificationResult] = await Promise.allSettled([
          api<{ appointments: AppointmentSummary[] }>("/appointments"),
          api<{ invoices: InvoiceSummary[] }>("/invoices"),
          api<{ reports: typeof reports }>("/clinical/patient/reports"),
          api<{ notifications: typeof notifications }>("/clinical/patient/notifications"),
        ]);
        if (!active) return;
        if (appointmentResult.status === "fulfilled") setAppointments(appointmentResult.value.appointments);
        else setAppointmentError(appointmentResult.reason instanceof Error ? appointmentResult.reason.message : "Could not load appointments.");
        if (invoiceResult.status === "fulfilled") setInvoices(invoiceResult.value.invoices);
        else setInvoiceError(invoiceResult.reason instanceof Error ? invoiceResult.reason.message : "Could not load invoices.");
        if (reportResult.status === "fulfilled") setReports(reportResult.value.reports);
        else setReportError(reportResult.reason instanceof Error ? reportResult.reason.message : "Could not load reports.");
        if (notificationResult.status === "fulfilled") setNotifications(notificationResult.value.notifications);
      })
      .catch(() => { if (active) router.replace("/login"); });
    return () => { active = false; };
  }, [router]);

  async function logout() { await post("/auth/logout").catch(() => {}); router.push("/"); }
  async function downloadInvoice(invoice: InvoiceSummary) {
    setDownloading(invoice.id);
    setInvoiceError("");
    try {
      await downloadFile(`/invoices/${invoice.id}/pdf`, `${invoice.invoiceNumber}.pdf`);
    } catch (error) {
      setInvoiceError(error instanceof Error ? error.message : "Could not download invoice.");
    } finally {
      setDownloading(null);
    }
  }
  async function downloadReport(reportId: string) {
    setReportError("");
    try {
      const result = await api<{ url: string }>(`/clinical/patient/reports/${reportId}/download-url`);
      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch (error) { setReportError(error instanceof Error ? error.message : "Could not open this report."); }
  }
  async function markNotificationRead(id: string) {
    await patch(`/clinical/patient/notifications/${id}/read`, {}).catch(() => {});
    setNotifications((current) => current.map((notification) => notification.id === id ? { ...notification, readAt: new Date().toISOString() } : notification));
  }
  if (!user) return <p style={{ padding: 32 }}>Loading…</p>;
  const nextAppointment = appointments?.find((appointment) => ["BOOKED", "CHECKED_IN", "IN_CONSULTATION"].includes(appointment.status));

  return (
    <div className="wrap">
      <div className="top">
        <Link className="logo" href="/"><i>+</i>MediAccess</Link>
        <h1 style={{ fontSize: 18 }}>Patient portal</h1>
        <button className="btn ghost sm" onClick={logout}>Log out</button>
      </div>
      <section className="sec">
        <h2>Hello, {user.name.split(" ")[0]}</h2>
        <div className="portal-actions">
          <Link className="btn" href="/portal/appointments">Book an appointment</Link>
          {appointmentError && <p className="msg err" role="alert">{appointmentError}</p>}
        </div>
        <div className="grid g3">
          <div className="card"><h3>UHID</h3><p>{user.mrn}</p></div>
          <div className="card"><h3>Next appointment</h3><p>{nextAppointment ? `${nextAppointment.date} · ${nextAppointment.startTime} · ${nextAppointment.doctor.name}` : appointments ? "None booked" : "Loading appointments…"}</p></div>
          <div className="card"><h3>Reports</h3><p>{reports.length ? `${reports.length} available` : reportError ? "Reports could not be loaded" : "No reports yet"}</p></div>
        </div>
        {notifications.length > 0 && <div className="card appointment-list"><h3>Clinical notifications</h3>{notifications.slice(0, 8).map((notification) => <button className={`portal-notification ${notification.readAt ? "read" : "unread"}`} key={notification.id} onClick={() => void markNotificationRead(notification.id)}><strong>{notification.title}</strong><span>{notification.message}</span><small>{new Date(notification.createdAt).toLocaleString()}</small></button>)}</div>}
        <div className="card invoice-list"><div className="ph"><h3>Investigation reports</h3></div>{reportError && <div className="msg err" role="alert">{reportError}</div>}{reports.length ? <div className="tw"><table><thead><tr><th>Investigation</th><th>Department</th><th>Ordering doctor</th><th>Date</th><th>Result</th><th></th></tr></thead><tbody>{reports.map((report) => <tr key={report.id}><td>{report.investigationOrder.test.name}<small className="table-sub">{report.fileName}</small></td><td>{report.investigationOrder.test.department}</td><td>{report.investigationOrder.orderedBy.user.name}</td><td>{new Date(report.uploadedAt).toLocaleDateString()}</td><td>{report.isCritical ? <span className="pill p-bad">Critical</span> : report.summary || "Ready"}</td><td><button className="btn ghost sm" onClick={() => void downloadReport(report.id)}>Open report</button></td></tr>)}</tbody></table></div> : <p>{reportError ? "Reports could not be loaded." : "No investigation reports yet."}</p>}</div>
        {appointments && appointments.length > 0 && (
          <div className="card appointment-list">
            <h3>Upcoming appointments</h3>
            <div className="tw">
              <table>
                <thead><tr><th>Date</th><th>Time</th><th>Doctor</th><th>Specialty</th><th>Status</th></tr></thead>
                <tbody>{appointments.map((appointment) => (
                  <tr key={appointment.id}>
                    <td>{appointment.date}</td><td>{appointment.startTime}</td><td>{appointment.doctor.name}</td>
                    <td>{appointment.doctor.specialties.map((specialty) => specialty.name).join(", ")}</td>
                    <td>{appointment.status.replaceAll("_", " ")}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        )}
        <div className="card invoice-list">
          <div className="ph"><h3>Treatment invoices</h3></div>
          {invoiceError && <div className="msg err" role="alert">{invoiceError}</div>}
          {invoices.length === 0 ? <p>{invoiceError ? "Invoices could not be loaded." : "No treatment invoices yet."}</p> : (
            <div className="tw">
              <table>
                <thead><tr><th>Invoice</th><th>Date</th><th>Service</th><th>Total</th><th>Paid</th><th>Balance</th><th></th></tr></thead>
                <tbody>{invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td>{invoice.invoiceNumber}<small className="table-sub">{invoice.status}</small></td>
                    <td>{invoice.appointment.date}</td>
                    <td>{invoice.treatment?.summary || "OPD services"}</td>
                    <td>{new Intl.NumberFormat("en-IN", { style: "currency", currency: invoice.currency }).format(invoice.totalPaise / 100)}</td>
                    <td>{new Intl.NumberFormat("en-IN", { style: "currency", currency: invoice.currency }).format(invoice.paidPaise / 100)}</td>
                    <td>{new Intl.NumberFormat("en-IN", { style: "currency", currency: invoice.currency }).format(invoice.outstandingPaise / 100)}</td>
                    <td><button className="btn ghost sm" onClick={() => downloadInvoice(invoice)} disabled={downloading === invoice.id}>{downloading === invoice.id ? "Preparing…" : "Download PDF"}</button></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
