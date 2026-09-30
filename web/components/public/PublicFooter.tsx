import Link from "next/link";

export function PublicFooter() {
  return (
    <footer className="market-footer">
      <div className="market-container market-footer-main">
        <div className="market-footer-brand">
          <Link className="market-footer-logo" href="/">Mediaccess<span>.</span></Link>
          <p>Healthcare essentials, wellness, and pharmaceutical products shaped around everyday access.</p>
        </div>
        <div>
          <h2>Explore</h2>
          <Link href="/products">Product portfolio</Link>
          <Link href="/quality">Quality & safety</Link>
          <Link href="/partners">Partner network</Link>
        </div>
        <div>
          <h2>Company</h2>
          <Link href="/about-us">About Mediaccess</Link>
          <Link href="/contact-us">Contact & support</Link>
          <Link href="/staff/login">Staff login</Link>
        </div>
      </div>
      <div className="market-container market-footer-bottom">
        <p>© 2026 Mediaccess. All rights reserved.</p>
        <div><Link href="/privacy-policy">Privacy policy</Link><Link href="/terms">Terms & conditions</Link></div>
      </div>
      <p className="market-container market-footer-note">Product information is for general education only. It is not medical advice. Always read the approved product label and consult a qualified healthcare professional.</p>
    </footer>
  );
}
