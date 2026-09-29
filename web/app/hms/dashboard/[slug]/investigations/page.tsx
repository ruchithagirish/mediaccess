import { notFound } from "next/navigation";
import { ClinicalWorkspace } from "@/components/ClinicalWorkspace";
import { SLUG_TO_ROLE } from "@/lib/roles";

const investigationRoles = new Set(["DOCTOR", "LAB_TECH", "ADMIN"]);

export default function InvestigationsPage({ params }: { params: { slug: string } }) {
  const role = SLUG_TO_ROLE[params.slug];
  if (!role || !investigationRoles.has(role)) notFound();
  return <ClinicalWorkspace role={role} initialPanel="investigations" />;
}