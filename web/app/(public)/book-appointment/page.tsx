import { Suspense } from "react";
import { PublicNav } from "@/components/public/PublicNav";
import { PublicBookingForm } from "@/components/public/PublicBookingForm";

function BookingFormFallback() {
  return <section className="booking-content"><p>Loading appointment options…</p></section>;
}

export default async function BookAppointmentPage({ searchParams }: { searchParams?: Promise<{ doctor?: string }> }) {
  const params = await searchParams;
  return (
    <>
      <PublicNav />
      <main className="wrap page-shell">
        <Suspense fallback={<BookingFormFallback />}>
          <PublicBookingForm requestedDoctorId={params?.doctor ?? ""} />
        </Suspense>
      </main>
    </>
  );
}