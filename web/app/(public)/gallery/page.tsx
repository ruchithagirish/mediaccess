import Link from "next/link";
import { PublicNav } from "@/components/public/PublicNav";

const images = [
  "Modern patient care spaces",
  "Clinical consultation suites",
  "Wellness and rehabilitation environment",
  "Care team and community health activities",
];

export default function GalleryPage() {
  return (
    <>
      <PublicNav />
      <main className="wrap page-shell">
        <section className="page-hero">
          <span className="tag">Gallery</span>
          <h1>A look inside our care environment and community work.</h1>
          <p>Explore highlights from our facilities, patient spaces, wellness events, and care partnerships.</p>
        </section>

        <section className="grid g2">
          {images.map((image) => (
            <article className="card" key={image}>
              <h3>{image}</h3>
              <p>Designed to support comfort, safety, and confident care experiences for every patient and family we serve.</p>
            </article>
          ))}
        </section>

        <section className="info-panel compact">
          <div>
            <h2>Built for people</h2>
            <p>Our spaces are designed to feel welcoming, organized, and reassuring for patients, families, and clinical teams.</p>
          </div>
          <ul className="check-list">
            <li>Accessible waiting areas</li>
            <li>Comfortable consultation rooms</li>
            <li>Community wellness spaces</li>
          </ul>
        </section>

        <div className="cta-strip">
          <h3>Visit us in person.</h3>
          <Link className="btn" href="/contact-us">Plan your visit</Link>
        </div>
      </main>
    </>
  );
}
