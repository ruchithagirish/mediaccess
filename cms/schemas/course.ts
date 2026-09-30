import { defineField, defineType } from "sanity";

export const course = defineType({
  name: "course",
  title: "Patient course",
  type: "document",
  fields: [
    defineField({ name: "title", title: "Title", type: "string", validation: (rule) => rule.required() }),
    defineField({ name: "slug", title: "Slug", type: "slug", options: { source: "title" }, validation: (rule) => rule.required() }),
    defineField({ name: "summary", title: "Summary", type: "text", rows: 4, validation: (rule) => rule.required() }),
    defineField({ name: "format", title: "Format", type: "string", options: { list: ["Online", "In person", "Self-paced"] } }),
    defineField({ name: "publishedAt", title: "Publish at", type: "datetime", description: "Set this value to publish the course." }),
  ],
  preview: { select: { title: "title", subtitle: "format" } },
});