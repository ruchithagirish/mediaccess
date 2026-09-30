import Link from "next/link";
import { PublicNav } from "@/components/public/PublicNav";

export default function FeedbackPage() {
  return (
    <>
      <PublicNav />
      <main className="wrap page-shell">
        <section className="page-hero narrow">
          <span className="tag">Feedback</span>
          <h1>Your thoughts help us improve care.</h1>
          <p>We value your experience and use feedback to strengthen service quality, communication, and patient support.</p>
        </section>

        <section className="contact-grid">
          <div className="card contact-card">
            <h3>How we use feedback</h3>
            <p>Whether it is about clarity, wait times, or clinical experience, patient feedback helps us improve how we care for families and individuals.</p>
          </div>
          <div className="card contact-form-card">
            <h3>Share your experience</h3>
            <form className="contact-form">
              <label>
                <span>Topic</span>
                <input className="inp" type="text" placeholder="Treatment, service, or facility" />
              </label>
              <label>
                <span>Comments</span>
                <textarea className="inp" rows={5} placeholder="Tell us what went well or what we can improve." />
              </label>
              <button type="button" className="btn">Submit feedback</button>
            </form>
          </div>
        </section>
      </main>
    </>
  );
}
