import { notFound } from "next/navigation";
import { ClinicalWorkspace } from "@/components/ClinicalWorkspace";
import { SLUG_TO_ROLE } from "@/lib/roles";

const prescriptionRoles = new Set(["DOCTOR", "PHARMACIST", "ADMIN"]);

export default function PrescriptionsPage({ params }: { params: { slug: string } }) {
  const role = SLUG_TO_ROLE[params.slug];
  if (!role || !prescriptionRoles.has(role)) notFound();
  return <ClinicalWorkspace role={role} initialPanel={role === "PHARMACIST" || role === "ADMIN" ? "drug-master" : "prescriptions"} />;
}