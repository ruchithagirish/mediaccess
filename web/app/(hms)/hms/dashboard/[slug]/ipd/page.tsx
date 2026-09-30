import { notFound } from "next/navigation";
import { InpatientWorkspace } from "@/components/inpatient/RD-DD-ND-bed&IPD-OT";
import { SLUG_TO_ROLE } from "@/lib/roles";

const inpatientRoles = new Set(["ADMIN", "RECEPTION", "DOCTOR", "NURSE"]);

export default async function InpatientPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const role = SLUG_TO_ROLE[slug];
  if (!role || !inpatientRoles.has(role)) notFound();
  return <InpatientWorkspace role={role} />;
}