import { notFound } from "next/navigation";
import { DashboardView } from "@/components/hms/DD-consult";
import { ReceptionDashboard } from "@/components/reception/RD-today";
import { NurseDashboard } from "@/components/nurse/ND-overview";
import { PharmacyDashboard } from "@/components/pharmacy/AD-PD-Pharmacy-DI";
import { isPharmacyTab } from "@/components/pharmacy/PD-sidebar";
import { ClinicalWorkspace } from "@/components/clinical/AD-DD-LD-prescrip-invest";
import { isLabSection } from "@/components/clinical/LD-sidebar";
import { BillingDashboard } from "@/components/billing/AD-RD-Bill-pay";
import { isAccountsTab } from "@/components/billing/accounts-navigation";
import { SLUG_TO_ROLE } from "@/lib/roles";

export default async function DashboardPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ section?: string | string[] }> }) {
  const [{ slug }, { section }] = await Promise.all([params, searchParams]);
  const role = SLUG_TO_ROLE[slug];
  if (!role) notFound();
  if (role === "RECEPTION") return <ReceptionDashboard />;
  if (role === "NURSE") return <NurseDashboard />;
  if (role === "LAB_TECH") return <ClinicalWorkspace role={role} initialPanel="investigations" initialLabSection={isLabSection(section) ? section : "Worklist"} />;
  if (role === "PHARMACIST") return <PharmacyDashboard role={role} showOverview initialTab={isPharmacyTab(section) ? section : undefined} />;
  if (role === "ACCOUNTANT") return <BillingDashboard role={role} initialTab={isAccountsTab(section) ? section : undefined} />;
  return <DashboardView role={role} />;
}
