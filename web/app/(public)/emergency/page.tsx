import Link from "next/link";
import { PublicNav } from "@/components/public/PublicNav";

export default function EmergencyPage() {
  return (
    <>
      <PublicNav />
      <main className="wrap page-shell">
        <section className="page-hero narrow">
          <span className="tag">Emergency</span>
          <h1>Urgent help is available when time matters most.</h1>
          <p>If you or a loved one is facing a medical emergency, seek immediate care and contact the emergency team right away.</p>
        </section>

        <section className="grid g2">
          <article className="card">
            <h3>Emergency support</h3>
            <p>Our emergency process is designed for rapid triage, clinical assessment, and immediate treatment coordination.</p>
          </article>
          <article className="card">
            <h3>What to do</h3>
            <p>Call emergency services or go to the nearest emergency department if symptoms are severe, sudden, or life-threatening.</p>
          </article>
        </section>

        <section className="info-panel compact">
          <div>
            <h2>When to act immediately</h2>
            <p>Chest pain, breathing difficulties, severe bleeding, confusion, or sudden weakness require urgent care without delay.</p>
          </div>
          <ul className="check-list">
            <li>Call emergency services</li>
            <li>Go to the nearest emergency center</li>
            <li>Bring your ID and relevant medical information</li>
          </ul>
        </section>

        <div className="cta-strip">
          <h3>Need urgent support or guidance?</h3>
          <Link className="btn" href="/contact-us">Contact us</Link>
        </div>
      </main>
    </>
  );
}
