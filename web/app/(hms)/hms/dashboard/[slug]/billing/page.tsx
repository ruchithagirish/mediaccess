import { notFound } from "next/navigation";
import { BillingDashboard } from "@/components/billing/AD-RD-Bill-pay";
import { isAccountsTab } from "@/components/billing/accounts-navigation";
import { SLUG_TO_ROLE } from "@/lib/roles";

const billingRoles = new Set(["ADMIN", "RECEPTION", "ACCOUNTANT"]);

export default async function BillingPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ section?: string | string[] }> }) {
  const [{ slug }, { section }] = await Promise.all([params, searchParams]);
  const role = SLUG_TO_ROLE[slug];
  if (!role || !billingRoles.has(role)) notFound();
  return <BillingDashboard role={role} initialTab={isAccountsTab(section) ? section : undefined} />;
}