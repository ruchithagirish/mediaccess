import Link from "next/link";
import { PublicNav } from "@/components/PublicNav";

const specialties: [string, string][] = [
  ["Cardiology", "Heart care, ECG, echo, cath lab"],
  ["Neurology", "Stroke, epilepsy, headache clinic"],
  ["ENT", "Audiology and head-and-neck surgery"],
  ["Orthopaedics", "Joint replacement and sports injury"],
  ["Paediatrics", "Newborn to adolescent care"],
  ["Gynaecology", "Maternity and women's health"],
];
const doctors: [string, string, string][] = [
  ["Dr. Arjun Nair", "Cardiology", "MD, DM · 14 yrs"],
  ["Dr. Sana Khan", "Neurology", "MD, DM · 11 yrs"],
  ["Dr. Vikram Rao", "ENT", "MS · 9 yrs"],
  ["Dr. Lakshmi P.", "Paediatrics", "MD · 16 yrs"],
];

export default function Home() {
  return (
    <>
      <PublicNav />
      <section className="hero">
        <div className="wrap">
          <h1>Modern hospital care, one click from home.</h1>
          <p>Book appointments, view prescriptions and download reports from one secure patient account.</p>
          <Link className="btn" href="/register">Create a patient account</Link>{" "}
          <Link className="btn ghost" href="/login">I already have an account</Link>
        </div>
      </section>
      <div className="wrap">
        <section className="sec">
          <h2>Specialties</h2>
          <div className="grid g3">
            {specialties.map(([t, d]) => <div className="card" key={t}><h3>{t}</h3><p>{d}</p></div>)}
          </div>
        </section>
        <section className="sec">
          <h2>Our doctors</h2>
          <div className="grid g4">
            {doctors.map(([n, s, q]) => (
              <div className="card" key={n}>
                <div className="av">{n.split(" ").pop()![0]}</div>
                <h3>{n}</h3><p>{s}</p><p>{q}</p>
              </div>
            ))}
          </div>
        </section>
        <div className="foot">© MediAccess. Replace these static lists with CMS-driven content (Sanity/Strapi) as per the master spec.</div>
      </div>
    </>
  );
}
