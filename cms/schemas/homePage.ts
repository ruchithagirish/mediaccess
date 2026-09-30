import { defineField, defineType } from "sanity";

export const homePage = defineType({
  name: "homePage",
  title: "Homepage",
  type: "document",
  fields: [
    defineField({ name: "heroTitle", title: "Hero heading", type: "string", validation: (rule) => rule.required() }),
    defineField({ name: "heroSummary", title: "Hero summary", type: "text", rows: 3, validation: (rule) => rule.required() }),
    defineField({ name: "specialtiesHeading", title: "Specialties section heading", type: "string", validation: (rule) => rule.required() }),
    defineField({ name: "doctorsHeading", title: "Doctors section heading", type: "string", validation: (rule) => rule.required() }),
    defineField({ name: "publishedAt", title: "Publish at", type: "datetime", description: "Set this value to publish the homepage content." }),
  ],
  preview: { prepare: () => ({ title: "Homepage" }) },
});