import { notFound } from "next/navigation";
import { BillingDashboard } from "@/components/BillingDashboard";
import { SLUG_TO_ROLE } from "@/lib/roles";

const billingRoles = new Set(["ADMIN", "RECEPTION", "ACCOUNTANT"]);

export default function BillingPage({ params }: { params: { slug: string } }) {
  const role = SLUG_TO_ROLE[params.slug];
  if (!role || !billingRoles.has(role)) notFound();
  return <BillingDashboard role={role} />;
}