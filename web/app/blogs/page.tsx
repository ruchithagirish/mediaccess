import Link from "next/link";
import { PublicNav } from "@/components/PublicNav";

const blogPosts = [
  {
    title: "What to expect during a preventive checkup",
    text: "A practical guide to screenings, health questions, and how to prepare for a more informed visit.",
  },
  {
    title: "Managing stress without neglecting your health",
    text: "Stress affects sleep, immunity, and recovery. Learn simple, realistic strategies that make a real difference.",
  },
  {
    title: "Signs you should schedule a consultation sooner",
    text: "From persistent fatigue to unexplained pain, early evaluation can prevent complications and shorten recovery.",
  },
];

export default function BlogsPage() {
  return (
    <>
      <PublicNav />
      <main className="wrap page-shell">
        <section className="page-hero">
          <span className="tag">Blogs</span>
          <h1>Health insights and practical guidance for everyday living.</h1>
          <p>Explore thoughtful, evidence-based content to help you understand wellness, disease prevention, and better health decisions.</p>
        </section>

        <section className="grid g3">
          {blogPosts.map((post) => (
            <article className="card" key={post.title}>
              <h3>{post.title}</h3>
              <p>{post.text}</p>
            </article>
          ))}
        </section>

        <section className="info-panel compact">
          <div>
            <h2>Wellness by design</h2>
            <p>Our content is written to help patients better understand diagnoses, treatment options, and the habits that support long-term health.</p>
          </div>
          <ul className="check-list">
            <li>Health education</li>
            <li>Practical lifestyle tips</li>
            <li>Clinical prevention guidance</li>
          </ul>
        </section>

        <div className="cta-strip">
          <h3>Looking for a clinician’s guidance?</h3>
          <Link className="btn" href="/our-doctors">Meet our doctors</Link>
        </div>
      </main>
    </>
  );
}
