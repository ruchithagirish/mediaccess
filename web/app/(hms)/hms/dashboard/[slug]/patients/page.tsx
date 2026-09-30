import { notFound } from "next/navigation";
import { PatientWorkspace } from "@/components/patient/AD-RD-DD-ND-PD-LD-patient-records";
import { SLUG_TO_ROLE } from "@/lib/roles";

export default async function PatientSearchPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const role = SLUG_TO_ROLE[slug];
  if (!role) notFound();
  return <PatientWorkspace role={role} />;
}