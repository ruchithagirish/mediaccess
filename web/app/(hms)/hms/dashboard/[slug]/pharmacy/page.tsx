import { notFound } from "next/navigation";
import { PharmacyDashboard } from "@/components/pharmacy/AD-PD-Pharmacy-DI";
import { SLUG_TO_ROLE } from "@/lib/roles";

const pharmacyRoles = new Set(["PHARMACIST", "ADMIN"]);

export default async function PharmacyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const role = SLUG_TO_ROLE[slug];
  if (!role || !pharmacyRoles.has(role)) notFound();
  return <PharmacyDashboard role={role} />;
}