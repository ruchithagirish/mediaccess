import Link from "next/link";
import { PublicNav } from "@/components/PublicNav";

const resources = [
  {
    title: "Healthy living guide",
    text: "Practical advice for better sleep, nutrition, movement, and everyday habits that support long-term wellness.",
  },
  {
    title: "Managing chronic conditions",
    text: "Learn how to monitor symptoms, stay on schedule with care plans, and keep your goals realistic and measurable.",
  },
  {
    title: "Preventive screening checklist",
    text: "Understand when to schedule annual checkups, screening tests, and lifestyle reviews for better early detection.",
  },
  {
    title: "Family health resources",
    text: "Guidance for parents, caregivers, and older adults looking for reliable care coordination and confidence at home.",
  },
];

const programs = [
  "Monthly webinars with specialists",
  "Nutrition and lifestyle education sessions",
  "Medication safety and preventive care guidance",
  "Support for new parents and caregivers",
];

export default function EducationPage() {
  return (
    <>
      <PublicNav />
      <main className="wrap page-shell">
        <section className="page-hero">
          <span className="tag">Education</span>
          <h1>Knowledge that supports healthier decisions every day.</h1>
          <p>
            We believe better health begins with informed patients. Explore practical resources, appointments, and programs that help you stay proactive.
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
            <h2>Learning programs available</h2>
            <p>
              Our education team offers a mix of short digital resources and live sessions designed for real-world health needs.
            </p>
          </div>
          <ul className="check-list">
            {programs.map((program) => <li key={program}>{program}</li>)}
          </ul>
        </section>

        <div className="cta-strip">
          <h3>Need a conversation with a clinician?</h3>
          <Link className="btn" href="/portal/appointments">Schedule a visit</Link>
        </div>
      </main>
    </>
  );
}
