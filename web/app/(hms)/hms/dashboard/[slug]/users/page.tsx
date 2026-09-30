import { notFound } from "next/navigation";
import { DashboardView } from "@/components/hms/DD-consult";
import { SLUG_TO_ROLE } from "@/lib/roles";

export default async function UserManagementPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const role = SLUG_TO_ROLE[slug];
  if (role !== "ADMIN") notFound();
  return <DashboardView role={role} />;
}