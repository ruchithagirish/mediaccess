"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { api, getMe, post } from "@/lib/api";
import type { AppointmentSummary, DoctorOption, SpecialtyOption } from "@/lib/appointments";

function clinicDate(offset = 0) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const date = new Date(Date.UTC(value("year"), value("month") - 1, value("day") + offset));
  return date.toISOString().slice(0, 10);
}

export default function AppointmentBookingPage() {
  const router = useRouter();
  const [specialties, setSpecialties] = useState<SpecialtyOption[]>([]);
  const [doctors, setDoctors] = useState<DoctorOption[]>([]);
  const [slots, setSlots] = useState<{ startTime: string; endTime: string }[]>([]);
  const [specialtyId, setSpecialtyId] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [date, setDate] = useState(() => clinicDate(1));
  const [startTime, setStartTime] = useState("");
  const [reason, setReason] = useState("");
  const [loadingSpecialties, setLoadingSpecialties] = useState(true);
  const [loadingDoctors, setLoadingDoctors] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [booked, setBooked] = useState<AppointmentSummary | null>(null);

  useEffect(() => {
    getMe().catch(() => router.replace("/login"));
    api<{ specialties: SpecialtyOption[] }>("/specialties")
      .then((result) => setSpecialties(result.specialties))
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load specialties."))
      .finally(() => setLoadingSpecialties(false));
  }, [router]);

  useEffect(() => {
    if (!specialtyId) {
      setDoctors([]);
      setDoctorId("");
      return;
    }
    let active = true;
    setLoadingDoctors(true);
    setDoctors([]);
    setDoctorId("");
    setStartTime("");
    api<{ doctors: DoctorOption[] }>(`/doctors?specialty=${encodeURIComponent(specialties.find((item) => item.id === specialtyId)?.slug ?? "")}`)
      .then((result) => { if (active) setDoctors(result.doctors); })
      .catch((err) => { if (active) setError(err instanceof Error ? err.message : "Could not load doctors."); })
      .finally(() => { if (active) setLoadingDoctors(false); });
    return () => { active = false; };
  }, [specialtyId, specialties]);

  useEffect(() => {
    if (!doctorId || !date) {
      setSlots([]);
      setStartTime("");
      return;
    }
    let active = true;
    setLoadingSlots(true);
    setSlots([]);
    setStartTime("");
    api<{ slots: { startTime: string; endTime: string }[] }>(`/doctors/${encodeURIComponent(doctorId)}/slots?date=${encodeURIComponent(date)}`)
      .then((result) => { if (active) setSlots(result.slots); })
      .catch((err) => { if (active) setError(err instanceof Error ? err.message : "Could not load available times."); })
      .finally(() => { if (active) setLoadingSlots(false); });
    return () => { active = false; };
  }, [doctorId, date]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!doctorId || !startTime) return;
    setBusy(true);
    setError("");
    try {
      const result = await post<{ appointment: AppointmentSummary }>("/appointments", { doctorId, date, startTime, reason });
      setBooked(result.appointment);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not book this appointment.");
    } finally {
      setBusy(false);
    }
  }

  const doctor = doctors.find((item) => item.id === doctorId);
  const selectedSlot = slots.find((slot) => slot.startTime === startTime);

  return (
    <main className="wrap booking-page">
      <div className="top">
        <Link className="logo" href="/portal"><i>+</i>MediAccess</Link>
        <Link className="btn ghost sm" href="/portal">My portal</Link>
      </div>
      <section className="booking-content">
        <p className="tag">Patient portal</p>
        <h1>{booked ? "Appointment confirmed" : "Book an appointment"}</h1>
        {booked ? (
          <div className="booking-confirmation" role="status">
            <h2>{booked.doctor.name}</h2>
            <p>{booked.doctor.specialties.map((item) => item.name).join(", ")}</p>
            <p>{booked.date} at {booked.startTime}</p>
            <p>Booking reference: {booked.id}</p>
            <Link className="btn" href="/portal">View my appointments</Link>
          </div>
        ) : (
          <form className="booking-form" onSubmit={submit}>
            {error && <div className="msg err" role="alert">{error}</div>}
            <label className="l" htmlFor="specialty">1. Specialty</label>
            <select className="inp" id="specialty" value={specialtyId} onChange={(event) => { setSpecialtyId(event.target.value); setError(""); }} disabled={loadingSpecialties}>
              <option value="">{loadingSpecialties ? "Loading specialties…" : "Choose a specialty"}</option>
              {specialties.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
            </select>

            <label className="l" htmlFor="doctor">2. Doctor</label>
            <select className="inp" id="doctor" value={doctorId} onChange={(event) => { setDoctorId(event.target.value); setError(""); }} disabled={!specialtyId || loadingDoctors}>
              <option value="">{loadingDoctors ? "Loading doctors…" : "Choose a doctor"}</option>
              {doctors.map((item) => <option value={item.id} key={item.id}>{item.name} · {item.consultationMinutes} min</option>)}
            </select>
            {specialtyId && !loadingDoctors && doctors.length === 0 && <p className="booking-hint">No bookable doctors are listed for this specialty.</p>}

            <label className="l" htmlFor="date">3. Date</label>
            <input className="inp" id="date" type="date" min={clinicDate()} value={date} onChange={(event) => { setDate(event.target.value); setError(""); }} disabled={!doctorId} />

            <fieldset className="slot-fieldset" disabled={!doctorId}>
              <legend className="l">4. Available time</legend>
              {loadingSlots ? <p className="booking-hint">Checking availability…</p> : slots.length === 0 ? (
                <p className="booking-hint">{doctorId ? "No times available on this date. Choose another date." : "Choose a doctor to see available times."}</p>
              ) : (
                <div className="slot-options">
                  {slots.map((slot) => (
                    <button type="button" key={slot.startTime} aria-pressed={startTime === slot.startTime} className={`slot-option ${startTime === slot.startTime ? "selected" : ""}`} onClick={() => setStartTime(slot.startTime)}>
                      {slot.startTime}
                    </button>
                  ))}
                </div>
              )}
            </fieldset>

            <label className="l" htmlFor="reason">Reason for visit <span className="booking-hint">Optional</span></label>
            <textarea className="inp booking-reason" id="reason" maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Briefly describe what you need help with" />

            {doctor && selectedSlot && <p className="booking-summary">{doctor.name} · {date} · {selectedSlot.startTime}–{selectedSlot.endTime}</p>}
            <button className="btn" disabled={!doctor || !selectedSlot || busy || loadingSlots}>
              {busy ? "Confirming…" : "Confirm appointment"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}