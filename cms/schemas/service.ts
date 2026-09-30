import { defineField, defineType } from "sanity";

export const service = defineType({
  name: "service",
  title: "Service",
  type: "document",
  fields: [
    defineField({ name: "title", title: "Title", type: "string", validation: (rule) => rule.required() }),
    defineField({ name: "slug", title: "Slug", type: "slug", options: { source: "title" }, validation: (rule) => rule.required() }),
    defineField({ name: "summary", title: "Summary", type: "text", rows: 4, validation: (rule) => rule.required() }),
    defineField({ name: "publishedAt", title: "Publish at", type: "datetime", description: "Set this value to publish the service." }),
  ],
  preview: { select: { title: "title", subtitle: "slug.current" } },
});