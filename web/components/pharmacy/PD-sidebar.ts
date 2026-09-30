export const PHARMACY_SECTIONS = [
  { label: "Overview", tab: "Overview" },
  { label: "E-prescription queue", tab: "Dispense queue" },
  { label: "Inventory & batches", tab: "Inventory & batches" },
  { label: "Drug master & safety", tab: "Drug master & safety" },
  { label: "Schedule H/H1 register", tab: "Schedule H/H1 register" },
  { label: "Patient refill history", tab: "Patient refill history" },
  { label: "Alerts", tab: "Alerts" },
  { label: "Inventory & ERP", tab: "Inventory & ERP" },
] as const;

export type PharmacyTab = typeof PHARMACY_SECTIONS[number]["tab"];
export type PharmacyNavigationItem = PharmacyTab | "patients" | "profile";

export function isPharmacyTab(value: unknown): value is PharmacyTab {
  return typeof value === "string" && PHARMACY_SECTIONS.some((section) => section.tab === value);
}