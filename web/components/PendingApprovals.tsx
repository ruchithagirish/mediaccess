"use client";
import { useCallback, useEffect, useState } from "react";
import { api, post } from "@/lib/api";
import { roleLabel } from "@/lib/roles";

interface Staff { id: string; name: string; email: string; employeeId: string | null; roles: string[] }

/** Admin-only panel. The API enforces ADMIN server-side; this is just the UI. */
export function PendingApprovals() {
  const [staff, setStaff] = useState<Staff[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api<{ staff: Staff[] }>("/admin/staff?status=PENDING").then((d) => setStaff(d.staff)).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  async function act(id: string, action: "approve" | "reject") {
    setError("");
    try { await post(`/admin/staff/${id}/${action}`, {}); load(); } catch (e) { setError((e as Error).message); }
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="ph"><h3>Pending staff approvals ({staff?.length ?? "…"})</h3></div>
      {error && <div className="msg err">{error}</div>}
      {staff && staff.length === 0 && <p style={{ color: "var(--muted)", margin: 0 }}>No pending requests.</p>}
      {staff && staff.length > 0 && (
        <div className="tw">
          <table>
            <thead><tr><th>Name</th><th>Emp ID</th><th>Email</th><th>Requested roles</th><th></th></tr></thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td><td>{s.employeeId}</td><td>{s.email}</td>
                  <td>{s.roles.map((r) => <span className="chip" style={{ marginRight: 4 }} key={r}>{roleLabel(r)}</span>)}</td>
                  <td>
                    <button className="btn sm" onClick={() => act(s.id, "approve")}>Approve</button>{" "}
                    <button className="btn sm danger" onClick={() => act(s.id, "reject")}>Reject</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
