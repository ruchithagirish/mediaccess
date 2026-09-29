import { PublicFooter } from "@/components/PublicFooter";
import { PublicNav } from "@/components/PublicNav";

export default function PrivacyPolicyPage() {
  return (
    <div className="market-site">
      <PublicNav />
      <main className="market-container market-legal-page">
        <span className="market-eyebrow">Legal</span>
        <h1>Privacy policy</h1>
        <p className="market-legal-notice">This draft describes a general privacy approach and must be reviewed against Mediaccess's actual data practices before publication.</p>
        <h2>Information you provide</h2><p>If you contact Mediaccess, information you choose to share may be used to respond to your enquiry and maintain business communications. Do not submit sensitive medical information through a general contact form.</p>
        <h2>Website activity</h2><p>Technical data such as browser type, device details, and pages visited may be processed to operate, secure, and improve the website, subject to applicable law and the site's configured analytics.</p>
        <h2>Sharing and retention</h2><p>Personal information should only be shared with service providers or other parties when necessary, protected appropriately, and retained only as required for the stated purpose or by law.</p>
        <h2>Your choices</h2><p>Before this policy goes live, add the verified privacy contact, retention periods, applicable jurisdiction, and instructions for access, correction, or deletion requests.</p>
      </main>
      <PublicFooter />
    </div>
  );
}
