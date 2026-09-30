import Link from "next/link";
import { PublicNav } from "@/components/public/PublicNav";

const doctors = [
  {
    name: "Dr. Aisha Patel",
    specialty: "Cardiology",
    focus: "Preventive heart care, risk assessment, and long-term rhythm management.",
  },
  {
    name: "Dr. Daniel Okafor",
    specialty: "Neurology",
    focus: "Migraine care, stroke recovery support, and nerve health evaluations.",
  },
  {
    name: "Dr. Chloe Martins",
    specialty: "Pediatrics",
    focus: "Child wellness, developmental review, and family-centered treatment plans.",
  },
  {
    name: "Dr. Liam Chen",
    specialty: "Orthopedics",
    focus: "Joint pain, sports injuries, and post-operative rehabilitation pathways.",
  },
  {
    name: "Dr. Sofia Hassan",
    specialty: "Dermatology",
    focus: "Skin health plans and chronic condition management with clear follow-up care.",
  },
  {
    name: "Dr. Martin Nwosu",
    specialty: "Family Medicine",
    focus: "Primary care and preventive medicine for adults, families, and seniors.",
  },
];

export default function OurDoctorsPage() {
  return (
    <>
      <PublicNav />
      <main className="wrap page-shell">
        <section className="page-hero">
          <span className="tag">Our Doctors</span>
          <h1>Experienced clinicians focused on your health journey.</h1>
          <p>
            Our care teams combine advanced training with compassionate, patient-first treatment planning for every stage of care.
          </p>
        </section>

        <section className="grid g3 doctor-grid">
          {doctors.map((doctor) => (
            <article className="card doctor-card" key={doctor.name}>
              <div className="av large">{doctor.name.split(" ").at(-1)?.[0] ?? "D"}</div>
              <h3>{doctor.name}</h3>
              <p className="doctor-specialty">{doctor.specialty}</p>
              <p>{doctor.focus}</p>
            </article>
          ))}
        </section>

        <section className="info-panel compact">
          <div>
            <h2>What makes our doctors different</h2>
            <p>
              We value clear communication, trusted expertise, and coordinated care across departments so patients feel supported throughout treatment.
            </p>
          </div>
          <ul className="check-list">
            <li>Evidence-led decision making</li>
            <li>Clear follow-up recommendations</li>
            <li>Integrated digital records and planning</li>
          </ul>
        </section>

        <div className="cta-strip">
          <h3>Ready to meet a doctor?</h3>
          <Link className="btn" href="/book-appointment">Book an appointment</Link>
        </div>
      </main>
    </>
  );
}
