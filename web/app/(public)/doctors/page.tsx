import { PublicNav } from "@/components/public/PublicNav";
import { DoctorDirectory } from "@/components/public/DoctorDirectory";
import { sanityQuery } from "@/lib/sanity";

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

const doctorsQuery = `*[_type == "doctor" && defined(publishedAt)] | order(name asc) {
  name,
  "slug": slug.current,
  operationalDoctorId,
  gender,
  languages,
  specialties[]->{name, "slug": slug.current},
  experience,
  focus
}`;

export default async function DoctorsPage({ searchParams }: { searchParams?: Promise<{ specialty?: string }> }) {
  const params = await searchParams;
  const profiles = await sanityQuery<DoctorProfileContent[]>(doctorsQuery, []);

  return (
    <>
      <PublicNav />
      <main className="wrap page-shell">
        <section className="page-hero">
          <span className="tag">Doctors</span>
          <h1>Meet the clinicians guiding your care journey.</h1>
          <p>
            Our physicians combine clinical excellence with clear communication, collaborative planning, and patient-centered treatment.
          </p>
        </section>

        <DoctorDirectory profiles={profiles} initialSpecialty={params?.specialty ?? ""} />

        <section className="info-panel compact">
          <div>
            <h2>What you can expect</h2>
            <p>
              Each consultation is designed to be respectful, efficient, and well informed by your medical history and care goals.
            </p>
          </div>
          <ul className="check-list">
            <li>Evidence-based consultation plans</li>
            <li>Clear follow-up recommendations</li>
            <li>Secure digital access to reports and prescriptions</li>
          </ul>
        </section>

        <div className="cta-strip">
          <h3>Find the right doctor for your next visit.</h3>
          <a className="btn" href="/book-appointment">Book appointment</a>
        </div>
      </main>
    </>
  );
}
