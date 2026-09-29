import { notFound } from "next/navigation";
import { DashboardView } from "@/components/DashboardView";
import { SLUG_TO_ROLE } from "@/lib/roles";

export default function DashboardPage({ params }: { params: { slug: string } }) {
  const role = SLUG_TO_ROLE[params.slug];
  if (!role) notFound();
  return <DashboardView role={role} />;
}
