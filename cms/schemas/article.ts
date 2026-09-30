import { defineField, defineType } from "sanity";

export const article = defineType({
  name: "article",
  title: "Health article",
  type: "document",
  fields: [
    defineField({ name: "title", title: "Title", type: "string", validation: (rule) => rule.required() }),
    defineField({ name: "slug", title: "Slug", type: "slug", options: { source: "title" }, validation: (rule) => rule.required() }),
    defineField({ name: "summary", title: "Summary", type: "text", rows: 3, validation: (rule) => rule.required() }),
    defineField({ name: "body", title: "Article", type: "array", of: [{ type: "block" }] }),
    defineField({ name: "category", title: "Category", type: "string" }),
    defineField({ name: "publishedAt", title: "Publish at", type: "datetime", description: "Set this value to publish the article." }),
  ],
  preview: { select: { title: "title", subtitle: "category" } },
});