import Link from "next/link";
import { PublicNav } from "@/components/public/PublicNav";
import { sanityQuery } from "@/lib/sanity";

interface SpecialtyContent {
  name: string;
  slug: string;
  description: string;
}

const specialtiesQuery = `*[_type == "specialty" && defined(publishedAt)] | order(name asc) {
  name,
  "slug": slug.current,
  description
}`;

export default async function SpecialtiesPage() {
  const specialties = await sanityQuery<SpecialtyContent[]>(specialtiesQuery, []);

  return (
    <>
      <PublicNav />
      <main className="wrap page-shell">
        <section className="page-hero">
          <span className="tag">Specialties</span>
          <h1>Care pathways designed around your health goals.</h1>
          <p>
            MediAccess brings together multidisciplinary expertise so patients can access the right care, at the right time,
            from trusted specialists.
          </p>
        </section>

        <section className="sec">
          {specialties.length > 0 ? <div className="grid g3">
            {specialties.map((specialty) => (
              <article className="card feature-card" key={specialty.name}>
                <h3>{specialty.name}</h3>
                <p>{specialty.description}</p>
                <Link className="btn ghost sm" href={`/doctors?specialty=${encodeURIComponent(specialty.slug)}`}>
                  Find a doctor
                </Link>
              </article>
            ))}
          </div> : <p>Specialty information is being updated. Please check back soon.</p>}
        </section>

        <section className="info-panel">
          <div>
            <h2>Why patients choose MediAccess</h2>
            <p>
              We focus on fast triage, transparent treatment planning, and seamless communication between specialists,
              nurses, and your primary physician.
            </p>
          </div>
          <div className="mini-list">
            <div><strong>Fast booking</strong><span>Choose a preferred specialist and time slot.</span></div>
            <div><strong>Digital records</strong><span>See referrals, prescriptions, and reports in one place.</span></div>
            <div><strong>Coordinated care</strong><span>Move between departments without repeating your story.</span></div>
          </div>
        </section>

        <div className="cta-strip">
          <h3>Ready to schedule a consultation?</h3>
          <Link className="btn" href="/book-appointment">Book an appointment</Link>
        </div>
      </main>
    </>
  );
}
