import { defineField, defineType } from "sanity";

export const doctor = defineType({
  name: "doctor",
  title: "Doctor profile",
  type: "document",
  fields: [
    defineField({ name: "name", title: "Display name", type: "string", validation: (rule) => rule.required() }),
    defineField({ name: "slug", title: "Slug", type: "slug", options: { source: "name" }, validation: (rule) => rule.required() }),
    defineField({ name: "operationalDoctorId", title: "HMS doctor ID", type: "string", description: "DoctorProfile ID returned by the appointment API; required for online booking.", validation: (rule) => rule.required() }),
    defineField({ name: "portrait", title: "Portrait", type: "image", options: { hotspot: true } }),
    defineField({ name: "gender", title: "Gender", type: "string", options: { list: ["Woman", "Man", "Non-binary", "Prefer not to say"] } }),
    defineField({ name: "languages", title: "Languages", type: "array", of: [{ type: "string" }], options: { layout: "tags" } }),
    defineField({ name: "specialties", title: "Specialties", type: "array", of: [{ type: "reference", to: [{ type: "specialty" }] }] }),
    defineField({ name: "experience", title: "Experience", type: "string" }),
    defineField({ name: "biography", title: "Biography", type: "text", rows: 6 }),
    defineField({ name: "focus", title: "Clinical focus", type: "text", rows: 3 }),
    defineField({ name: "publishedAt", title: "Publish at", type: "datetime", description: "Set this value to publish the profile." }),
  ],
  preview: { select: { title: "name", subtitle: "operationalDoctorId", media: "portrait" } },
});