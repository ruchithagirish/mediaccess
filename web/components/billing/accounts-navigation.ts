export const ACCOUNTS_SECTIONS = [
  { label: "Overview", tab: "Overview" },
  { label: "OPD & IPD billing", tab: "OPD billing" },
  { label: "Packages & procedures", tab: "Services & rates" },
  { label: "Insurance & TPA", tab: "Insurance & TPA" },
  { label: "Government schemes", tab: "Government schemes" },
  { label: "GST & invoicing", tab: "GST & invoicing" },
  { label: "Payments", tab: "Payments" },
  { label: "Financial controls", tab: "Reconciliation" },
  { label: "Revenue analytics", tab: "Revenue analytics" },
] as const;

export type AccountsTab = typeof ACCOUNTS_SECTIONS[number]["tab"];
export type AccountsSection = typeof ACCOUNTS_SECTIONS[number]["label"];
export type AccountsNavigationItem = AccountsSection | "Patient records" | "My profile";

export function isAccountsTab(value: unknown): value is AccountsTab {
  return typeof value === "string" && ACCOUNTS_SECTIONS.some((section) => section.tab === value);
}