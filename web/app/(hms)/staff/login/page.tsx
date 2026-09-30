"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { AuthSide } from "@/components/auth/AuthSide";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { post } from "@/lib/api";
import { validEmail } from "@/lib/validate";

export default function StaffLogin() {
  const router = useRouter();
  const [registered, setRegistered] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setRegistered(new URLSearchParams(window.location.search).get("registered") === "1");
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!validEmail(email) || !password) return setError("Enter your work email and password.");
    setBusy(true); setError("");
    try {
      await post("/auth/staff/login", { identifier: email, password });
      router.push("/hms"); // middleware sends the user to their first role's dashboard
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed.");
    } finally { setBusy(false); }
  }

  return (
    <div className="authpage">
      <AuthSide staff />
      <div className="authmain">
        <form className="authbox" onSubmit={submit} noValidate>
          <span className="tag">HMS · Staff only</span>
          <h1>Staff sign in</h1>
          <p className="sub">Use your hospital email. Accounts need admin approval.</p>
          {registered && <div className="msg info">Request submitted. An administrator will review and approve your roles.</div>}
          {error && <div className="msg err" role="alert">{error}</div>}
          <label className="l" htmlFor="email">Work email</label>
          <input className="inp" id="email" type="email" autoComplete="username" placeholder="name@mediaccess.in" value={email} onChange={(e) => setEmail(e.target.value)} />
          <PasswordInput id="pw" label="Password" value={password} onChange={setPassword} />
          <button className="btn" style={{ width: "100%", marginTop: 18 }} disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
          <div className="alt">No account? <Link href="/staff/register">Request access</Link> · <Link href="/">Public website</Link></div>
        </form>
      </div>
    </div>
  );
}
