import { notFound } from "next/navigation";
import { PatientWorkspace } from "@/components/patient/AD-RD-DD-ND-PD-LD-patient-records";
import { SLUG_TO_ROLE } from "@/lib/roles";

export default async function PatientProfilePage({ params }: { params: Promise<{ slug: string; patientId: string }> }) {
  const { slug, patientId } = await params;
  const role = SLUG_TO_ROLE[slug];
  if (!role) notFound();
  return <PatientWorkspace role={role} patientId={patientId} />;
}