import Link from "next/link";
import { PublicFooter } from "@/components/PublicFooter";
import { PublicNav } from "@/components/PublicNav";

const principles = [
  { number: "01", title: "Responsible sourcing", copy: "Work with qualified manufacturing and supply partners and maintain the documentation needed to assess product provenance." },
  { number: "02", title: "Consistent checks", copy: "Use documented quality controls across sourcing, storage, and distribution, with product-specific requirements guiding each step." },
  { number: "03", title: "Clear product information", copy: "Make approved labels, directions, warnings, and batch information the reference point for every product." },
];

export default function QualityPage() {
  return (
    <div className="market-site">
      <PublicNav />
      <main>
        <section className="market-page-hero market-quality-hero">
          <div className="market-container">
            <span className="market-eyebrow">Quality & compliance</span>
            <h1>Trust is earned in the details.</h1>
            <p>Our quality approach is built around responsible sourcing, documented controls, and transparent product information.</p>
          </div>
        </section>
        <section className="market-container market-principles">
          {principles.map((item) => (
            <article key={item.number}>
              <span>{item.number}</span><h2>{item.title}</h2><p>{item.copy}</p>
            </article>
          ))}
        </section>
        <section className="market-quality-band">
          <div className="market-container market-quality-copy">
            <div><span className="market-eyebrow">Compliance, product by product</span><h2>Standards are specific to the product and market.</h2></div>
            <div><p>Manufacturing licenses, certifications, test records, and regulatory status must be confirmed for the relevant product and market. Ask our team for current documentation before ordering or distribution.</p><p>We do not make a blanket certification claim on this website. Product packaging and approved regulatory documents are the source of truth.</p><Link className="market-button market-button-dark" href="/contact-us">Request product information</Link></div>
          </div>
        </section>
        <section className="market-container market-disclaimer-panel">
          <strong>Health information disclaimer</strong>
          <p>Website content is educational and is not a replacement for a diagnosis or treatment plan. Ask your doctor or pharmacist whether a product is appropriate for you, especially during pregnancy, while breastfeeding, or when taking other medicines.</p>
          <Link className="market-text-link" href="/products">Browse the portfolio <span aria-hidden="true">→</span></Link>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
