import { PortableText, type PortableTextBlock } from "@portabletext/react";
import { notFound } from "next/navigation";
import { PublicNav } from "@/components/public/PublicNav";
import { sanityQuery } from "@/lib/sanity";

interface ArticleContent {
  title: string;
  summary: string;
  category: string | null;
  body: PortableTextBlock[];
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = await sanityQuery<ArticleContent | null>(
    `*[_type == "article" && slug.current == ${JSON.stringify(slug)} && defined(publishedAt)][0] {
      title,
      summary,
      category,
      body
    }`,
    null,
  );
  if (!article) notFound();

  return (
    <>
      <PublicNav />
      <main className="wrap page-shell">
        <article className="article-content">
          {article.category && <span className="tag">{article.category}</span>}
          <h1>{article.title}</h1>
          <p className="article-summary">{article.summary}</p>
          <PortableText value={article.body ?? []} />
        </article>
      </main>
    </>
  );
}