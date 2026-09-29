import Link from "next/link";
import { PublicNav } from "@/components/PublicNav";

const specialties = [
  {
    name: "Cardiology",
    description: "Preventive heart care, diagnostic imaging, blood pressure management, and recovery planning.",
    badge: "Heart health",
  },
  {
    name: "Neurology",
    description: "Assessment for headaches, movement disorders, seizures, and neurological follow-up care.",
    badge: "Brain & nerves",
  },
  {
    name: "Pediatrics",
    description: "Family-centered care for infants, children, and adolescents throughout all stages of growth.",
    badge: "Child wellness",
  },
  {
    name: "Orthopedics",
    description: "Diagnosis and treatment for joint pain, fractures, sports injuries, and mobility recovery.",
    badge: "Movement care",
  },
  {
    name: "Dermatology",
    description: "Skin, hair, and nail evaluation with personalized treatment plans and preventive support.",
    badge: "Skin health",
  },
  {
    name: "Family Medicine",
    description: "Primary care coordination for checkups, screenings, chronic condition support, and wellness planning.",
    badge: "Whole-person care",
  },
];

export default function SpecialitiesPage() {
  return (
    <>
      <PublicNav />
      <main className="wrap page-shell">
        <section className="page-hero">
          <span className="tag">Specialities</span>
          <h1>Comprehensive clinical expertise under one healthcare network.</h1>
          <p>
            We bring together specialists and multidisciplinary teams to deliver care that is timely, collaborative, and tailored to each patient.
          </p>
        </section>

        <section className="stats-row">
          <div className="stat-box">
            <strong>12+</strong>
            <span>Clinical specialties</span>
          </div>
          <div className="stat-box">
            <strong>24/7</strong>
            <span>Guidance & support</span>
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
                <div className="feature-badge">{specialty.badge}</div>
                <h3>{specialty.name}</h3>
                <p>{specialty.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="info-panel">
          <div>
            <h2>Care pathways designed around patient needs</h2>
            <p>
              Each specialty is connected to diagnostic support, nursing care, and follow-up planning to help patients receive seamless treatment.
            </p>
          </div>
          <div className="mini-list">
            <div><strong>Fast referral</strong><span>Efficient coordination between departments and clinics.</span></div>
            <div><strong>Clear planning</strong><span>Personalized care pathways and transparent treatment goals.</span></div>
            <div><strong>Holistic support</strong><span>Medical, lifestyle, and long-term care recommendations.</span></div>
          </div>
        </section>

        <div className="cta-strip">
          <h3>Need help choosing the right specialty?</h3>
          <Link className="btn" href="/register">Get started</Link>
        </div>
      </main>
    </>
  );
}
