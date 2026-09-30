import Link from "next/link";
import { PublicNav } from "@/components/public/PublicNav";

export default function ContactUsPage() {
  return (
    <>
      <PublicNav />
      <main className="wrap page-shell">
        <section className="page-hero narrow">
          <span className="tag">Contact Us</span>
          <h1>We’re here to help answer your questions.</h1>
          <p>Reach out for appointments, general inquiries, care coordination, or support with your healthcare experience.</p>
        </section>

        <section className="contact-grid">
          <div className="card contact-card">
            <h3>Reach us</h3>
            <ul className="contact-list">
              <li><strong>Phone:</strong> +1 (415) 555-0148</li>
              <li><strong>Email:</strong> care@mediaccess.health</li>
              <li><strong>Address:</strong> 124 Wellness Avenue, Suite 200, Riverside</li>
              <li><strong>Hours:</strong> Monday to Saturday, 8:00 AM to 7:00 PM</li>
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
                <textarea className="inp" rows={5} placeholder="How can we help?" />
              </label>
              <button type="button" className="btn">Send message</button>
            </form>
          </div>
        </section>
      </main>
    </>
  );
}
