import Link from "next/link";
import { PublicNav } from "@/components/PublicNav";

const events = [
  {
    title: "Heart Health Awareness Week",
    date: "12 October 2026",
    text: "A community-focused campaign with screening advice, clinician Q&A, and preventive care guidance.",
  },
  {
    title: "Women’s Wellness Forum",
    date: "18 October 2026",
    text: "An educational event covering preventative care, lifestyle planning, and early symptom awareness.",
  },
  {
    title: "Parent & Child Health Workshop",
    date: "07 November 2026",
    text: "A practical session with pediatric specialists on development, nutrition, and family wellbeing.",
  },
  {
    title: "Recovery & Mobility Clinic",
    date: "16 November 2026",
    text: "Guidance on rehabilitation, mobility planning, and post-treatment confidence-building.",
  },
];

export default function EventsPage() {
  return (
    <>
      <PublicNav />
      <main className="wrap page-shell">
        <section className="page-hero">
          <span className="tag">Events</span>
          <h1>Community health events that bring knowledge and support closer to home.</h1>
          <p>
            We host educational and wellness-focused events designed to help patients and families engage with better health practices.
          </p>
        </section>

        <section className="grid g2">
          {events.map((event) => (
            <article className="card" key={event.title}>
              <h3>{event.title}</h3>
              <p className="doctor-specialty">{event.date}</p>
              <p>{event.text}</p>
            </article>
          ))}
        </section>

        <section className="info-panel compact">
          <div>
            <h2>Why attend our events</h2>
            <p>
              Each session is designed to deliver credible health education in a welcoming and accessible setting for families and communities.
            </p>
          </div>
          <ul className="check-list">
            <li>Interactive education with clinical experts</li>
            <li>Recognition of screening and prevention opportunities</li>
            <li>Practical guidance for daily wellbeing and recovery</li>
          </ul>
        </section>

        <div className="cta-strip">
          <h3>Interested in attending?</h3>
          <Link className="btn" href="/contact">Contact the team</Link>
        </div>
      </main>
    </>
  );
}
