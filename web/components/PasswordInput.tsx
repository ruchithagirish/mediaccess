"use client";
import { useState } from "react";
import { strengthScore } from "@/lib/validate";

const EyeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
  </svg>
);
const EyeOffIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);

interface Props {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: "current-password" | "new-password";
  placeholder?: string;
  showStrength?: boolean;
}

/** Password field with show/hide toggle (and optional strength meter). */
export function PasswordInput({ id, label, value, onChange, autoComplete = "current-password", placeholder = "••••••••", showStrength }: Props) {
  const [visible, setVisible] = useState(false);
  const score = strengthScore(value);
  const colors = ["var(--bad)", "var(--bad)", "var(--warn)", "var(--ok)", "var(--ok)"];
  return (
    <>
      <label className="l" htmlFor={id}>{label}</label>
      <div className="pw">
        <input
          className="inp" id={id} type={visible ? "text" : "password"}
          value={value} onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete} placeholder={placeholder}
        />
        <button
          type="button" className="eye" onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"} aria-pressed={visible}
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
      {showStrength && (
        <>
          <div className="strength"><i style={{ width: `${score * 25}%`, background: colors[score] }} /></div>
          <div className="fe" style={{ color: "var(--muted)" }}>Min 8 chars with upper, lower, number and a symbol.</div>
        </>
      )}
    </>
  );
}
