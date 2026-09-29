import { notFound } from "next/navigation";
import { PatientWorkspace } from "@/components/PatientWorkspace";
import { SLUG_TO_ROLE } from "@/lib/roles";

export default function PatientProfilePage({ params }: { params: { slug: string; patientId: string } }) {
  const role = SLUG_TO_ROLE[params.slug];
  if (!role) notFound();
  return <PatientWorkspace role={role} patientId={params.patientId} />;
}