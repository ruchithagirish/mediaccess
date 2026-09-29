import { notFound } from "next/navigation";
import { InpatientWorkspace } from "@/components/InpatientWorkspace";
import { SLUG_TO_ROLE } from "@/lib/roles";

const inpatientRoles = new Set(["ADMIN", "RECEPTION", "DOCTOR", "NURSE"]);

export default function InpatientPage({ params }: { params: { slug: string } }) {
  const role = SLUG_TO_ROLE[params.slug];
  if (!role || !inpatientRoles.has(role)) notFound();
  return <InpatientWorkspace role={role} />;
}