import { PublicFooter } from "@/components/PublicFooter";
import { PublicNav } from "@/components/PublicNav";

export default function TermsPage() {
  return (
    <div className="market-site">
      <PublicNav />
      <main className="market-container market-legal-page">
        <span className="market-eyebrow">Legal</span>
        <h1>Terms & conditions</h1>
        <p className="market-legal-notice">This draft is for website planning and requires legal review and jurisdiction-specific details before publication.</p>
        <h2>Website information</h2><p>Content is provided for general information and does not constitute medical advice, diagnosis, or a recommendation to use a particular product.</p>
        <h2>Product labels and safety</h2><p>Product composition, indications, directions, availability, and regulatory status can vary by product and region. Follow the approved packaging and consult a qualified healthcare professional.</p>
        <h2>Availability and enquiries</h2><p>Product references are illustrative until a current catalogue is confirmed. A website enquiry does not guarantee product availability, supply, or a commercial relationship.</p>
        <h2>Use of this website</h2><p>Do not misuse the website, interfere with its operation, or rely on information that is incomplete or out of date. These terms should be completed with Mediaccess's registered entity, governing law, and formal business conditions.</p>
      </main>
      <PublicFooter />
    </div>
  );
}
