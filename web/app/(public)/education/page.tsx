import Link from "next/link";
import { PublicNav } from "@/components/public/PublicNav";
import { sanityQuery } from "@/lib/sanity";

interface EducationContent {
  title: string;
  slug: string;
  summary: string;
  format: string | null;
}

const coursesQuery = `*[_type == "course" && defined(publishedAt)] | order(title asc) {
  title,
  "slug": slug.current,
  summary,
  format
}`;

export default async function EducationPage() {
  const resources = await sanityQuery<EducationContent[]>(coursesQuery, []);

  return (
    <>
      <PublicNav />
      <main className="wrap page-shell">
        <section className="page-hero">
          <span className="tag">Education</span>
          <h1>Knowledge that supports healthier decisions every day.</h1>
          <p>
            We believe better health begins with informed patients. Explore practical resources, appointments, and programs that help you stay proactive.
          </p>
        </section>

        <section className="grid g2 education-grid">
          {resources.length === 0 && <p>Patient education resources are being updated. Please check back soon.</p>}
          {resources.map((resource) => (
            <article className="card resource-card" key={resource.title}>
              {resource.format && <span className="tag">{resource.format}</span>}
              <h3>{resource.title}</h3>
              <p>{resource.summary}</p>
            </article>
          ))}
        </section>

        <section className="info-panel">
          <div>
            <h2>Learning programs available</h2>
            <p>
              Our education team offers a mix of short digital resources and live sessions designed for real-world health needs.
            </p>
          </div>
          <ul className="check-list">
            {resources.map((resource) => <li key={resource.slug}>{resource.title}</li>)}
          </ul>
        </section>

        <div className="cta-strip">
          <h3>Need a conversation with a clinician?</h3>
          <Link className="btn" href="/book-appointment">Schedule a visit</Link>
        </div>
      </main>
    </>
  );
}
