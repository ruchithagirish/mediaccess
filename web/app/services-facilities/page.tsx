import Link from "next/link";
import { PublicNav } from "@/components/PublicNav";

const facilities = [
  {
    title: "Diagnostic Imaging",
    text: "Modern radiology and screening services for fast, accurate evaluations and treatment planning.",
  },
  {
    title: "Outpatient Clinics",
    text: "Specialist-led consultation rooms designed for efficient, patient-centered assessments and follow-up. ",
  },
  {
    title: "Pharmacy & Dispensing",
    text: "On-site medication dispensing, counseling, and refill support to simplify treatment adherence.",
  },
  {
    title: "Emergency & Urgent Care",
    text: "Responsive clinical teams ready to handle sudden illness or urgent care needs with rapid triage.",
  },
];

export default function ServicesFacilitiesPage() {
  return (
    <>
      <PublicNav />
      <main className="wrap page-shell">
        <section className="page-hero">
          <span className="tag">Services & Facilities</span>
          <h1>Supportive clinical facilities built for safe, efficient care.</h1>
          <p>
            MediAccess combines diagnostic capability, specialist access, and patient services to make every visit more comfortable and effective.
          </p>
        </section>

        <section className="grid g2">
          {facilities.map((item) => (
            <article className="card" key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </section>

        <section className="info-panel compact">
          <div>
            <h2>Designed around patient comfort</h2>
            <p>
              From reception and diagnostics to pharmacy and treatment rooms, our facility is organized to reduce delays and improve experience.
            </p>
          </div>
          <ul className="check-list">
            <li>Comfortable waiting areas and guided navigation</li>
            <li>Digital check-in and streamlined workflows</li>
            <li>Coordinated support across departments</li>
          </ul>
        </section>

        <div className="cta-strip">
          <h3>Need to plan your visit?</h3>
          <Link className="btn" href="/portal/appointments">Explore appointments</Link>
        </div>
      </main>
    </>
  );
}
