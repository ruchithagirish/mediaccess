import Link from "next/link";
import { PublicNav } from "@/components/PublicNav";

const doctors = [
  {
    name: "Dr. Aisha Patel",
    specialty: "Cardiology",
    experience: "14 years",
    focus: "Preventive heart care and hypertension management",
  },
  {
    name: "Dr. Daniel Okafor",
    specialty: "Neurology",
    experience: "12 years",
    focus: "Migraine care, neurological diagnostics, and follow-up rehab",
  },
  {
    name: "Dr. Chloe Martins",
    specialty: "Pediatrics",
    experience: "9 years",
    focus: "Child wellness, developmental checks, and vaccination support",
  },
  {
    name: "Dr. Liam Chen",
    specialty: "Orthopedics",
    experience: "11 years",
    focus: "Joint pain, sports injuries, and post-operative rehabilitation",
  },
  {
    name: "Dr. Sofia Hassan",
    specialty: "Dermatology",
    experience: "8 years",
    focus: "Skin conditions, acne management, and chronic dermatology plans",
  },
  {
    name: "Dr. Martin Nwosu",
    specialty: "Family Medicine",
    experience: "16 years",
    focus: "Primary care, preventive screenings, and long-term health planning",
  },
];

export default function DoctorsPage() {
  return (
    <>
      <PublicNav />
      <main className="wrap page-shell">
        <section className="page-hero">
          <span className="tag">Doctors</span>
          <h1>Meet the clinicians guiding your care journey.</h1>
          <p>
            Our physicians combine clinical excellence with clear communication, collaborative planning, and patient-centered treatment.
          </p>
        </section>

        <section className="grid g3 doctor-grid">
          {doctors.map((doctor) => (
            <article className="card doctor-card" key={doctor.name}>
              <div className="av large">{doctor.name.split(" ").at(-1)?.[0] ?? "D"}</div>
              <h3>{doctor.name}</h3>
              <p className="doctor-specialty">{doctor.specialty}</p>
              <p>{doctor.focus}</p>
              <div className="doctor-meta">
                <span>{doctor.experience} experience</span>
                <span>Appointments available</span>
              </div>
            </article>
          ))}
        </section>

        <section className="info-panel compact">
          <div>
            <h2>What you can expect</h2>
            <p>
              Each consultation is designed to be respectful, efficient, and well informed by your medical history and care goals.
            </p>
          </div>
          <ul className="check-list">
            <li>Evidence-based consultation plans</li>
            <li>Clear follow-up recommendations</li>
            <li>Secure digital access to reports and prescriptions</li>
          </ul>
        </section>

        <div className="cta-strip">
          <h3>Find the right doctor for your next visit.</h3>
          <Link className="btn" href="/portal/appointments">Book appointment</Link>
        </div>
      </main>
    </>
  );
}
