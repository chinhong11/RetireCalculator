import { useState } from "react";

export function Hint({ text }) {
  const [visible, setVisible] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      <button
        type="button"
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onClick={() => setVisible(v => !v)}
        aria-label={`Help: ${text}`}
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 16, height: 16, borderRadius: "50%",
          border: "1.5px solid var(--accent-border-c)",
          background: "var(--accent-chip)",
          color: "var(--accent)", fontSize: 9, fontWeight: 800,
          cursor: "pointer", marginLeft: 5, fontFamily: "inherit", padding: 0,
          flexShrink: 0, lineHeight: 1,
          transition: "background 0.15s ease, border-color 0.15s ease",
        }}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
      >?</button>
      {visible && (
        <span
          role="tooltip"
          style={{
            position: "absolute", bottom: "calc(100% + 8px)", left: "50%",
            transform: "translateX(-50%)",
            background: "var(--tooltip-bg)", border: "1px solid var(--border)",
            borderRadius: 10, padding: "8px 12px",
            fontSize: 11, color: "var(--text)", lineHeight: 1.6,
            whiteSpace: "nowrap", zIndex: 100,
            boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
            pointerEvents: "none",
          }}
        >{text}</span>
      )}
    </span>
  );
}
