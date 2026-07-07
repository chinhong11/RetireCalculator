import { BackupBar } from "../shared/BackupBar.jsx";
import { SEM } from "../../theme.js";

/**
 * App header: brand badge, cloud-sync/auth controls, theme toggle,
 * PDF export button, title, and the backup strip.
 */
export function Header({
  theme, setTheme,
  user, syncing, syncError, signOut, onSignIn,
  pdfBusy, pdfError, onExportPdf,
}) {
  return (
    <div className="mobile-pad" style={{
      padding: "28px 24px 22px",
      background: "linear-gradient(160deg, var(--header-tint) 0%, transparent 60%)",
      borderBottom: "1px solid var(--border)",
      marginBottom: 24,
    }}>
      <div style={{ maxWidth: 1140, margin: "0 auto" }}>

        {/* Top row: badge + actions */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
          {/* Brand badge */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "4px 12px", borderRadius: 20,
              background: "var(--accent-chip)", border: "1px solid var(--accent-border-c)",
              fontSize: 11, fontWeight: 700, color: "var(--accent)", letterSpacing: "0.07em", textTransform: "uppercase",
            }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", display: "inline-block" }} />
              Singapore 2026
            </span>
          </div>

          {/* Action buttons */}
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            {pdfError  && <span style={{ fontSize: 11, color: SEM.danger, fontWeight: 500 }}>⚠ {pdfError}</span>}
            {syncError && <span style={{ fontSize: 11, color: SEM.warn,   fontWeight: 500 }}>⚠ {syncError}</span>}

            {user ? (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {syncing
                  ? <span style={{ fontSize: 11, color: "var(--accent)", fontWeight: 500 }}>☁ Syncing…</span>
                  : <span style={{ fontSize: 11, color: "var(--muted)" }} title={user.email}>
                      ☁ {user.email.length > 20 ? user.email.slice(0, 18) + "…" : user.email}
                    </span>
                }
                <button onClick={signOut} title="Sign out" style={{ background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontSize: 11, fontWeight: 600, color: "var(--muted)", fontFamily: "inherit" }}>
                  Sign out
                </button>
              </div>
            ) : (
              <button onClick={onSignIn} title="Sign in to sync your data to the cloud"
                style={{ background: "var(--accent-subtle)", border: "1px solid var(--accent-border-c)", borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "var(--accent)", display: "flex", alignItems: "center", gap: 5, fontFamily: "inherit" }}>
                ☁ Sign in
              </button>
            )}

            <button onClick={() => setTheme(t => t === "dark" ? "light" : "dark")}
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              style={{ background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 10px", cursor: "pointer", fontSize: 15, lineHeight: 1, color: "var(--text)" }}>
              {theme === "dark" ? "☀️" : "🌙"}
            </button>

            <button onClick={onExportPdf} disabled={pdfBusy} title="Export projection as PDF"
              style={{ background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 14px", cursor: pdfBusy ? "default" : "pointer", fontSize: 12, fontWeight: 600, color: pdfBusy ? "var(--muted)" : "var(--accent)", opacity: pdfBusy ? 0.6 : 1, display: "flex", alignItems: "center", gap: 5, fontFamily: "inherit" }}>
              {pdfBusy ? "⏳ Generating…" : "⬇ PDF"}
            </button>
          </div>
        </div>

        {/* Title + subtitle */}
        <h1 className="mobile-h1" style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.025em", lineHeight: 1.15, color: "var(--text)" }}>
          CPF Contribution Calculator
        </h1>
        <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 6, lineHeight: 1.6 }}>
          For Permanent Residents · OW ceiling $8,000 · Rates effective 1 Jan 2026
        </p>

        {/* Data backup strip */}
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700 }}>Backup</span>
          <BackupBar />
        </div>
      </div>
    </div>
  );
}
