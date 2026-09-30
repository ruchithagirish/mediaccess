import Link from "next/link";
import { PublicNav } from "@/components/public/PublicNav";
import { sanityQuery } from "@/lib/sanity";

interface HomePageContent {
  heroTitle: string;
  heroSummary: string;
  specialtiesHeading: string;
  doctorsHeading: string;
}

interface SpecialtyContent {
  name: string;
  slug: string;
  description: string;
}

interface DoctorContent {
  name: string;
  slug: string;
  focus: string | null;
  specialties: { name: string; slug: string }[];
}

const homeQuery = `*[_type == "homePage" && defined(publishedAt)][0] {
  heroTitle,
  heroSummary,
  specialtiesHeading,
  doctorsHeading
}`;
const specialtiesQuery = `*[_type == "specialty" && defined(publishedAt)] | order(name asc) [0...6] {
  name,
  "slug": slug.current,
  description
}`;
const doctorsQuery = `*[_type == "doctor" && defined(publishedAt)] | order(name asc) [0...4] {
  name,
  "slug": slug.current,
  focus,
  specialties[]->{name, "slug": slug.current}
}`;

export default async function Home() {
  const [home, specialties, doctors] = await Promise.all([
    sanityQuery<HomePageContent | null>(homeQuery, null),
    sanityQuery<SpecialtyContent[]>(specialtiesQuery, []),
    sanityQuery<DoctorContent[]>(doctorsQuery, []),
  ]);

  return (
    <>
      <PublicNav />
      <section className="hero">
        <div className="wrap">
          <h1>{home?.heroTitle ?? "Modern hospital care, one click from home."}</h1>
          <p>{home?.heroSummary ?? "Find a specialist and book a time that works for you."}</p>
          <Link className="btn" href="/book-appointment">Book an appointment</Link>{" "}
          <Link className="btn ghost" href="/doctors">Find a doctor</Link>
        </div>
      </section>
      <div className="wrap">
        <section className="sec">
          <h2>{home?.specialtiesHeading ?? "Specialties"}</h2>
          <div className="grid g3">
            {specialties.map((specialty) => <div className="card" key={specialty.slug}>
              <h3>{specialty.name}</h3><p>{specialty.description}</p>
              <Link className="btn ghost sm" href={`/doctors?specialty=${encodeURIComponent(specialty.slug)}`}>Find a doctor</Link>
            </div>)}
            {specialties.length === 0 && <p>Specialty information is being updated.</p>}
          </div>
        </section>
        <section className="sec">
          <h2>{home?.doctorsHeading ?? "Our doctors"}</h2>
          <div className="grid g4">
            {doctors.map((doctor) => (
              <div className="card" key={doctor.slug}>
                <div className="av">{doctor.name.split(" ").at(-1)?.[0] ?? "D"}</div>
                <h3>{doctor.name}</h3><p>{doctor.specialties.map((item) => item.name).join(", ")}</p>
                {doctor.focus && <p>{doctor.focus}</p>}
                <Link className="btn ghost sm" href="/doctors">View doctors</Link>
              </div>
            ))}
            {doctors.length === 0 && <p>Doctor profiles are being updated.</p>}
          </div>
        </section>
        <div className="foot">© MediAccess</div>
      </div>
    </>
  );
}
