"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { AuthSide } from "@/components/AuthSide";
import { PasswordInput } from "@/components/PasswordInput";
import { post } from "@/lib/api";
import { strengthScore, validEmail, validPhone } from "@/lib/validate";

export default function PatientRegister() {
  const router = useRouter();
  const [f, setF] = useState({ name: "", phone: "", dob: "", email: "", password: "", confirm: "" });
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: string[] = [];
    if (f.name.trim().length < 3) errs.push("Enter your full name.");
    if (!validPhone(f.phone)) errs.push("Enter a valid 10-digit Indian mobile number.");
    if (!f.dob) errs.push("Select your date of birth.");
    if (!validEmail(f.email)) errs.push("Enter a valid email address.");
    if (strengthScore(f.password) < 3) errs.push("Password is too weak.");
    if (f.password !== f.confirm) errs.push("Passwords do not match.");
    if (!consent) errs.push("Please accept the consent to continue.");
    setErrors(errs);
    if (errs.length) return window.scrollTo(0, 0);
    setBusy(true);
    try {
      await post("/auth/patient/register", { name: f.name, phone: f.phone, dob: f.dob, email: f.email, password: f.password, consent });
      router.push("/login?registered=1");
    } catch (err) {
      setErrors([err instanceof Error ? err.message : "Registration failed."]);
      window.scrollTo(0, 0);
    } finally { setBusy(false); }
  }

  return (
    <div className="authpage">
      <AuthSide />
      <div className="authmain">
        <form className="authbox" onSubmit={submit} noValidate>
          <span className="tag">Patient portal</span>
          <h1>Create your account</h1>
          <p className="sub">Takes a minute. No staff approval needed for patients.</p>
          {errors.length > 0 && <div className="msg err" role="alert">{errors.map((x) => <div key={x}>{x}</div>)}</div>}
          <label className="l" htmlFor="name">Full name</label>
          <input className="inp" id="name" autoComplete="name" value={f.name} onChange={(e) => set("name")(e.target.value)} />
          <div className="row2">
            <div>
              <label className="l" htmlFor="phone">Mobile number</label>
              <input className="inp" id="phone" inputMode="numeric" autoComplete="tel" placeholder="98XXXXXXXX" value={f.phone} onChange={(e) => set("phone")(e.target.value)} />
            </div>
            <div>
              <label className="l" htmlFor="dob">Date of birth</label>
              <input className="inp" id="dob" type="date" value={f.dob} onChange={(e) => set("dob")(e.target.value)} />
            </div>
          </div>
          <label className="l" htmlFor="email">Email</label>
          <input className="inp" id="email" type="email" autoComplete="email" value={f.email} onChange={(e) => set("email")(e.target.value)} />
          <PasswordInput id="pw" label="Password" value={f.password} onChange={set("password")} autoComplete="new-password" placeholder="Create a password" showStrength />
          <PasswordInput id="pw2" label="Confirm password" value={f.confirm} onChange={set("confirm")} autoComplete="new-password" placeholder="Repeat password" />
          <label style={{ display: "flex", gap: 8, marginTop: 14, fontSize: 13.5 }}>
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            I agree to the Terms and consent to processing of my health data under the DPDP Act.
          </label>
          <button className="btn" style={{ width: "100%", marginTop: 16 }} disabled={busy}>{busy ? "Creating…" : "Create account"}</button>
          <div className="alt">Already registered? <Link href="/login">Log in</Link></div>
        </form>
      </div>
    </div>
  );
}
