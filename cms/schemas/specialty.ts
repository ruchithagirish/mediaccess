import { defineField, defineType } from "sanity";

export const specialty = defineType({
  name: "specialty",
  title: "Specialty",
  type: "document",
  fields: [
    defineField({ name: "name", title: "Name", type: "string", validation: (rule) => rule.required() }),
    defineField({ name: "slug", title: "Slug", type: "slug", options: { source: "name" }, validation: (rule) => rule.required() }),
    defineField({ name: "description", title: "Description", type: "text", rows: 4, validation: (rule) => rule.required() }),
    defineField({ name: "publishedAt", title: "Publish at", type: "datetime", description: "Set this value to publish the specialty." }),
  ],
  preview: { select: { title: "name", subtitle: "slug.current" } },
});