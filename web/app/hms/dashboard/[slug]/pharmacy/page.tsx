import { notFound } from "next/navigation";
import { PharmacyDashboard } from "@/components/PharmacyDashboard";
import { SLUG_TO_ROLE } from "@/lib/roles";

const pharmacyRoles = new Set(["PHARMACIST", "ADMIN"]);

export default function PharmacyPage({ params }: { params: { slug: string } }) {
  const role = SLUG_TO_ROLE[params.slug];
  if (!role || !pharmacyRoles.has(role)) notFound();
  return <PharmacyDashboard role={role} />;
}