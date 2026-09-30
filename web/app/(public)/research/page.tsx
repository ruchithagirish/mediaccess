import Link from "next/link";
import { PublicNav } from "@/components/public/PublicNav";

const researchAreas = [
  {
    title: "Cardiovascular prevention",
    text: "Improving early detection and patient education around heart disease, hypertension, and long-term prevention.",
  },
  {
    title: "Digital care coordination",
    text: "Exploring better ways to integrate digital records, app-based follow-up, and care planning across departments.",
  },
  {
    title: "Pediatric wellness pathways",
    text: "Studying care approaches that support children’s development, family engagement, and healthier routine monitoring.",
  },
  {
    title: "Rehabilitation and recovery",
    text: "Advancing patient-centered recovery planning for mobility, pain management, and postoperative care pathways.",
  },
];

export default function ResearchPage() {
  return (
    <>
      <PublicNav />
      <main className="wrap page-shell">
        <section className="page-hero">
          <span className="tag">Research</span>
          <h1>Research that strengthens evidence-based patient care.</h1>
          <p>
            We invest in practical research and clinical improvement initiatives to improve quality, patient experience, and health outcomes.
          </p>
        </section>

        <section className="grid g2">
          {researchAreas.map((area) => (
            <article className="card" key={area.title}>
              <h3>{area.title}</h3>
              <p>{area.text}</p>
            </article>
          ))}
        </section>

        <section className="info-panel">
          <div>
            <h2>How research supports care</h2>
            <p>
              Through careful review, multidisciplinary collaboration, and patient-centered study, our teams translate evidence into better decisions.
            </p>
          </div>
          <ul className="check-list">
            <li>Clinical quality improvement initiatives</li>
            <li>Population health and preventive care insights</li>
            <li>Evaluation of patient experience and treatment pathways</li>
          </ul>
        </section>

        <div className="cta-strip">
          <h3>Partner with us on better care.</h3>
          <Link className="btn" href="/contact">Contact the research team</Link>
        </div>
      </main>
    </>
  );
}
