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

  const btnStyle = {
    padding: "7px 14px", borderRadius: 8, border: "1px solid var(--border)",
    background: "rgba(255,255,255,0.05)", color: "var(--label)", fontSize: 12,
    fontWeight: 600, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <button style={btnStyle} onClick={exportBackup}>↓ Export Backup</button>
      <button style={btnStyle} onClick={() => fileRef.current?.click()}>↑ Restore Backup</button>
      <input ref={fileRef} type="file" accept=".json" style={{ display: "none" }} onChange={handleImport} />
      {status === "ok" && <span style={{ fontSize: 12, color: "#4ade80" }}>Restored! Reloading…</span>}
      {status === "err" && <span style={{ fontSize: 12, color: "#f87171" }}>Invalid backup file.</span>}
    </div>
  );
}
