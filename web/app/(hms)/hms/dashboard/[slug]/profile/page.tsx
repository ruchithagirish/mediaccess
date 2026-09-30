import { notFound } from "next/navigation";
import { MyProfileDashboard } from "@/components/hms/AD-RD-DD-ND-PD-LD-my-profile";
import { SLUG_TO_ROLE } from "@/lib/roles";

export default async function MyProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const role = SLUG_TO_ROLE[slug];
  if (role !== "ADMIN" && role !== "RECEPTION" && role !== "DOCTOR" && role !== "NURSE" && role !== "PHARMACIST" && role !== "LAB_TECH" && role !== "ACCOUNTANT") notFound();
  return <MyProfileDashboard role={role} />;
}