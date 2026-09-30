import Link from "next/link";
import { PublicFooter } from "@/components/public/PublicFooter";
import { PublicNav } from "@/components/public/PublicNav";

const partnerTypes = [
  { title: "Distributors", copy: "Connect regional supply capabilities with a considered portfolio of everyday healthcare products." },
  { title: "Pharmacies & retailers", copy: "Explore products and availability for your local customers, supported by clear product information." },
  { title: "Healthcare professionals", copy: "Request product documentation and share feedback that helps us improve how we serve care teams." },
];

export default function PartnersPage() {
  return (
    <div className="market-site">
      <PublicNav />
      <main>
        <section className="market-page-hero market-partner-hero">
          <div className="market-container">
            <span className="market-eyebrow">Partner network</span>
            <h1>Better access is built together.</h1>
            <p>We welcome conversations with distribution partners, pharmacies, retailers, and healthcare professionals across India and international markets.</p>
            <Link className="market-button market-button-primary" href="/contact-us?topic=partnership">Start a partnership enquiry</Link>
          </div>
        </section>
        <section className="market-container market-partner-types">
          <div className="market-section-heading"><span className="market-eyebrow">Who we work with</span><h2>Different strengths. A shared commitment to access.</h2></div>
          <div className="market-partner-grid">
            {partnerTypes.map((item, index) => <article key={item.title}><span>0{index + 1}</span><h3>{item.title}</h3><p>{item.copy}</p></article>)}
          </div>
        </section>
        <section className="market-partner-band">
          <div className="market-container market-partner-band-inner"><div><span className="market-eyebrow">Grow with Mediaccess</span><h2>Let us understand your market and goals.</h2></div><div><p>Tell us where you operate, which categories interest you, and how we can get in touch. Our team can follow up with current product and distribution information.</p><Link className="market-button market-button-dark" href="/contact-us?topic=partnership">Contact the partner team</Link></div></div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
