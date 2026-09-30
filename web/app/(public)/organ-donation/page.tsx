import Link from "next/link";
import { PublicNav } from "@/components/public/PublicNav";

export default function OrganDonationPage() {
  return (
    <>
      <PublicNav />
      <main className="wrap page-shell">
        <section className="page-hero">
          <span className="tag">Organ Donation</span>
          <h1>Give life through a decision that can change many futures.</h1>
          <p>Organ donation can help save lives, support transplantation programs, and bring hope to patients awaiting treatment.</p>
        </section>

        <section className="grid g2">
          <article className="card">
            <h3>Why register</h3>
            <p>Transplants offer a second chance at life for patients with organ failure, and a single donor can help several people.</p>
          </article>
          <article className="card">
            <h3>How to get involved</h3>
            <p>Learn about registration, donor consent, and how families can make informed decisions together during difficult times.</p>
          </article>
        </section>

        <section className="info-panel compact">
          <div>
            <h2>Important information</h2>
            <p>Donation decisions are deeply personal and supported by medical guidance, family discussions, and legal clarity.</p>
          </div>
          <ul className="check-list">
            <li>Understand the process</li>
            <li>Discuss with family</li>
            <li>Register your consent</li>
          </ul>
        </section>

        <div className="cta-strip">
          <h3>Ready to learn more?</h3>
          <Link className="btn" href="/contact-us">Speak to our team</Link>
        </div>
      </main>
    </>
  );
}
