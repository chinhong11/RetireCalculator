import { } from "react";

export function StatCard({ label, value, sub, color }) {
  return (
    <div
      style={{
        background: "var(--card-bg)",
        borderRadius: 14,
        padding: "18px 20px",
        border: "1px solid var(--border)",
        // Grow to fit the value and wrap to the next row rather than clip —
        // fixed flex-basis 0 + minWidth 0 truncated long values (RM 1,938.79)
        flex: "1 1 150px",
        minWidth: "fit-content",
        position: "relative",
        overflow: "hidden",
        transition: "transform 0.18s ease, box-shadow 0.18s ease",
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow = "0 8px 28px rgba(0,0,0,0.18)";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = "";
        e.currentTarget.style.boxShadow = "";
      }}
    >
      {/* Colored top accent bar */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 2,
        background: color || "var(--accent)",
        borderRadius: "14px 14px 0 0",
        opacity: 0.9,
      }} />

      <div style={{
        fontSize: 10, color: "var(--muted)", textTransform: "uppercase",
        letterSpacing: "0.11em", fontWeight: 700, marginBottom: 8,
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 22, fontWeight: 800,
        color: color || "var(--text)",
        fontFamily: "'DM Mono', monospace",
        lineHeight: 1.1,
      }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6, lineHeight: 1.4 }}>
          {sub}
        </div>
      )}
    </div>
  );
}
