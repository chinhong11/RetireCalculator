import { useState } from "react";

/** Inline glossary tooltip — shows a one-line definition on hover or tap. */
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
          width: 14, height: 14, borderRadius: "50%",
          border: "1px solid var(--muted)", background: "transparent",
          color: "var(--muted)", fontSize: 9, fontWeight: 700,
          cursor: "pointer", marginLeft: 4, fontFamily: "inherit", padding: 0,
          flexShrink: 0, lineHeight: 1,
        }}
      >?</button>
      {visible && (
        <span
          role="tooltip"
          style={{
            position: "absolute", bottom: "calc(100% + 6px)", left: "50%",
            transform: "translateX(-50%)",
            background: "var(--tooltip-bg)", border: "1px solid var(--border)",
            borderRadius: 8, padding: "7px 10px",
            fontSize: 11, color: "var(--text)", lineHeight: 1.5,
            whiteSpace: "nowrap", zIndex: 100,
            boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
            pointerEvents: "none",
          }}
        >{text}</span>
      )}
    </span>
  );
}
