import Link from "next/link";
import { PublicNav } from "@/components/public/PublicNav";

export default function MyProfilePage() {
  return (
    <>
      <PublicNav />
      <main className="wrap page-shell">
        <section className="page-hero">
          <span className="tag">My Profile</span>
          <h1>Manage your care history, preferences, and personal details.</h1>
          <p>Keep your patient information up to date, review your records, and personalize your healthcare experience.</p>
        </section>

        <section className="grid g2">
          <article className="card">
            <h3>Personal details</h3>
            <p>Name, date of birth, contact information, and emergency contact updates can be reviewed and managed from the patient portal.</p>
          </article>
          <article className="card">
            <h3>Health preferences</h3>
            <p>Your care preferences, reminders, follow-up needs, and communication preferences are stored in one secure place.</p>
          </article>
        </section>

        <section className="info-panel compact">
          <div>
            <h2>Why this matters</h2>
            <p>Accurate patient information supports faster treatment decisions, better continuity of care, and safer communication across the clinical team.</p>
          </div>
          <ul className="check-list">
            <li>Update contact details</li>
            <li>Track care preferences</li>
            <li>Review upcoming visits</li>
          </ul>
        </section>

        <div className="cta-strip">
          <h3>Need help updating your profile?</h3>
          <Link className="btn" href="/login">Access portal</Link>
        </div>
      </main>
    </>
  );
}
