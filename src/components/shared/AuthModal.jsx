import { useState } from "react";
import { supabase } from "../../lib/supabase.js";

/**
 * @param {{ onClose: () => void }} props
 */
export function AuthModal({ onClose }) {
  const [tab, setTab]         = useState("signin");   // "signin" | "signup"
  const [email, setEmail]     = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState(null);
  const [success, setSuccess] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setBusy(true);
    try {
      if (tab === "signup") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setSuccess("Check your email for a confirmation link, then sign in.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        onClose();
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    // Backdrop
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(0,0,0,0.6)", display: "flex",
        alignItems: "center", justifyContent: "center", padding: 16,
      }}
    >
      {/* Card */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "var(--bg)", border: "1px solid var(--border)",
          borderRadius: 20, padding: 32, width: "100%", maxWidth: 380,
          boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em" }}>
              {tab === "signin" ? "Sign in" : "Create account"}
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>
              Your data syncs to the cloud automatically
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 20, color: "var(--muted)", lineHeight: 1, padding: 4 }}
          >×</button>
        </div>

        {/* Tab switcher */}
        <div style={{ display: "flex", gap: 4, marginBottom: 24, background: "var(--input-bg)", borderRadius: 10, padding: 4 }}>
          {[["signin", "Sign in"], ["signup", "Sign up"]].map(([id, label]) => (
            <button
              key={id}
              onClick={() => { setTab(id); setError(null); setSuccess(null); }}
              style={{
                flex: 1, padding: "7px 0", borderRadius: 8, border: "none", cursor: "pointer",
                fontFamily: "inherit", fontSize: 13, fontWeight: 600, transition: "all 0.15s",
                background: tab === id ? "var(--card-bg)" : "transparent",
                color: tab === id ? "var(--text)" : "var(--muted)",
                boxShadow: tab === id ? "0 1px 4px rgba(0,0,0,0.15)" : "none",
              }}
            >{label}</button>
          ))}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, color: "var(--label)", fontWeight: 500, display: "block", marginBottom: 6 }}>Email</label>
            <input
              type="email" required value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@email.com" autoComplete="email"
              style={{
                width: "100%", padding: "10px 14px", borderRadius: 10,
                border: "1px solid var(--border)", background: "var(--input-bg)",
                color: "var(--text)", fontSize: 14, fontFamily: "inherit", outline: "none",
              }}
            />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 12, color: "var(--label)", fontWeight: 500, display: "block", marginBottom: 6 }}>Password</label>
            <input
              type="password" required value={password} onChange={e => setPassword(e.target.value)}
              placeholder={tab === "signup" ? "Min. 8 characters" : "Your password"}
              autoComplete={tab === "signup" ? "new-password" : "current-password"}
              minLength={8}
              style={{
                width: "100%", padding: "10px 14px", borderRadius: 10,
                border: "1px solid var(--border)", background: "var(--input-bg)",
                color: "var(--text)", fontSize: 14, fontFamily: "inherit", outline: "none",
              }}
            />
          </div>

          {error && (
            <div style={{ fontSize: 12, color: "#f87171", marginBottom: 14, padding: "8px 12px", borderRadius: 8, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
              {error}
            </div>
          )}
          {success && (
            <div style={{ fontSize: 12, color: "var(--accent)", marginBottom: 14, padding: "8px 12px", borderRadius: 8, background: "var(--accent-subtle)", border: "1px solid var(--accent-border-c)" }}>
              {success}
            </div>
          )}

          <button
            type="submit" disabled={busy}
            style={{
              width: "100%", padding: "11px 0", borderRadius: 10, border: "none",
              background: "var(--accent)", color: "#0a0e17", fontSize: 14, fontWeight: 700,
              cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1,
              fontFamily: "inherit", transition: "opacity 0.15s",
            }}
          >
            {busy ? "Please wait…" : tab === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        <div style={{ marginTop: 16, fontSize: 11, color: "var(--muted)", textAlign: "center", lineHeight: 1.6 }}>
          Your data is stored securely and never shared.
        </div>
      </div>
    </div>
  );
}
