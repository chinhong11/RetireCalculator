import { useState } from "react";
import { fmtD } from "../../lib/cpf.js";
import { MoneyInput } from "./MoneyInput.jsx";

/**
 * First-run 3-question setup. Collects the only inputs the core CPF
 * projection needs (salary, age, PR year), then confirms the projection is
 * ready and points the user at the optional asset tabs.
 *
 * @param {{
 *   initialSalary: number, initialAge: number, initialPrYear: number,
 *   monthlyContrib: number,
 *   onComplete: (v: {salary:number, age:number, prYear:number}) => void,
 *   onClose: (completed: boolean) => void,
 * }} props
 */
export function QuickStart({ initialSalary, initialAge, initialPrYear, monthlyContrib, onComplete, onClose }) {
  const [salary, setSalary] = useState(initialSalary || 0);
  const [age, setAge]       = useState(initialAge || 30);
  const [prYear, setPrYear] = useState(initialPrYear || 1);
  const [done, setDone]     = useState(false);

  const submit = () => {
    onComplete({ salary, age, prYear });
    setDone(true);
  };

  return (
    <div onClick={() => onClose(done)} style={{
      position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.6)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 20,
        padding: 32, width: "100%", maxWidth: 420, boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
      }}>
        {done ? (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>✓</div>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 8 }}>
              Your CPF projection is ready
            </div>
            <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6, marginBottom: 24 }}>
              We've estimated {fmtD(monthlyContrib)}/month in CPF contributions and projected your
              balances. Explore the tabs to add stocks, property, EPF or FIRE goals — all optional.
            </div>
            <button onClick={() => onClose(true)} style={primaryBtn}>Explore my projection →</button>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 4 }}>
              👋 Let's set up your projection
            </div>
            <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 24, lineHeight: 1.5 }}>
              Three quick questions — that's all the core CPF projection needs.
            </div>

            <label style={labelStyle}>1 · Monthly salary (SGD)</label>
            <MoneyInput
              className="input-field" autoFocus value={salary} max={1_000_000}
              placeholder="e.g. 5,000" onChange={setSalary}
              onKeyDown={e => e.key === "Enter" && salary && submit()}
              style={{ marginBottom: 18 }}
            />

            <label style={labelStyle}>2 · Your age</label>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
              <input type="range" min={21} max={70} step={1} value={age}
                onChange={e => setAge(parseInt(e.target.value))} style={{ flex: 1 }} />
              <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: "var(--accent)", minWidth: 52, textAlign: "right" }}>
                {age} yrs
              </span>
            </div>

            <label style={labelStyle}>3 · PR status year</label>
            <div style={{ display: "flex", gap: 8, marginBottom: 26 }}>
              {[1, 2, 3].map(y => (
                <button key={y} className={`pr-chip ${prYear === y ? "selected" : ""}`}
                  onClick={() => setPrYear(y)} style={{ flex: 1, justifyContent: "center" }}>
                  {y === 3 ? "3rd yr+" : y === 1 ? "1st yr" : "2nd yr"}
                </button>
              ))}
            </div>

            <button onClick={submit} disabled={!salary} style={{ ...primaryBtn, opacity: salary ? 1 : 0.5, cursor: salary ? "pointer" : "default" }}>
              See my projection →
            </button>
            <button onClick={() => onClose(false)} style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 12, width: "100%", marginTop: 12, fontFamily: "inherit" }}>
              Skip — I'll use the sidebar
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const labelStyle = { fontSize: 12, color: "var(--label)", fontWeight: 600, display: "block", marginBottom: 8 };
const primaryBtn = {
  width: "100%", padding: "12px 16px", borderRadius: 10, border: "none",
  background: "var(--accent)", color: "#0a0e17", fontWeight: 700, fontSize: 14,
  cursor: "pointer", fontFamily: "inherit",
};
