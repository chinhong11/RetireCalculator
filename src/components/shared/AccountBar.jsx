import { } from "react";
import { fmtD } from "../../lib/cpf.js";

export function AccountBar({ label, amount, total, color }) {
  const pct = total > 0 ? (amount / total) * 100 : 0;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 13, marginBottom: 7 }}>
        <span style={{ color: "var(--label)", fontWeight: 500 }}>{label}</span>
        <div>
          <span style={{ fontWeight: 700, fontFamily: "'DM Mono', monospace", color }}>{fmtD(amount)}</span>
          <span style={{ color: "var(--muted)", fontWeight: 400, fontSize: 11 }}> /mo</span>
          <span style={{ color: "var(--muted)", fontSize: 10, marginLeft: 5 }}>({pct.toFixed(0)}%)</span>
        </div>
      </div>
      <div style={{ background: "var(--track)", borderRadius: 8, height: 10, overflow: "hidden", position: "relative" }}>
        <div style={{
          width: `${pct}%`,
          height: "100%",
          background: `linear-gradient(90deg, ${color}bb, ${color})`,
          borderRadius: 8,
          transition: "width 0.6s cubic-bezier(0.4,0,0.2,1)",
          boxShadow: `0 0 8px ${color}55`,
        }} />
      </div>
    </div>
  );
}
