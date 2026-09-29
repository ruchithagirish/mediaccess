import Link from "next/link";
import { PublicNav } from "@/components/PublicNav";

export default function MobileAppPage() {
  return (
    <>
      <PublicNav />
      <main className="wrap page-shell">
        <section className="page-hero">
          <span className="tag">Mobile App</span>
          <h1>Healthcare access in your pocket.</h1>
          <p>Our mobile experience helps patients book visits, review reports, and stay up to date with care plans from anywhere.</p>
        </section>

        <section className="grid g2">
          <article className="card">
            <h3>App features</h3>
            <p>Book appointments, receive reminders, view prescriptions, and track follow-ups without needing to call the clinic.</p>
          </article>
          <article className="card">
            <h3>Designed for convenience</h3>
            <p>Quick navigation, secure access, and information that stays organized help patients manage care more smoothly.</p>
          </article>
        </section>

        <section className="info-panel compact">
          <div>
            <h2>Stay connected</h2>
            <p>From appointment reminders to report access, the app helps patients stay informed and prepared at every step of their care journey.</p>
          </div>
          <ul className="check-list">
            <li>Appointment booking</li>
            <li>Prescription visibility</li>
            <li>Care reminders</li>
          </ul>
        </section>

        <div className="cta-strip">
          <h3>Need to create an account?</h3>
          <Link className="btn" href="/register">Register now</Link>
        </div>
      </main>
    </>
  );
}
