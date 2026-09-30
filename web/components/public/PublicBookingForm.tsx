"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { api, post } from "@/lib/api";
import type { AppointmentSummary, DoctorOption, SpecialtyOption } from "@/lib/appointments";

function clinicDate(offset = 0) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return new Date(Date.UTC(value("year"), value("month") - 1, value("day") + offset)).toISOString().slice(0, 10);
}

export function PublicBookingForm({ requestedDoctorId = "" }: { requestedDoctorId?: string }) {
  const [specialties, setSpecialties] = useState<SpecialtyOption[]>([]);
  const [doctors, setDoctors] = useState<DoctorOption[]>([]);
  const [slots, setSlots] = useState<{ startTime: string; endTime: string }[]>([]);
  const [specialtyId, setSpecialtyId] = useState("");
  const [doctorId, setDoctorId] = useState(requestedDoctorId);
  const [date, setDate] = useState(() => clinicDate(1));
  const [startTime, setStartTime] = useState("");
  const [details, setDetails] = useState({ name: "", phone: "", email: "", dob: "", reason: "", password: "" });
  const [consent, setConsent] = useState(false);
  const [verificationId, setVerificationId] = useState("");
  const [code, setCode] = useState("");
  const [developmentCode, setDevelopmentCode] = useState("");
  const [booked, setBooked] = useState<AppointmentSummary | null>(null);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([
      api<{ specialties: SpecialtyOption[] }>("/specialties"),
      api<{ doctors: DoctorOption[] }>("/doctors"),
    ])
      .then(([specialtyResult, doctorResult]) => {
        if (!active) return;
        setSpecialties(specialtyResult.specialties);
        setDoctors(doctorResult.doctors);
        if (requestedDoctorId) {
          const doctor = doctorResult.doctors.find((item) => item.id === requestedDoctorId);
          if (doctor) {
            setDoctorId(doctor.id);
            setSpecialtyId(doctor.specialties[0]?.id ?? "");
          }
        }
      })
      .catch((requestError) => { if (active) setError(requestError instanceof Error ? requestError.message : "Could not load the booking catalog."); })
      .finally(() => { if (active) setLoadingCatalog(false); });
    return () => { active = false; };
  }, [requestedDoctorId]);

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
      .catch((requestError) => { if (active) setError(requestError instanceof Error ? requestError.message : "Could not check available times."); })
      .finally(() => { if (active) setLoadingSlots(false); });
    return () => { active = false; };
  }, [doctorId, date]);

  const doctorsForSpecialty = doctors.filter((doctor) => !specialtyId || doctor.specialties.some((item) => item.id === specialtyId));
  const doctor = doctors.find((item) => item.id === doctorId);
  const selectedSlot = slots.find((slot) => slot.startTime === startTime);

  function updateDetail(field: keyof typeof details, value: string) {
    setDetails((current) => ({ ...current, [field]: value }));
  }

  async function requestCode(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await post<{ verificationId: string; developmentCode?: string }>("/public-bookings/otp", {
        name: details.name,
        phone: details.phone,
        email: details.email,
        dob: details.dob,
        doctorId,
        date,
        startTime,
        reason: details.reason,
      });
      setVerificationId(result.verificationId);
      setDevelopmentCode(result.developmentCode ?? "");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not send a verification code.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmBooking(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await post<{ appointment: AppointmentSummary }>("/public-bookings/confirm", {
        verificationId,
        code,
        password: details.password,
        consent,
      });
      setBooked(result.appointment);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not confirm this appointment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="booking-content">
        <p className="tag">Appointment booking</p>
        <h1>{booked ? "Appointment confirmed" : verificationId ? "Verify your mobile" : "Book an appointment"}</h1>
        {error && <div className="msg err" role="alert">{error}</div>}
        {booked ? (
          <div className="booking-confirmation" role="status">
            <h2>{booked.doctor.name}</h2>
            <p>{booked.doctor.specialties.map((item) => item.name).join(", ")}</p>
            <p>{booked.date} at {booked.startTime}</p>
            <p>Booking reference: {booked.id}</p>
            <Link className="btn" href="/portal">Open patient portal</Link>
          </div>
        ) : verificationId ? (
          <form className="booking-form" onSubmit={confirmBooking}>
            <p>Enter the six-digit code sent to {details.phone}.</p>
            {developmentCode && <p className="booking-hint">Development verification code: <strong>{developmentCode}</strong></p>}
            <label className="l" htmlFor="otp-code">Verification code</label>
            <input className="inp" id="otp-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} required />
            <label className="l" htmlFor="account-password">Create portal password</label>
            <input className="inp" id="account-password" type="password" autoComplete="new-password" minLength={8} value={details.password} onChange={(event) => updateDetail("password", event.target.value)} required />
            <p className="booking-hint">Use upper and lower case letters, a number, and a symbol.</p>
            <label className="booking-consent">
              <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} required />
              I agree to the Terms and consent to processing of my health data under the DPDP Act.
            </label>
            <button className="btn" disabled={busy || !consent}>{busy ? "Confirming…" : "Verify and book"}</button>
            <button className="btn ghost" type="button" onClick={() => { setVerificationId(""); setCode(""); setDevelopmentCode(""); }}>Change appointment details</button>
          </form>
        ) : (
          <form className="booking-form" onSubmit={requestCode}>
            <label className="l" htmlFor="specialty">1. Specialty</label>
            <select className="inp" id="specialty" value={specialtyId} onChange={(event) => { setSpecialtyId(event.target.value); setDoctorId(""); }} disabled={loadingCatalog}>
              <option value="">{loadingCatalog ? "Loading specialties…" : "Choose a specialty"}</option>
              {specialties.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
            </select>

            <label className="l" htmlFor="doctor">2. Doctor</label>
            <select className="inp" id="doctor" value={doctorId} onChange={(event) => setDoctorId(event.target.value)} disabled={loadingCatalog} required>
              <option value="">Choose a doctor</option>
              {doctorsForSpecialty.map((item) => <option value={item.id} key={item.id}>{item.name} · {item.consultationMinutes} min</option>)}
            </select>

            <label className="l" htmlFor="date">3. Date</label>
            <input className="inp" id="date" type="date" min={clinicDate()} value={date} onChange={(event) => setDate(event.target.value)} disabled={!doctorId} />

            <fieldset className="slot-fieldset" disabled={!doctorId}>
              <legend className="l">4. Available time</legend>
              {loadingSlots ? <p className="booking-hint">Checking live availability…</p> : slots.length ? (
                <div className="slot-options">
                  {slots.map((slot) => <button type="button" key={slot.startTime} aria-pressed={startTime === slot.startTime} className={`slot-option ${startTime === slot.startTime ? "selected" : ""}`} onClick={() => setStartTime(slot.startTime)}>{slot.startTime}</button>)}
                </div>
              ) : <p className="booking-hint">{doctorId ? "No times available. Choose another date." : "Choose a doctor to see times."}</p>}
            </fieldset>

            <label className="l" htmlFor="name">Full name</label>
            <input className="inp" id="name" autoComplete="name" minLength={3} maxLength={100} value={details.name} onChange={(event) => updateDetail("name", event.target.value)} required />
            <label className="l" htmlFor="phone">Mobile number</label>
            <input className="inp" id="phone" inputMode="tel" autoComplete="tel" value={details.phone} onChange={(event) => updateDetail("phone", event.target.value)} required />
            <label className="l" htmlFor="email">Email</label>
            <input className="inp" id="email" type="email" autoComplete="email" value={details.email} onChange={(event) => updateDetail("email", event.target.value)} required />
            <label className="l" htmlFor="dob">Date of birth</label>
            <input className="inp" id="dob" type="date" max={clinicDate()} value={details.dob} onChange={(event) => updateDetail("dob", event.target.value)} required />
            <label className="l" htmlFor="reason">Reason for visit <span className="booking-hint">Optional</span></label>
            <textarea className="inp booking-reason" id="reason" maxLength={500} value={details.reason} onChange={(event) => updateDetail("reason", event.target.value)} />
            {doctor && selectedSlot && <p className="booking-summary">{doctor.name} · {date} · {selectedSlot.startTime}–{selectedSlot.endTime}</p>}
            <button className="btn" disabled={busy || !doctor || !selectedSlot}>{busy ? "Sending code…" : "Send verification code"}</button>
          </form>
        )}
      </section>
    </>
  );
}