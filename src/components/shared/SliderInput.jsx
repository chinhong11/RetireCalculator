import { } from "react";

export function SliderInput({ label, value, onChange, min, max, step, suffix = "", prefix = "" }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 13, color: "var(--label)", fontWeight: 500, letterSpacing: "0.02em" }}>{label}</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: "var(--accent)", fontFamily: "'DM Mono', monospace" }}>
          {prefix}{typeof value === "number" ? (Number.isInteger(step) || step >= 1 ? value : value.toFixed(1)) : value}{suffix}
        </span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ width: "100%", accentColor: "var(--accent)" }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
        <span>{prefix}{min}{suffix}</span>
        <span>{prefix}{max}{suffix}</span>
      </div>
    </div>
  );
}
