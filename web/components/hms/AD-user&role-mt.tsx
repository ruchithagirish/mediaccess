"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnFiltersState,
  type SortingState,
} from "@tanstack/react-table";
import { api, patch, post } from "@/lib/api";
import { ROLES, roleLabel, type StaffRole } from "@/lib/roles";

type StaffStatus = "PENDING" | "ACTIVE" | "REJECTED" | "DISABLED";
type StaffMember = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  employeeId: string | null;
  roles: StaffRole[];
  status: StaffStatus;
  lastLoginAt: string | null;
  createdAt: string;
  doctorProfile: { registrationNumber: string | null; specialties: { specialty: { name: string } }[] } | null;
  activeSessions: number;
};
type AuditEntry = {
  id: string;
  userId: string | null;
  actor: string;
  action: string;
  entityType: string;
  entityId: string | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
};
type WorkspaceTab = "directory" | "roles" | "audit";

const column = createColumnHelper<StaffMember>();
const roleCatalog = [
  { id: "ADMIN", label: "Administrator", scope: "Tenant operations, staff access, billing and audit administration" },
  { id: "DOCTOR", label: "Doctor", scope: "Assigned patient care, encounters, prescriptions and investigation orders" },
  { id: "NURSE", label: "Nurse", scope: "Vitals, nursing notes and medication administration" },
  { id: "RECEPTION", label: "Reception", scope: "Patient registration, appointments, queue and OPD billing" },
  { id: "LAB_TECH", label: "Lab technician", scope: "Investigation worklists, sample handling and diagnostic reports" },
  { id: "PHARMACIST", label: "Pharmacist", scope: "Prescription dispensing and pharmacy inventory" },
  { id: "ACCOUNTANT", label: "Accountant", scope: "Invoices, collections, receivables and reconciliation" },
  { id: "PATIENT", label: "Patient", scope: "Personal and permitted family records in the patient portal" },
];
const formatDate = (value: string | null) => value
  ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
  : "Never";
const statusLabel = (status: StaffStatus) => ({ ACTIVE: "Active", PENDING: "Pending", DISABLED: "Suspended", REJECTED: "Rejected" })[status];

export function AdminUserManagement({ currentUserId }: { currentUserId: string }) {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [auditUserId, setAuditUserId] = useState("");
  const [tab, setTab] = useState<WorkspaceTab>("directory");
  const [globalFilter, setGlobalFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [sorting, setSorting] = useState<SortingState>([{ id: "name", desc: false }]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editingRoles, setEditingRoles] = useState<StaffMember | null>(null);
  const [roleDraft, setRoleDraft] = useState<StaffRole[]>([]);

  async function loadData() {
    setError("");
    try {
      const [staffResult, auditResult] = await Promise.all([
        api<{ staff: StaffMember[] }>("/admin/staff"),
        api<{ logs: AuditEntry[] }>(`/admin/audit?limit=50${auditUserId ? `&userId=${encodeURIComponent(auditUserId)}` : ""}`),
      ]);
      setStaff(staffResult.staff);
      setAudit(auditResult.logs);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load user management data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
    const timer = window.setInterval(() => void loadData(), 60_000);
    return () => window.clearInterval(timer);
  }, [auditUserId]);

  function setFilter(id: string, value: string) {
    setColumnFilters((current) => {
      const next = current.filter((filter) => filter.id !== id);
      return value === "all" ? next : [...next, { id, value }];
    });
  }

  async function runAction(member: StaffMember, action: "approve" | "reject" | "disable" | "revoke-sessions") {
    const prompts = {
      approve: `Approve staff access for ${member.name}?`,
      reject: `Reject the staff access request for ${member.name}?`,
      disable: `Suspend ${member.name}'s account and revoke their sessions?`,
      "revoke-sessions": `Force ${member.name} to sign in again on all devices?`,
    };
    if (!window.confirm(prompts[action])) return;
    setBusyId(member.id);
    setError("");
    setNotice("");
    try {
      await post(`/admin/staff/${member.id}/${action}`, {});
      setNotice(action === "revoke-sessions" ? `Sessions revoked for ${member.name}.` : `${member.name}: ${action === "disable" ? "account suspended" : action} complete.`);
      await loadData();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not complete that account action.");
    } finally {
      setBusyId("");
    }
  }

  function openRoleEditor(member: StaffMember) {
    setEditingRoles(member);
    setRoleDraft(member.roles);
  }

  async function saveRoles(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingRoles || !roleDraft.length) return;
    setBusyId(editingRoles.id);
    setError("");
    try {
      await patch(`/admin/staff/${editingRoles.id}/roles`, { roles: roleDraft });
      setNotice(`Roles updated for ${editingRoles.name}; their existing sessions were revoked.`);
      setEditingRoles(null);
      await loadData();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update staff roles.");
    } finally {
      setBusyId("");
    }
  }

  const columns = useMemo(() => [
    column.accessor("name", {
      header: "Staff member",
      cell: ({ row }) => <div className="user-cell"><strong>{row.original.name}</strong><small>{row.original.email} · {row.original.phone || "No phone"} · {row.original.employeeId || "No employee ID"}</small></div>,
    }),
    column.accessor((member) => member.roles.join(" "), {
      id: "role",
      header: "Role",
      filterFn: (row, _id, value: string) => value === "all" || row.original.roles.includes(value as StaffRole),
      cell: ({ row }) => <div className="user-role-tags">{row.original.roles.map((role) => <span className="user-role-tag" key={role}>{roleLabel(role)}</span>)}</div>,
    }),
    column.accessor((member) => member.doctorProfile?.specialties.map(({ specialty }) => specialty.name).join(", ") || "—", {
      id: "department",
      header: "Department / specialty",
      cell: ({ getValue }) => getValue(),
    }),
    column.accessor((member) => member.doctorProfile?.registrationNumber || "—", {
      id: "registration",
      header: "Registration no.",
    }),
    column.accessor("status", {
      header: "Account",
      filterFn: (row, _id, value: string) => value === "all" || row.original.status === value,
      cell: ({ getValue }) => <span className={`user-status status-${getValue().toLowerCase()}`}>{statusLabel(getValue())}</span>,
    }),
    column.accessor("lastLoginAt", {
      header: "Last login",
      cell: ({ getValue }) => formatDate(getValue()),
    }),
    column.accessor("activeSessions", { header: "Sessions" }),
    column.display({
      id: "actions",
      header: "Actions",
      enableSorting: false,
      cell: ({ row }) => {
        const member = row.original;
        const isBusy = busyId === member.id;
        return <div className="user-row-actions">
          {member.id !== currentUserId && <button type="button" className="text-action" onClick={() => openRoleEditor(member)} disabled={isBusy}>Edit roles</button>}
          {member.status === "PENDING" && <>
            <button type="button" className="text-action" onClick={() => void runAction(member, "approve")} disabled={isBusy}>Approve</button>
            <button type="button" className="text-action danger-text" onClick={() => void runAction(member, "reject")} disabled={isBusy}>Reject</button>
          </>}
          {member.status === "ACTIVE" && member.id !== currentUserId && <>
            <button type="button" className="text-action" onClick={() => void runAction(member, "revoke-sessions")} disabled={isBusy || member.activeSessions === 0}>Force logout</button>
            <button type="button" className="text-action danger-text" onClick={() => void runAction(member, "disable")} disabled={isBusy}>Suspend</button>
          </>}
          <button type="button" className="text-action" onClick={() => { setAuditUserId(member.id); setTab("audit"); }} disabled={isBusy}>Audit</button>
        </div>;
      },
    }),
  ], [busyId, currentUserId]);

  const table = useReactTable({
    data: staff,
    columns,
    state: { globalFilter, columnFilters, sorting },
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 10 } },
  });

  const activeCount = staff.filter((member) => member.status === "ACTIVE").length;
  const pendingCount = staff.filter((member) => member.status === "PENDING").length;
  const suspendedCount = staff.filter((member) => member.status === "DISABLED").length;
  const sessionCount = staff.reduce((sum, member) => sum + member.activeSessions, 0);
  const selectedAuditUser = staff.find((member) => member.id === auditUserId);

  return (
    <div className="user-management">
      <header className="user-management-header">
        <div><span className="admin-eyebrow">ACCESS GOVERNANCE</span><p>Hospital staff accounts, roles, sessions and audit activity.</p></div>
        <div className="user-header-actions"><Link className="btn sm" href="/staff/register">Open staff registration</Link><button className="btn ghost sm" type="button" onClick={() => void loadData()} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button></div>
      </header>

      {error && <div className="msg err" role="alert">{error}</div>}
      {notice && <div className="msg ok" role="status">{notice}</div>}

      <section className="user-metrics" aria-label="Staff account summary">
        <div><span>Staff accounts</span><strong>{loading ? "…" : staff.length}</strong></div>
        <div><span>Active</span><strong>{loading ? "…" : activeCount}</strong></div>
        <div><span>Pending review</span><strong>{loading ? "…" : pendingCount}</strong></div>
        <div><span>Suspended</span><strong>{loading ? "…" : suspendedCount}</strong></div>
        <div><span>Active sessions</span><strong>{loading ? "…" : sessionCount}</strong></div>
      </section>

      <nav className="user-tabs" aria-label="User management sections">
        {([["directory", "Staff directory"], ["roles", "Roles & access"], ["audit", "Audit trail"]] as [WorkspaceTab, string][]).map(([key, label]) => <button type="button" key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>{label}</button>)}
      </nav>

      {tab === "directory" && <section className="user-panel">
        <div className="user-panel-heading"><div><span className="admin-section-label">TENANT STAFF</span><h2>Staff directory</h2></div><span className="user-result-count">{table.getFilteredRowModel().rows.length} records</span></div>
        <div className="user-filters">
          <label className="user-search"><span className="sr-only">Search staff</span><input className="inp" value={globalFilter ?? ""} onChange={(event) => setGlobalFilter(event.target.value)} placeholder="Search name, email, role or specialty" /></label>
          <label><span>Role</span><select className="inp" value={roleFilter} onChange={(event) => { setRoleFilter(event.target.value); setFilter("role", event.target.value); }}><option value="all">All roles</option>{ROLES.map((role) => <option key={role.id} value={role.id}>{role.label}</option>)}</select></label>
          <label><span>Account status</span><select className="inp" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setFilter("status", event.target.value); }}><option value="all">All statuses</option><option value="ACTIVE">Active</option><option value="PENDING">Pending</option><option value="DISABLED">Suspended</option><option value="REJECTED">Rejected</option></select></label>
        </div>
        <div className="tw user-table-wrap"><table className="user-table"><thead>{table.getHeaderGroups().map((group) => <tr key={group.id}>{group.headers.map((header) => <th key={header.id} aria-sort={header.column.getIsSorted() === "asc" ? "ascending" : header.column.getIsSorted() === "desc" ? "descending" : "none"}>
          {header.isPlaceholder ? null : header.column.getCanSort() ? <button type="button" className="user-sort" onClick={header.column.getToggleSortingHandler()}>{flexRender(header.column.columnDef.header, header.getContext())}<span aria-hidden="true">{header.column.getIsSorted() === "asc" ? "↑" : header.column.getIsSorted() === "desc" ? "↓" : "↕"}</span></button> : flexRender(header.column.columnDef.header, header.getContext())}
        </th>)}</tr>)}</thead><tbody>
          {table.getRowModel().rows.map((row) => <tr key={row.id}>{row.getVisibleCells().map((cell) => <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}
          {!loading && table.getRowModel().rows.length === 0 && <tr><td className="user-empty-row" colSpan={columns.length}>{staff.length ? "No staff match these filters." : "No staff accounts found."}</td></tr>}
          {loading && <tr><td className="user-empty-row" colSpan={columns.length}>Loading staff directory…</td></tr>}
        </tbody></table></div>
        <div className="user-pagination"><span>Page {table.getState().pagination.pageIndex + 1} of {Math.max(1, table.getPageCount())}</span><div><button className="btn ghost sm" type="button" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>Previous</button><button className="btn ghost sm" type="button" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>Next</button></div></div>
        <div className="user-capability-note">Invitation provisioning, credential resets and MFA enrollment are not configured. Staff can request access through registration, then be approved here.</div>
      </section>}

      {tab === "roles" && <section className="user-panel">
        <div className="user-panel-heading"><div><span className="admin-section-label">ROLE CATALOG</span><h2>Role responsibilities</h2></div></div>
        <div className="user-role-catalog">{roleCatalog.map((role) => <article key={role.id}><div><strong>{role.label}</strong><span>{role.id}</span></div><p>{role.scope}</p></article>)}</div>
        <div className="user-security-note"><strong>Server-enforced access</strong><p>Admin endpoints verify the current ADMIN role on the server. Role changes revoke existing sessions. Granular MODULE:ACTION:SCOPE overrides are not implemented in this workspace; role responsibilities above are informational.</p></div>
      </section>}

      {tab === "audit" && <section className="user-panel">
        <div className="user-panel-heading"><div><span className="admin-section-label">AUDIT ACTIVITY</span><h2>{selectedAuditUser ? `Activity · ${selectedAuditUser.name}` : "Recent audit trail"}</h2></div><label className="user-audit-filter"><span>Staff member</span><select className="inp" value={auditUserId} onChange={(event) => setAuditUserId(event.target.value)}><option value="">All staff</option>{staff.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label></div>
        <div className="tw user-table-wrap"><table className="user-audit-table"><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Record</th><th>IP address</th><th>Device / client</th></tr></thead><tbody>
          {audit.map((entry) => <tr key={entry.id}><td>{formatDate(entry.createdAt)}</td><td>{entry.actor}</td><td>{entry.action.replaceAll("_", " ")}</td><td>{entry.entityType}{entry.entityId ? ` · ${entry.entityId}` : ""}</td><td>{entry.ip || "—"}</td><td title={entry.userAgent || undefined}>{entry.userAgent || "—"}</td></tr>)}
          {!audit.length && <tr><td className="user-empty-row" colSpan={6}>{loading ? "Loading audit trail…" : "No audit events found."}</td></tr>}
        </tbody></table></div>
        <div className="user-security-note user-security-warning"><strong>Break-glass monitoring</strong><p>This workspace does not currently record or expose break-glass access events. Audit coverage depends on each workflow emitting an audit record.</p></div>
      </section>}

      {editingRoles && <div className="modal-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditingRoles(null); }}><section className="treatment-modal user-role-modal" role="dialog" aria-modal="true" aria-labelledby="edit-roles-title">
        <div className="ph"><div><h2 id="edit-roles-title">Edit staff roles</h2><p>{editingRoles.name} · {editingRoles.email}</p></div><button className="btn ghost sm" type="button" onClick={() => setEditingRoles(null)}>Close</button></div>
        <form onSubmit={saveRoles}><fieldset className="user-role-options"><legend>Assigned roles</legend>{ROLES.map((role) => <label key={role.id}><input type="checkbox" checked={roleDraft.includes(role.id)} onChange={(event) => setRoleDraft((current) => event.target.checked ? [...current, role.id] : current.filter((item) => item !== role.id))} /><span><strong>{role.label}</strong><small>{role.desc}</small></span></label>)}</fieldset>
          {!roleDraft.length && <p className="msg err">At least one staff role is required.</p>}
          <p className="user-capability-note">Changing roles forces this staff member to sign in again on all devices.</p>
          <div className="acts"><button className="btn" disabled={busyId === editingRoles.id || !roleDraft.length}>{busyId === editingRoles.id ? "Saving…" : "Save roles"}</button><button className="btn ghost" type="button" onClick={() => setEditingRoles(null)}>Cancel</button></div>
        </form>
      </section></div>}
    </div>
  );
}