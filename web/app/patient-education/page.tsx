import Link from "next/link";
import { PublicNav } from "@/components/PublicNav";

const resources = [
  {
    title: "Healthy living essentials",
    text: "Learn how nutrition, sleep, movement, and routine habits support long-term physical and mental wellbeing.",
  },
  {
    title: "Understanding chronic care",
    text: "Explore practical ways to manage conditions such as diabetes, blood pressure, and asthma with confidence.",
  },
  {
    title: "Preventive care checklist",
    text: "Know when to schedule screenings, vaccinations, and annual reviews to catch health concerns early.",
  },
  {
    title: "Family health support",
    text: "Access general guidance for parents, caregivers, and older adults looking for healthier routines and safer home care.",
  },
];

export default function PatientEducationPage() {
  return (
    <>
      <PublicNav />
      <main className="wrap page-shell">
        <section className="page-hero">
          <span className="tag">Patient Education</span>
          <h1>Knowledge that helps you make informed health decisions.</h1>
          <p>
            We provide trusted information and practical health guidance to help patients stay proactive, supported, and better prepared for care.
          </p>
        </section>

        <section className="grid g2 education-grid">
          {resources.map((resource) => (
            <article className="card resource-card" key={resource.title}>
              <h3>{resource.title}</h3>
              <p>{resource.text}</p>
            </article>
          ))}
        </section>

        <section className="info-panel">
          <div>
            <h2>Learning support available</h2>
            <p>
              Our education resources are designed to complement clinical care and support everyday understanding of health and recovery.
            </p>
          </div>
          <ul className="check-list">
            <li>Monthly webinars and health education sessions</li>
            <li>Practical guidance for preventive care and recovery</li>
            <li>Clear resources for families, caregivers, and chronic care patients</li>
          </ul>
        </section>

        <div className="cta-strip">
          <h3>Want to speak with a clinician?</h3>
          <Link className="btn" href="/portal/appointments">Schedule a visit</Link>
        </div>
      </main>
    </>
  );
}
