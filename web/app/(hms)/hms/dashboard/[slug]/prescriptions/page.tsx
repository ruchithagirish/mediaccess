import { notFound } from "next/navigation";
import { ClinicalWorkspace } from "@/components/clinical/AD-DD-LD-prescrip-invest";
import { SLUG_TO_ROLE } from "@/lib/roles";

const prescriptionRoles = new Set(["DOCTOR", "PHARMACIST", "ADMIN"]);

export default async function PrescriptionsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const role = SLUG_TO_ROLE[slug];
  if (!role || !prescriptionRoles.has(role)) notFound();
  return <ClinicalWorkspace role={role} initialPanel={role === "PHARMACIST" || role === "ADMIN" ? "drug-master" : "prescriptions"} />;
}