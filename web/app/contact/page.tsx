import Link from "next/link";
import { PublicNav } from "@/components/PublicNav";

export default function ContactPage() {
  return (
    <>
      <PublicNav />
      <main className="wrap page-shell">
        <section className="page-hero narrow">
          <span className="tag">Contact</span>
          <h1>We’re here to help.</h1>
          <p>
            Reach out for appointments, general questions, or support with your care experience at MediAccess.
          </p>
        </section>

        <section className="contact-grid">
          <div className="card contact-card">
            <h3>Contact information</h3>
            <ul className="contact-list">
              <li><strong>Phone:</strong> +1 (415) 555-0148</li>
              <li><strong>Email:</strong> care@mediaccess.health</li>
              <li><strong>Address:</strong> 124 Wellness Avenue, Suite 200, Riverside</li>
              <li><strong>Hours:</strong> Mon–Sat, 8:00 AM – 7:00 PM</li>
            </ul>
          </div>

          <div className="card contact-form-card">
            <h3>Send a message</h3>
            <form className="contact-form">
              <label>
                <span>Name</span>
                <input className="inp" type="text" placeholder="Your full name" />
              </label>
              <label>
                <span>Email</span>
                <input className="inp" type="email" placeholder="you@example.com" />
              </label>
              <label>
                <span>Message</span>
                <textarea className="inp" rows={5} placeholder="How can we help you?" />
              </label>
              <button className="btn" type="button">Send message</button>
            </form>
          </div>
        </section>

        <div className="cta-strip">
          <h3>Prefer to book online?</h3>
          <Link className="btn" href="/register">Create patient account</Link>
        </div>
      </main>
    </>
  );
}
