import Link from "next/link";
import { PublicNav } from "@/components/public/PublicNav";
import { sanityQuery } from "@/lib/sanity";

interface ArticleSummary {
  title: string;
  slug: string;
  summary: string;
  category: string | null;
}

const articlesQuery = `*[_type == "article" && defined(publishedAt)] | order(publishedAt desc) {
  title,
  "slug": slug.current,
  summary,
  category
}`;

export default async function BlogsPage() {
  const blogPosts = await sanityQuery<ArticleSummary[]>(articlesQuery, []);

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
          {blogPosts.length === 0 && <p>Health articles are being updated. Please check back soon.</p>}
          {blogPosts.map((post) => (
            <article className="card" key={post.title}>
              {post.category && <span className="tag">{post.category}</span>}
              <h3>{post.title}</h3>
              <p>{post.summary}</p>
              <Link className="btn ghost sm" href={`/blogs/${encodeURIComponent(post.slug)}`}>Read article</Link>
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
