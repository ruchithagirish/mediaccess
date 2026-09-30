export const LAB_SECTIONS = [
  "Worklist",
  "Sample collection",
  "Upload reports",
  "Critical alerts",
  "Turnaround",
] as const;

export type LabSection = typeof LAB_SECTIONS[number];
export type LabNavigationItem = LabSection | "Patient records" | "Investigations & worklists" | "My Profile";

export function isLabSection(value: unknown): value is LabSection {
  return typeof value === "string" && LAB_SECTIONS.includes(value as LabSection);
}