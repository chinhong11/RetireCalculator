import { } from "react";

export function LabelField({ label, children }) {
  return (
    <div>
      <label style={{ fontSize: 12, color: "var(--label)", display: "block", marginBottom: 5, fontWeight: 500 }}>{label}</label>
      {children}
    </div>
  );
}
