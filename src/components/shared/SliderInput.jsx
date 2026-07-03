import { } from "react";

export function SliderInput({ label, value, onChange, min, max, step, suffix = "", prefix = "" }) {
  const display = typeof value === "number"
    ? (Number.isInteger(step) || step >= 1 ? value : value.toFixed(1))
    : value;

  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontSize: 13, color: "var(--label)", fontWeight: 500 }}>{label}</span>
        <span style={{
          fontSize: 12, fontWeight: 700, color: "var(--accent)",
          fontFamily: "'DM Mono', monospace",
          background: "var(--accent-chip)",
          border: "1px solid var(--accent-border-c)",
          borderRadius: 6,
          padding: "2px 10px",
          lineHeight: 1.7,
          letterSpacing: "0.02em",
        }}>
          {prefix}{display}{suffix}
        </span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ width: "100%", accentColor: "var(--accent)" }}
      />
      <div style={{
        display: "flex", justifyContent: "space-between",
        fontSize: 10, color: "var(--muted)", marginTop: 5, letterSpacing: "0.03em",
      }}>
        <span>{prefix}{min}{suffix}</span>
        <span>{prefix}{max}{suffix}</span>
      </div>
    </div>
  );
}
