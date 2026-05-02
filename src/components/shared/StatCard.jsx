import { } from "react";

export function StatCard({ label, value, sub, color }) {
  return (
    <div style={{
      background: "var(--card-bg)",
      borderRadius: 14,
      padding: "18px 20px",
      border: "1px solid var(--border)",
      flex: "1 1 0",
      minWidth: 0,
    }}>
      <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: color || "var(--text)", fontFamily: "'DM Mono', monospace" }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}
