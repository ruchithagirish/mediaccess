"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { PendingApprovals } from "./PendingApprovals";

type OverviewData = {
  date: string;
  refreshedAt: string;
  metrics: {
    activePatients: number;
    activeProviders: number;
    appointmentsToday: number;
    completedAppointments: number;
    cancelledAppointments: number;
    pendingApprovals: number;
    pendingStaff: number;
    pendingDiscounts: number;
  };
  patientGrowth: { date: string; count: number }[];
  appointmentVolume: { period: string; count: number }[];
  specialtyBreakdown: { name: string; count: number }[];
  activity: { id: string; actor: string; action: string; entity: string; entityId: string | null; createdAt: string }[];
  systemHealth: { api: string; database: string };
};

const numberFormat = new Intl.NumberFormat("en-IN");
const dayLabel = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const timeLabel = (date: string) => new Date(date).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

export function AdminOverview() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadOverview() {
    setError("");
    try {
      setData(await api<OverviewData>("/admin/overview"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load the operations overview.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadOverview();
    const timer = window.setInterval(() => void loadOverview(), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const metrics = data?.metrics;
  const growthPoints = data?.patientGrowth ?? [];
  const maxGrowth = Math.max(1, ...growthPoints.map((point) => point.count));
  const chartPoints = growthPoints.map((point, index) => `${12 + index * 66},${112 - (point.count / maxGrowth) * 88}`).join(" ");
  const maxAppointments = Math.max(1, ...(data?.appointmentVolume.map((item) => item.count) ?? []));
  const maxSpecialty = Math.max(1, ...(data?.specialtyBreakdown.map((item) => item.count) ?? []));

  return (
    <div className="admin-overview">
      <div className="admin-overview-heading">
        <div><span className="admin-eyebrow">OPERATIONS CENTER</span><p>{data ? `Today · ${dayLabel(data.date)}` : "Today · Clinic operations"}</p></div>
        <div className="admin-refresh"><span>{data ? `Updated ${timeLabel(data.refreshedAt)}` : "Live operational data"}</span><button className="btn ghost sm" onClick={() => void loadOverview()} disabled={loading}>{loading ? "Updating…" : "Refresh"}</button></div>
      </div>

      {error && <div className="msg err" role="alert">{error}</div>}

      <section className="admin-metrics" aria-label="Operational metrics">
        <article className="admin-metric"><span>Active patients</span><strong>{metrics ? numberFormat.format(metrics.activePatients) : loading ? "…" : "—"}</strong><small>Registered patient records</small></article>
        <article className="admin-metric"><span>Active providers</span><strong>{metrics ? numberFormat.format(metrics.activeProviders) : loading ? "…" : "—"}</strong><small>Verified doctors</small></article>
        <article className="admin-metric"><span>Appointments today</span><strong>{metrics ? numberFormat.format(metrics.appointmentsToday) : loading ? "…" : "—"}</strong><small>{metrics ? `${metrics.completedAppointments} completed · ${metrics.cancelledAppointments} cancelled` : "Daily schedule"}</small></article>
        <article className={`admin-metric${metrics?.pendingApprovals ? " needs-attention" : ""}`}><span>Pending approvals</span><strong>{metrics ? numberFormat.format(metrics.pendingApprovals) : loading ? "…" : "—"}</strong><small>{metrics ? `${metrics.pendingStaff} staff · ${metrics.pendingDiscounts} discounts` : "Staff and billing review"}</small></article>
      </section>

      <section className="admin-actions" aria-label="Quick actions">
        <span className="admin-section-label">QUICK ACTIONS</span>
        <Link href="/staff/register">Register staff/provider <span aria-hidden="true">↗</span></Link>
        <Link href="#admin-approvals">Review approvals <span aria-hidden="true">↗</span></Link>
        <Link href="/hms/dashboard/admin/patients">Patient records <span aria-hidden="true">↗</span></Link>
        <Link href="/hms/dashboard/admin/billing">Billing & receivables <span aria-hidden="true">↗</span></Link>
      </section>

      <div className="admin-analytics">
        <section className="admin-panel admin-growth">
          <div className="admin-panel-heading"><div><span className="admin-section-label">PATIENT ACQUISITION</span><h2>New patient registrations</h2></div><span className="admin-period">Last 7 days</span></div>
          {growthPoints.length > 0 ? <>
            <svg className="admin-line-chart" viewBox="0 0 420 138" role="img" aria-label="New patient registrations over the last seven days">
              <line x1="8" y1="112" x2="410" y2="112" />
              <line x1="8" y1="68" x2="410" y2="68" />
              <line x1="8" y1="24" x2="410" y2="24" />
              <polyline points={chartPoints} />
              {growthPoints.map((point, index) => <circle key={point.date} cx={12 + index * 66} cy={112 - (point.count / maxGrowth) * 88} r="3.5" />)}
            </svg>
            <div className="admin-chart-labels">{growthPoints.map((point) => <span key={point.date}><b>{numberFormat.format(point.count)}</b>{dayLabel(point.date)}</span>)}</div>
          </> : <p className="admin-empty">Registration trend is unavailable.</p>}
        </section>

        <section className="admin-panel admin-volume">
          <div className="admin-panel-heading"><div><span className="admin-section-label">TODAY</span><h2>Appointment volume</h2></div></div>
          <div className="admin-volume-chart">
            {(data?.appointmentVolume ?? []).map((item) => <div className="admin-volume-column" key={item.period}>
              <strong>{numberFormat.format(item.count)}</strong><div className="admin-volume-track"><i style={{ height: `${Math.max(item.count ? 8 : 0, (item.count / maxAppointments) * 100)}%` }} /></div><span>{item.period}</span>
            </div>)}
          </div>
          {!data && loading && <p className="admin-empty">Loading appointment distribution…</p>}
        </section>

        <section className="admin-panel admin-specialties">
          <div className="admin-panel-heading"><div><span className="admin-section-label">CARE AREAS</span><h2>Appointments by specialty</h2></div></div>
          {data?.specialtyBreakdown.length ? <div className="admin-specialty-list">{data.specialtyBreakdown.map((item) => <div className="admin-specialty-row" key={item.name}>
            <div><span>{item.name}</span><strong>{numberFormat.format(item.count)}</strong></div><i><b style={{ width: `${(item.count / maxSpecialty) * 100}%` }} /></i>
          </div>)}</div> : <p className="admin-empty">No appointments by specialty today.</p>}
        </section>

        <section className="admin-panel admin-health">
          <div className="admin-panel-heading"><div><span className="admin-section-label">PLATFORM</span><h2>System health</h2></div><span className="admin-health-live">LIVE</span></div>
          <div className="admin-health-row"><span><i />API service</span><strong>{data?.systemHealth.api === "operational" ? "Operational" : loading ? "Checking" : "Unavailable"}</strong></div>
          <div className="admin-health-row"><span><i />Database</span><strong>{data?.systemHealth.database === "operational" ? "Operational" : loading ? "Checking" : "Unavailable"}</strong></div>
          <div className="admin-health-note">Status verified when this overview was last refreshed.</div>
        </section>
      </div>

      <div className="admin-lower-grid">
        <section className="admin-panel admin-activity">
          <div className="admin-panel-heading"><div><span className="admin-section-label">SECURITY & OPERATIONS</span><h2>Recent activity</h2></div></div>
          {data?.activity.length ? <div className="admin-activity-list">{data.activity.map((item) => <article key={item.id}>
            <span className="admin-activity-mark" aria-hidden="true" />
            <div><strong>{item.action.replaceAll("_", " ")}</strong><span>{item.actor} · {item.entity}{item.entityId ? ` ${item.entityId}` : ""}</span></div>
            <time dateTime={item.createdAt}>{timeLabel(item.createdAt)}</time>
          </article>)}</div> : <p className="admin-empty">{loading ? "Loading audit activity…" : "No recent audit activity."}</p>}
        </section>

        <section className="admin-panel admin-notifications">
          <div className="admin-panel-heading"><div><span className="admin-section-label">REQUIRES ATTENTION</span><h2>Notifications</h2></div></div>
          {metrics?.pendingStaff ? <Link href="#admin-approvals" className="admin-notification-item"><span className="admin-notification-icon">!</span><span><strong>Staff access requests</strong><small>{metrics.pendingStaff} pending review</small></span><b aria-hidden="true">›</b></Link> : null}
          {metrics?.pendingDiscounts ? <Link href="/hms/dashboard/admin/billing" className="admin-notification-item"><span className="admin-notification-icon">!</span><span><strong>Discount approvals</strong><small>{metrics.pendingDiscounts} pending billing review</small></span><b aria-hidden="true">›</b></Link> : null}
          {!metrics?.pendingStaff && !metrics?.pendingDiscounts && <p className="admin-empty">No urgent approvals right now.</p>}
          <div className="admin-announcement-note">Announcements and broadcast controls are not configured for this workspace.</div>
        </section>
      </div>

      <div id="admin-approvals" className="admin-approval-anchor"><PendingApprovals /></div>
    </div>
  );
}