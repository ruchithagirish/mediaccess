import Link from "next/link";

export function AuthSide({ staff }: { staff?: boolean }) {
  const points = staff
    ? ["Role-based dashboards", "Admin-approved accounts", "Full audit trail"]
    : ["Book in under a minute", "Reports and bills in one place", "Reminders by SMS and WhatsApp"];
  return (
    <div className={`authside ${staff ? "staff" : ""}`}>
      <Link className="logo" href="/"><i>+</i>MediAccess</Link>
      <h2>{staff ? "Hospital Management System" : "Your health, in your hands."}</h2>
      <p>{staff
        ? "Secure staff console for every department. Access is role-based and every action is audit-logged."
        : "Book appointments, see prescriptions and reports, and manage your family's records securely."}</p>
      <ul>{points.map((p) => <li key={p}>{p}</li>)}</ul>
    </div>
  );
}
