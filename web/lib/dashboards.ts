import type { StaffRole } from "./roles";

export type Tone = "ok" | "warn" | "bad" | "info";
export type Cell = string | { t: string; c: Tone };
const p = (t: string, c: Tone): Cell => ({ t, c });

export interface DashConfig {
  title: string;
  nav: string[];
  kpis: [label: string, value: string, delta: string, dir: "up" | "dn"][];
  table: { title: string; cols: string[]; rows: Cell[][] };
  side: { title: string; items: [string, string][] };
  actions: string[];
}

/* Static demo data. Replace each block with TanStack Query calls to the module APIs as they are built. */
export const DASHBOARDS: Record<StaffRole, DashConfig> = {
  ADMIN: {
    title: "Admin dashboard",
    nav: ["Overview", "User & role management", "Tenants & modules", "Reports", "Audit log", "CMS", "Settings"],
    kpis: [["Appointments today", "148", "+12% vs last week", "up"], ["Active staff", "42", "3 pending approval", "up"], ["Revenue today", "₹4.82 L", "+6%", "up"], ["Bed occupancy", "78%", "-2%", "dn"]],
    table: { title: "Recent audit log", cols: ["Time", "User", "Action", "Entity"], rows: [["10:42", "Anita Rao", "CREATE", "Appointment #A-2211"], ["10:39", "Dr. Arjun Nair", "READ", "Patient MA-100013"], ["10:31", "Kavya Menon", "UPDATE", "Investigation #L-5530"], ["10:18", "Suresh Kumar", "CREATE", "Invoice #INV-9081"], ["10:02", "Dr. Meera Iyer", "APPROVE", "Staff EMP-008"]] },
    side: { title: "System health", items: [["API p95", "1.4 s"], ["Uptime (30d)", "99.96%"], ["Failed logins (24h)", "7"], ["Queue backlog", "0 jobs"]] },
    actions: ["Add specialty", "Export report", "Manage roles"],
  },
  RECEPTION: {
    title: "Reception dashboard",
    nav: ["Today", "Register patient", "Appointments", "Queue & tokens", "OPD billing", "Bed availability"],
    kpis: [["Booked today", "96", "12 walk-ins", "up"], ["Checked in", "61", "Avg wait 14 min", "up"], ["Waiting now", "9", "Peak 11:00", "dn"], ["Collected today", "₹1.26 L", "OPD counter", "up"]],
    table: { title: "Today's appointments", cols: ["Token", "Patient", "Doctor", "Time", "Status"], rows: [["T-21", "Ravi Kulkarni", "Dr. Arjun Nair", "10:30", p("In consult", "info")], ["T-22", "Sunita Devi", "Dr. Sana Khan", "10:40", p("Checked in", "ok")], ["T-23", "Mohan Lal", "Dr. Vikram Rao", "10:45", p("Booked", "warn")], ["T-24", "Farah Ali", "Dr. Lakshmi P.", "11:00", p("Booked", "warn")], ["—", "Walk-in: J. Thomas", "Dr. Arjun Nair", "—", p("Queued", "info")]] },
    side: { title: "OPD queue", items: [["Cardiology", "5 waiting"], ["Neurology", "2 waiting"], ["ENT", "1 waiting"], ["Paediatrics", "1 waiting"]] },
    actions: ["Register patient", "Book appointment", "Add walk-in", "Collect payment"],
  },
  DOCTOR: {
    title: "Doctor dashboard",
    nav: ["My patients", "Consultation", "E-prescriptions", "Investigations", "IPD rounds", "Performance"],
    kpis: [["Patients today", "22", "8 seen", "up"], ["In queue", "5", "Next: T-21", "up"], ["Reports ready", "4", "1 critical", "dn"], ["Avg consult", "9 min", "-1 min", "up"]],
    table: { title: "My queue", cols: ["Token", "Patient", "Age/Sex", "Complaint", "Wait"], rows: [["T-21", "Ravi Kulkarni", "54 / M", "Chest tightness", p("Now", "info")], ["T-25", "Geeta Nair", "61 / F", "Follow-up: BP", "6 min"], ["T-27", "Imran Sheikh", "38 / M", "Palpitations", "12 min"], ["T-29", "Latha R.", "47 / F", "Breathlessness", "18 min"]] },
    side: { title: "Results awaiting review", items: [["Troponin I · MA-100013", "Critical"], ["Lipid profile · MA-100031", "Ready"], ["2D Echo · MA-100044", "Ready"], ["ECG · MA-100052", "Ready"]] },
    actions: ["Start consultation", "New e-prescription", "Order investigation"],
  },
  NURSE: {
    title: "Nurse dashboard",
    nav: ["Assigned patients", "Vitals entry", "Nursing notes", "IPD charts", "Medication (MAR)"],
    kpis: [["Vitals pending", "7", "OPD queue", "dn"], ["Ward patients", "14", "Ward B", "up"], ["Meds due (1h)", "9", "MAR", "dn"], ["Abnormal flags", "2", "Review", "dn"]],
    table: { title: "Vitals to record", cols: ["Token", "Patient", "Doctor", "Last vitals", "Action"], rows: [["T-22", "Sunita Devi", "Dr. Sana Khan", "—", "Record"], ["T-23", "Mohan Lal", "Dr. Vikram Rao", "—", "Record"], ["T-24", "Farah Ali", "Dr. Lakshmi P.", "—", "Record"], ["B-04", "Kiran Bhat (IPD)", "Dr. Arjun Nair", "06:00", p("Overdue", "bad")]] },
    side: { title: "Medication due", items: [["B-02 · Inj. Ceftriaxone", "11:00"], ["B-04 · Tab. Metoprolol", "11:00"], ["B-07 · Inj. Pantoprazole", "11:30"], ["B-09 · IV fluids", "12:00"]] },
    actions: ["Record vitals", "Add nursing note", "Mark medication given"],
  },
  PHARMACIST: {
    title: "Pharmacy dashboard",
    nav: ["Dispense queue", "Prescriptions", "Drug inventory", "Batches & expiry", "Schedule H register"],
    kpis: [["In dispense queue", "11", "2 urgent", "dn"], ["Dispensed today", "84", "+9%", "up"], ["Low stock items", "6", "Reorder", "dn"], ["Near expiry (60d)", "13", "FEFO", "dn"]],
    table: { title: "Prescription queue", cols: ["Rx", "Patient", "Doctor", "Items", "Status"], rows: [["RX-4401", "Ravi Kulkarni", "Dr. Arjun Nair", "4", p("Ready to dispense", "ok")], ["RX-4402", "Geeta Nair", "Dr. Arjun Nair", "2", p("Ready to dispense", "ok")], ["RX-4403", "Imran Sheikh", "Dr. Arjun Nair", "3", p("Allergy flag", "bad")], ["RX-4404", "Mohan Lal", "Dr. Vikram Rao", "2", p("Partial", "warn")]] },
    side: { title: "Stock alerts", items: [["Amoxicillin 500 mg", "42 left"], ["Metformin 500 mg", "60 left"], ["Insulin glargine", "Exp. 18 days"], ["ORS sachet", "Exp. 25 days"]] },
    actions: ["Dispense", "Flag to doctor", "Update stock"],
  },
  LAB_TECH: {
    title: "Laboratory dashboard",
    nav: ["Worklist", "Sample collection", "Upload reports", "Critical alerts", "Turnaround"],
    kpis: [["Pending orders", "27", "5 STAT", "dn"], ["Completed today", "93", "+7%", "up"], ["Avg turnaround", "48 min", "-5 min", "up"], ["Critical values", "1", "Notified", "dn"]],
    table: { title: "Department worklist", cols: ["Order", "Patient", "Test", "Priority", "Status"], rows: [["L-5531", "Ravi Kulkarni", "Troponin I", p("STAT", "bad"), "Sample received"], ["L-5532", "Geeta Nair", "HbA1c", p("Routine", "info"), "Awaiting sample"], ["L-5533", "Imran Sheikh", "CBC", p("Urgent", "warn"), "In analysis"], ["L-5534", "Latha R.", "Lipid profile", p("Routine", "info"), "Report upload"]] },
    side: { title: "Turnaround by test", items: [["CBC", "22 min"], ["Troponin I", "31 min"], ["Lipid profile", "1 h 40 min"], ["HbA1c", "2 h 05 min"]] },
    actions: ["Collect sample", "Upload report", "Verify result"],
  },
  ACCOUNTANT: {
    title: "Accounts dashboard",
    nav: ["Collections", "Invoices", "Payments", "Receivables", "Reconciliation", "GST reports"],
    kpis: [["Collections today", "₹4.82 L", "+6%", "up"], ["Outstanding", "₹12.4 L", "38 invoices", "dn"], ["Refunds today", "₹8,400", "3", "dn"], ["Online payments", "41%", "UPI leading", "up"]],
    table: { title: "Recent invoices", cols: ["Invoice", "Patient", "Type", "Total", "Status"], rows: [["INV-9081", "Ravi Kulkarni", "OPD", "₹1,200", p("Paid", "ok")], ["INV-9082", "Kiran Bhat", "IPD", "₹48,900", p("Part paid", "warn")], ["INV-9083", "Sunita Devi", "OPD", "₹800", p("Paid", "ok")], ["INV-9084", "Farah Ali", "Pharmacy", "₹2,350", p("Due", "bad")]] },
    side: { title: "Payment mode split", items: [["UPI", "₹1.98 L"], ["Card", "₹1.31 L"], ["Cash", "₹1.12 L"], ["Insurance / TPA", "₹0.41 L"]] },
    actions: ["Create invoice", "Record payment", "Export GST report"],
  },
};
