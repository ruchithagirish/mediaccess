import Link from "next/link";
import { PublicFooter } from "@/components/PublicFooter";
import { PublicNav } from "@/components/PublicNav";

const portfolio = [
  {
    id: "pharmaceuticals",
    number: "01",
    category: "Pharmaceuticals & generics",
    title: "Trusted formulations for everyday care.",
    description: "A portfolio direction for cost-conscious generic medicines across common therapeutic needs. Product availability and approved indications vary by market.",
    products: ["Generic formulations", "Prescription medicines", "Everyday health essentials"],
    tone: "green",
  },
  {
    id: "wellness",
    number: "02",
    category: "Wellness & nutrition",
    title: "Daily nutrition, made more accessible.",
    description: "Wellness products and nutrition support designed for everyday routines. The exact ingredients and nutrient profile must be checked on each approved pack.",
    products: ["ValuNut wellness range", "Nutrition powders", "Daily health supplements"],
    tone: "lime",
  },
  {
    id: "otc-specialty",
    number: "03",
    category: "OTC & specialty care",
    title: "Useful essentials for home and personal care.",
    description: "Over-the-counter essentials, personal care, and diagnostic products with clear, pack-specific directions for use.",
    products: ["Prega Search home test", "Diagnostic essentials", "Personal and skin care"],
    tone: "coral",
  },
];

export default function ProductsPage() {
  return (
    <div className="market-site">
      <PublicNav />
      <main>
        <section className="market-page-hero">
          <div className="market-container">
            <span className="market-eyebrow">Product portfolio</span>
            <h1>Everyday health essentials, thoughtfully within reach.</h1>
            <p>Explore a growing range across pharmaceuticals, wellness, nutrition, and specialty care. Product formulas and availability are market-specific.</p>
          </div>
        </section>

        <section className="market-container market-catalog" aria-label="Product categories">
          {portfolio.map((category) => (
            <article className={`market-category ${category.tone}`} id={category.id} key={category.id}>
              <div className="market-category-head">
                <span className="market-number">{category.number}</span>
                <div><span className="market-eyebrow">{category.category}</span><h2>{category.title}</h2><p>{category.description}</p></div>
              </div>
              <div className="market-category-products">
                {category.products.map((product) => <span key={product}>{product}</span>)}
              </div>
            </article>
          ))}
        </section>

        <section className="market-product-detail-band">
          <div className="market-container market-product-details">
            <div>
              <span className="market-eyebrow">Featured examples</span>
              <h2>Clear information belongs with every product.</h2>
              <p>ValuNut and Prega Search are portfolio examples, not substitutes for the product label. Confirm the exact variant, composition, intended use, directions, and warnings on the pack supplied in your region.</p>
            </div>
            <div className="market-detail-list">
              <article><h3>ValuNut</h3><dl><div><dt>Ingredients</dt><dd>Refer to the nutrient panel for the specific variant.</dd></div><div><dt>Use</dt><dd>Follow the approved pack directions; consult a professional for individualized advice.</dd></div></dl></article>
              <article><h3>Prega Search</h3><dl><div><dt>Product details</dt><dd>Confirm the included components and test instructions on the package.</dd></div><div><dt>Safety</dt><dd>Follow the instructions exactly and discuss results or concerns with a qualified healthcare professional.</dd></div></dl></article>
            </div>
          </div>
        </section>

        <section className="market-container market-disclaimer-panel">
          <strong>Important safety information</strong>
          <p>Product descriptions are general and do not diagnose, treat, cure, or prevent any disease. Never start, stop, or change a medicine or supplement without advice from a qualified healthcare professional. Always read the product label and patient information leaflet.</p>
          <Link className="market-text-link" href="/quality">How we approach quality and safety <span aria-hidden="true">→</span></Link>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
