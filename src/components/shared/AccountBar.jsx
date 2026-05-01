import { } from "react";
import { fmtD } from "../../lib/cpf.js";

export function AccountBar({ label, amount, total, color }) {
  const pct = total > 0 ? (amount / total) * 100 : 0;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
        <span style={{ color: "var(--label)", fontWeight: 500 }}>{label}</span>
        <span style={{ fontWeight: 700, fontFamily: "'DM Mono', monospace", color }}>{fmtD(amount)}<span style={{ color: "var(--muted)", fontWeight: 400, fontSize: 11 }}> /mo</span></span>
      </div>
      <div style={{ background: "var(--track)", borderRadius: 6, height: 8, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 6, transition: "width 0.5s ease" }} />
      </div>
    </div>
  );
}
