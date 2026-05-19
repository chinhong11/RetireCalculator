import { useState, useRef } from "react";
import { exportBackup, importBackup } from "../../lib/backup.js";

export function BackupBar() {
  const [status, setStatus] = useState(null);
  const fileRef = useRef(null);

  const handleImport = e => {
    const file = e.target.files?.[0];
    if (!file) return;
    importBackup(file, ok => {
      setStatus(ok ? "ok" : "err");
      if (ok) setTimeout(() => window.location.reload(), 900);
    });
    e.target.value = "";
  };

  const base = {
    padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600,
    cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
    transition: "opacity 0.15s ease",
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <button
        style={{ ...base, background: "var(--accent-chip)", border: "1px solid var(--accent-border-c)", color: "var(--accent)" }}
        onClick={exportBackup}
      >
        ↓ Export
      </button>
      <button
        style={{ ...base, background: "var(--input-bg)", border: "1px solid var(--border)", color: "var(--label)" }}
        onClick={() => fileRef.current?.click()}
      >
        ↑ Restore
      </button>
      <input ref={fileRef} type="file" accept=".json" style={{ display: "none" }} onChange={handleImport} />
      {status === "ok"  && <span style={{ fontSize: 11, color: "#4ade80", fontWeight: 600 }}>✓ Restored — reloading…</span>}
      {status === "err" && <span style={{ fontSize: 11, color: "#f87171", fontWeight: 600 }}>✗ Invalid backup file</span>}
    </div>
  );
}
