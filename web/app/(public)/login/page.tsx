"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { AuthSide } from "@/components/auth/AuthSide";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { post } from "@/lib/api";

export default function PatientLogin() {
  const router = useRouter();
  const [registered, setRegistered] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setRegistered(new URLSearchParams(window.location.search).get("registered") === "1");
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!identifier.trim() || !password) return setError("Enter your email/mobile and password.");
    setBusy(true); setError("");
    try {
      await post("/auth/patient/login", { identifier, password });
      router.push("/portal");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally { setBusy(false); }
  }

  return (
    <div className="authpage">
      <AuthSide />
      <div className="authmain">
        <form className="authbox" onSubmit={submit} noValidate>
          <span className="tag">Patient portal</span>
          <h1>Welcome back</h1>
          <p className="sub">Log in to manage appointments and records.</p>
          {registered && <div className="msg ok">Account created. Please log in.</div>}
          {error && <div className="msg err" role="alert">{error}</div>}
          <label className="l" htmlFor="id">Email or mobile number</label>
          <input className="inp" id="id" autoComplete="username" placeholder="you@example.com" value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
          <PasswordInput id="pw" label="Password" value={password} onChange={setPassword} />
          <button className="btn" style={{ width: "100%", marginTop: 16 }} disabled={busy}>{busy ? "Signing in…" : "Log in"}</button>
          <div className="alt">New here? <Link href="/register">Create an account</Link> · <Link href="/">Back to website</Link></div>
        </form>
      </div>
    </div>
  );
}
