import Link from "next/link";
import { PublicNav } from "@/components/PublicNav";

const specialties = [
  {
    name: "Cardiology",
    description: "Heart health checks, ECG monitoring, and long-term preventive management with experienced specialists.",
    stat: "24/7 support",
  },
  {
    name: "Neurology",
    description: "Diagnosis and treatment for headaches, seizures, stroke recovery, and disorders of the nervous system.",
    stat: "Advanced diagnostics",
  },
  {
    name: "Pediatrics",
    description: "Compassionate care for infants, children, and adolescents with preventive and specialist services.",
    stat: "Family-first care",
  },
  {
    name: "Orthopedics",
    description: "Joint, bone, and sports injury care with surgical and non-surgical treatment pathways.",
    stat: "Mobility restoration",
  },
  {
    name: "Dermatology",
    description: "Skin, hair, and nail consultations for both routine concerns and complex chronic conditions.",
    stat: "Skin health plans",
  },
  {
    name: "Family Medicine",
    description: "Comprehensive primary care, wellness checks, and coordinated chronic disease management.",
    stat: "Whole-person care",
  },
];

export default function SpecialtiesPage() {
  return (
    <>
      <PublicNav />
      <main className="wrap page-shell">
        <section className="page-hero">
          <span className="tag">Specialties</span>
          <h1>Care pathways designed around your health goals.</h1>
          <p>
            MediAccess brings together multidisciplinary expertise so patients can access the right care, at the right time,
            from trusted specialists.
          </p>
        </section>

        <section className="stats-row">
          <div className="stat-box">
            <strong>12+</strong>
            <span>Clinical specialties</span>
          </div>
          <div className="stat-box">
            <strong>98%</strong>
            <span>Patient satisfaction</span>
          </div>
          <div className="stat-box">
            <strong>Same week</strong>
            <span>Consultation availability</span>
          </div>
        </section>

        <section className="sec">
          <div className="grid g3">
            {specialties.map((specialty) => (
              <article className="card feature-card" key={specialty.name}>
                <div className="feature-badge">{specialty.stat}</div>
                <h3>{specialty.name}</h3>
                <p>{specialty.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="info-panel">
          <div>
            <h2>Why patients choose MediAccess</h2>
            <p>
              We focus on fast triage, transparent treatment planning, and seamless communication between specialists,
              nurses, and your primary physician.
            </p>
          </div>
          <div className="mini-list">
            <div><strong>Fast booking</strong><span>Choose a preferred specialist and time slot.</span></div>
            <div><strong>Digital records</strong><span>See referrals, prescriptions, and reports in one place.</span></div>
            <div><strong>Coordinated care</strong><span>Move between departments without repeating your story.</span></div>
          </div>
        </section>

        <div className="cta-strip">
          <h3>Ready to schedule a consultation?</h3>
          <Link className="btn" href="/register">Book an appointment</Link>
        </div>
      </main>
    </>
  );
}
