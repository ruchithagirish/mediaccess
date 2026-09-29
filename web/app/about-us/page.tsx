import Link from "next/link";
import { PublicNav } from "@/components/PublicNav";

export default function AboutUsPage() {
  return (
    <>
      <PublicNav />
      <main className="wrap page-shell">
        <section className="page-hero">
          <span className="tag">About Us</span>
          <h1>Building a healthier future through compassionate care and modern clinical systems.</h1>
          <p>
            MediAccess was created to bring together trusted clinicians, clear communication, and efficient digital access for better patient experiences.
          </p>
        </section>

        <section className="info-panel">
          <div>
            <h2>Our mission</h2>
            <p>
              We aim to simplify access to healthcare, support person-centered treatment, and make high-quality clinical services more approachable for every community we serve.
            </p>
          </div>
          <div className="mini-list">
            <div><strong>Compassion</strong><span>Every patient is treated with empathy, respect, and dignity.</span></div>
            <div><strong>Excellence</strong><span>We rely on evidence-based medicine and modern clinical workflows.</span></div>
            <div><strong>Trust</strong><span>Patients deserve continuity, transparency, and informed care decisions.</span></div>
          </div>
        </section>

        <section className="grid g2">
          <article className="card">
            <h3>Why patients choose us</h3>
            <p>We bring together specialist access, clear communication, and digital coordination to reduce friction in the care journey.</p>
          </article>
          <article className="card">
            <h3>Our promise</h3>
            <p>We promise better access, stronger continuity, and support that helps patients move forward with confidence.</p>
          </article>
        </section>

        <div className="cta-strip">
          <h3>Learn more or connect with our team.</h3>
          <Link className="btn" href="/contact">Get in touch</Link>
        </div>
      </main>
    </>
  );
}
