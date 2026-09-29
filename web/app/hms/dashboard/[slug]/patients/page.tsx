import { notFound } from "next/navigation";
import { PatientWorkspace } from "@/components/PatientWorkspace";
import { SLUG_TO_ROLE } from "@/lib/roles";

export default function PatientSearchPage({ params }: { params: { slug: string } }) {
  const role = SLUG_TO_ROLE[params.slug];
  if (!role) notFound();
  return <PatientWorkspace role={role} />;
}