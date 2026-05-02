import { } from "react";
import { fmtD } from "../../lib/cpf.js";

export const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div style={{
      background: "var(--tooltip-bg)",
      backdropFilter: "blur(12px)",
      border: "1px solid var(--border)",
      borderRadius: 12,
      padding: "14px 18px",
      fontSize: 13,
      color: "var(--text)",
      boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
      minWidth: "min(200px, calc(100vw - 32px))",
    }}>
      <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 14 }}>Year {d.year} <span style={{ color: "var(--muted)", fontWeight: 400 }}>(Age {d.age})</span></div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "4px 16px" }}>
        <span style={{ color: "var(--muted)" }}>Salary</span><span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>{fmtD(d.salary)}</span>
        <span style={{ color: "#4ade80" }}>OA</span><span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>{fmtD(d.oa)}</span>
        {d.raFormed
          ? <><span style={{ color: "#a78bfa" }}>RA</span><span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>{fmtD(d.ra)}</span></>
          : <><span style={{ color: "#818cf8" }}>SA</span><span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>{fmtD(d.sa)}</span></>
        }
        <span style={{ color: "#f472b6" }}>MA</span><span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>{fmtD(d.ma)}</span>
        <div style={{ gridColumn: "1 / -1", borderTop: "1px solid var(--border)", margin: "4px 0" }} />
        <span style={{ fontWeight: 600 }}>Total CPF</span><span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 800, color: "var(--accent)" }}>{fmtD(d.total)}</span>
      </div>
    </div>
  );
};
