"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { AuthSide } from "@/components/auth/AuthSide";
import { MultiSelect } from "@/components/auth/MultiSelect";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { post } from "@/lib/api";
import { ROLES } from "@/lib/roles";
import { strengthScore, validEmail, validPhone } from "@/lib/validate";

export default function StaffRegister() {
  const router = useRouter();
  const [f, setF] = useState({ name: "", employeeId: "", email: "", phone: "", password: "", confirm: "" });
  const [roles, setRoles] = useState<string[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: string[] = [];
    if (f.name.trim().length < 3) errs.push("Enter your full name.");
    if (!/^[A-Za-z]{2,5}-?\d{2,6}$/.test(f.employeeId.trim())) errs.push("Enter a valid employee ID (e.g. EMP-0123).");
    if (!validEmail(f.email)) errs.push("Enter a valid work email.");
    if (!validPhone(f.phone)) errs.push("Enter a valid 10-digit mobile number.");
    if (!roles.length) errs.push("Select at least one role.");
    if (strengthScore(f.password) < 3) errs.push("Password is too weak.");
    if (f.password !== f.confirm) errs.push("Passwords do not match.");
    setErrors(errs);
    if (errs.length) return window.scrollTo(0, 0);
    setBusy(true);
    try {
      await post("/auth/staff/register", { name: f.name, employeeId: f.employeeId, email: f.email, phone: f.phone, roles, password: f.password });
      router.push("/staff/login?registered=1");
    } catch (err) {
      setErrors([err instanceof Error ? err.message : "Registration failed."]);
      window.scrollTo(0, 0);
    } finally { setBusy(false); }
  }

  return (
    <div className="authpage">
      <AuthSide staff />
      <div className="authmain">
        <form className="authbox" onSubmit={submit} noValidate>
          <span className="tag">HMS · Staff only</span>
          <h1>Request staff access</h1>
          <p className="sub">Choose every role you need. An administrator must approve before you can sign in.</p>
          {errors.length > 0 && <div className="msg err" role="alert">{errors.map((x) => <div key={x}>{x}</div>)}</div>}
          <div className="row2">
            <div><label className="l" htmlFor="name">Full name</label>
              <input className="inp" id="name" autoComplete="name" value={f.name} onChange={(e) => set("name")(e.target.value)} /></div>
            <div><label className="l" htmlFor="emp">Employee ID</label>
              <input className="inp" id="emp" placeholder="EMP-0123" value={f.employeeId} onChange={(e) => set("employeeId")(e.target.value)} /></div>
          </div>
          <div className="row2">
            <div><label className="l" htmlFor="email">Work email</label>
              <input className="inp" id="email" type="email" autoComplete="email" value={f.email} onChange={(e) => set("email")(e.target.value)} /></div>
            <div><label className="l" htmlFor="phone">Mobile</label>
              <input className="inp" id="phone" inputMode="numeric" placeholder="98XXXXXXXX" value={f.phone} onChange={(e) => set("phone")(e.target.value)} /></div>
          </div>
          <label className="l">Roles (select one or more)</label>
          <MultiSelect options={ROLES} value={roles} onChange={setRoles} placeholder="Select roles…" />
          <PasswordInput id="pw" label="Password" value={f.password} onChange={set("password")} autoComplete="new-password" placeholder="Create a password" showStrength />
          <PasswordInput id="pw2" label="Confirm password" value={f.confirm} onChange={set("confirm")} autoComplete="new-password" placeholder="Repeat password" />
          <button className="btn" style={{ width: "100%", marginTop: 18 }} disabled={busy}>{busy ? "Submitting…" : "Submit for approval"}</button>
          <div className="alt">Already approved? <Link href="/staff/login">Sign in</Link></div>
        </form>
      </div>
    </div>
  );
}
