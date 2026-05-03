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

  async function handleGoogleSignIn() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) { setError(error.message); setBusy(false); }
    // On success the browser redirects to Google — no further action here
  }

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

        {/* Google sign-in button */}
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={busy}
          style={{
            width: "100%", padding: "10px 0", borderRadius: 10, marginBottom: 20,
            border: "1px solid var(--border)", background: "var(--card-bg)",
            color: "var(--text)", fontSize: 14, fontWeight: 600,
            cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1,
            fontFamily: "inherit", display: "flex", alignItems: "center",
            justifyContent: "center", gap: 10, transition: "opacity 0.15s",
          }}
        >
          {/* Google "G" logo */}
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          Continue with Google
        </button>

        {/* Divider */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
          <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 500 }}>or</span>
          <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
        </div>

        {/* Tab switcher */}
        <div style={{ display: "flex", gap: 4, marginBottom: 20, background: "var(--input-bg)", borderRadius: 10, padding: 4 }}>
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
