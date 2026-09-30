import { notFound } from "next/navigation";
import { InpatientOperationsOverview } from "@/components/inpatient/AD-IPD&OT";
import { SLUG_TO_ROLE } from "@/lib/roles";

export default async function InpatientOverviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const role = SLUG_TO_ROLE[slug];
  if (role !== "ADMIN") notFound();
  return <InpatientOperationsOverview />;
}