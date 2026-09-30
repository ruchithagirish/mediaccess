"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { DoctorOption } from "@/lib/appointments";

interface DoctorProfileContent {
  name: string;
  slug: string;
  operationalDoctorId: string;
  gender: string | null;
  languages: string[];
  specialties: { name: string; slug: string }[];
  experience: string | null;
  focus: string | null;
}

function clinicDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  return `${parts.find((part) => part.type === "year")?.value}-${parts.find((part) => part.type === "month")?.value}-${parts.find((part) => part.type === "day")?.value}`;
}

export function DoctorDirectory({ profiles, initialSpecialty = "" }: { profiles: DoctorProfileContent[]; initialSpecialty?: string }) {
  const [doctors, setDoctors] = useState<DoctorOption[]>([]);
  const [availability, setAvailability] = useState<Record<string, boolean>>({});
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [date, setDate] = useState(clinicDate);
  const [specialty, setSpecialty] = useState(initialSpecialty);
  const [language, setLanguage] = useState("");
  const [gender, setGender] = useState("");
  const [loading, setLoading] = useState(true);
  const [availabilityError, setAvailabilityError] = useState("");

  useEffect(() => {
    let active = true;
    api<{ doctors: DoctorOption[] }>("/doctors")
      .then((result) => { if (active) setDoctors(result.doctors); })
      .catch(() => { if (active) setDoctors([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (doctors.length === 0) return;
    let active = true;
    setCheckingAvailability(true);
    setAvailability({});
    setAvailabilityError("");
    Promise.all(doctors.map(async (doctor) => {
      const result = await api<{ slots: { startTime: string }[] }>(`/doctors/${encodeURIComponent(doctor.id)}/slots?date=${encodeURIComponent(date)}`);
      return [doctor.id, result.slots.length > 0] as const;
    }))
      .then((results) => { if (active) setAvailability(Object.fromEntries(results)); })
      .catch(() => { if (active) setAvailabilityError("Live availability could not be checked."); })
      .finally(() => { if (active) setCheckingAvailability(false); });
    return () => { active = false; };
  }, [date, doctors]);

  const liveDoctorIds = new Set(doctors.map((doctor) => doctor.id));
  const profileData = profiles.filter((profile) => liveDoctorIds.has(profile.operationalDoctorId));
  const languages = [...new Set(profileData.flatMap((profile) => profile.languages))].sort();
  const genders = [...new Set(profileData.flatMap((profile) => profile.gender ? [profile.gender] : []))].sort();
  const filteredProfiles = profileData.filter((profile) =>
    (!specialty || profile.specialties.some((item) => item.slug === specialty)) &&
    (!language || profile.languages.includes(language)) &&
    (!gender || profile.gender === gender) &&
    (availability[profile.operationalDoctorId] ?? true),
  );

  return (
    <>
      <section className="doctor-filters" aria-label="Filter doctors">
        <label className="l">Specialty
          <select className="inp" value={specialty} onChange={(event) => setSpecialty(event.target.value)}>
            <option value="">All specialties</option>
            {[...new Map(profileData.flatMap((profile) => profile.specialties).map((item) => [item.slug, item])).values()]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((item) => <option value={item.slug} key={item.slug}>{item.name}</option>)}
          </select>
        </label>
        <label className="l">Language
          <select className="inp" value={language} onChange={(event) => setLanguage(event.target.value)}>
            <option value="">Any language</option>
            {languages.map((item) => <option value={item} key={item}>{item}</option>)}
          </select>
        </label>
        <label className="l">Gender
          <select className="inp" value={gender} onChange={(event) => setGender(event.target.value)}>
            <option value="">Any gender</option>
            {genders.map((item) => <option value={item} key={item}>{item}</option>)}
          </select>
        </label>
        <label className="l">Available on
          <input className="inp" type="date" min={clinicDate()} value={date} onChange={(event) => setDate(event.target.value)} />
        </label>
      </section>
      {availabilityError && <p className="msg err" role="alert">{availabilityError}</p>}
      {loading ? <p>Loading doctors…</p> : filteredProfiles.length ? (
        <section className="grid g3 doctor-grid">
          {filteredProfiles.map((profile) => (
            <article className="card doctor-card" key={profile.slug}>
              <div className="av large">{profile.name.split(" ").at(-1)?.[0] ?? "D"}</div>
              <h3>{profile.name}</h3>
              <p className="doctor-specialty">{profile.specialties.map((item) => item.name).join(", ")}</p>
              {profile.focus && <p>{profile.focus}</p>}
              <div className="doctor-meta">
                {profile.experience && <span>{profile.experience} experience</span>}
                <span>{checkingAvailability ? "Checking availability…" : availability[profile.operationalDoctorId] === false ? "No slots on this date" : "Slots available"}</span>
                {profile.languages.length > 0 && <span>{profile.languages.join(", ")}</span>}
              </div>
              <Link className="btn" href={`/book-appointment?doctor=${encodeURIComponent(profile.operationalDoctorId)}`}>Book appointment</Link>
            </article>
          ))}
        </section>
      ) : <p>No published doctors match these filters.</p>}
    </>
  );
}