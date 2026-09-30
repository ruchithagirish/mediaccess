import Link from "next/link";
import { PublicNav } from "@/components/public/PublicNav";

const awards = [
  "Excellence in Multidisciplinary Care",
  "Outstanding Patient Experience Award",
  "Innovation in Digital Health Services",
  "Community Wellness and Prevention Recognition",
];

export default function AwardsAchievementsPage() {
  return (
    <>
      <PublicNav />
      <main className="wrap page-shell">
        <section className="page-hero">
          <span className="tag">Awards & Achievements</span>
          <h1>Recognition for compassionate care, innovation, and clinical excellence.</h1>
          <p>Our team continues to be recognized for patient-first service, health technology, and outcomes-focused medicine.</p>
        </section>

        <section className="grid g2">
          {awards.map((award) => (
            <article className="card" key={award}>
              <h3>{award}</h3>
              <p>Celebrating the dedication of our physicians, nurses, support staff, and clinical teams across every department.</p>
            </article>
          ))}
        </section>

        <section className="info-panel compact">
          <div>
            <h2>Our commitment</h2>
            <p>We continue to invest in quality, patient trust, and evidence-led care that helps people return to healthier, more confident lives.</p>
          </div>
          <ul className="check-list">
            <li>Clinical excellence</li>
            <li>Patient-centered care</li>
            <li>Community impact</li>
          </ul>
        </section>

        <div className="cta-strip">
          <h3>Learn more about our values.</h3>
          <Link className="btn" href="/about-us">About MediAccess</Link>
        </div>
      </main>
    </>
  );
}
