import { notFound } from "next/navigation";
import { ClinicalWorkspace } from "@/components/clinical/AD-DD-LD-prescrip-invest";
import { isLabSection } from "@/components/clinical/LD-sidebar";
import { SLUG_TO_ROLE } from "@/lib/roles";

const investigationRoles = new Set(["DOCTOR", "LAB_TECH", "ADMIN"]);

export default async function InvestigationsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ section?: string | string[] }> }) {
  const [{ slug }, { section }] = await Promise.all([params, searchParams]);
  const role = SLUG_TO_ROLE[slug];
  if (!role || !investigationRoles.has(role)) notFound();
  const labSection = isLabSection(section) ? section : undefined;
  return <ClinicalWorkspace role={role} initialPanel="investigations" initialLabSection={labSection} labNavigationItem={role === "LAB_TECH" ? labSection ?? "Investigations & worklists" : undefined} />;
}