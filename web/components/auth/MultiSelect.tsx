"use client";
import { useEffect, useRef, useState } from "react";

export interface Option { id: string; label: string; desc?: string }

export function MultiSelect({ options, value, onChange, placeholder = "Select…" }: {
  options: Option[]; value: string[]; onChange: (v: string[]) => void; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  const label = (id: string) => options.find((o) => o.id === id)?.label ?? id;

  return (
    <div className={`ms ${open ? "open" : ""}`} ref={ref}>
      <button type="button" className="ms-btn" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {value.length ? value.map((id) => (
          <span className="chip" key={id}>
            {label(id)}
            <b title="Remove" onClick={(e) => { e.stopPropagation(); toggle(id); }}>×</b>
          </span>
        )) : <span className="ms-ph">{placeholder}</span>}
      </button>
      <div className="ms-list" role="listbox" aria-multiselectable="true">
        {options.map((o) => (
          <label className="ms-opt" key={o.id}>
            <input type="checkbox" checked={value.includes(o.id)} onChange={() => toggle(o.id)} />
            <span>{o.label}{o.desc && <small>{o.desc}</small>}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
