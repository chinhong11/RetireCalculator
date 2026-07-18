import { useState, useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { projectYears, estimateCpfLifePayout, fmtD } from "../../lib/cpf.js";
import { MoneyInput } from "./MoneyInput.jsx";
import { SEM } from "../../theme.js";

const B_COLOR = "#f59e0b";

/**
 * "What if?" comparison: re-runs the CPF projection with variant inputs and
 * overlays both total-balance curves, with end-state and CPF LIFE deltas.
 *
 * @param {{ baseInputs: object, gridLineColor: string }} props
 *   baseInputs — the exact argument object passed to projectYears for the
 *   user's current projection (scenario A).
 */
export function ScenarioCompare({ baseInputs, gridLineColor }) {
  const [open, setOpen] = useState(false);
  const [salaryB, setSalaryB]       = useState(baseInputs.salary);
  const [incrementB, setIncrementB] = useState(baseInputs.annualIncrement);

  // The sidebar stays editable while this panel is open. When the base
  // changes, untouched Scenario B fields follow it (otherwise B silently
  // becomes "what if I earned my OLD salary" and the reset button appears
  // without the user ever touching B); customized fields are kept.
  const [prevBase, setPrevBase] = useState(baseInputs);
  if (prevBase !== baseInputs) {
    if (salaryB === prevBase.salary) setSalaryB(baseInputs.salary);
    if (incrementB === prevBase.annualIncrement) setIncrementB(baseInputs.annualIncrement);
    setPrevBase(baseInputs);
  }

  const projA = useMemo(() => projectYears(baseInputs), [baseInputs]);
  const projB = useMemo(
    () => projectYears({ ...baseInputs, salary: salaryB, annualIncrement: incrementB }),
    [baseInputs, salaryB, incrementB],
  );

  const chartData = useMemo(
    () => projA.map((row, i) => ({ year: row.year, A: row.total, B: projB[i]?.total ?? null })),
    [projA, projB],
  );

  const finalA = projA[projA.length - 1];
  const finalB = projB[projB.length - 1];
  const delta  = finalB.total - finalA.total;
  const lifeA  = estimateCpfLifePayout(projA, baseInputs.saReturn);
  const lifeB  = estimateCpfLifePayout(projB, baseInputs.saReturn);

  const changed = salaryB !== baseInputs.salary || incrementB !== baseInputs.annualIncrement;

  return (
    <div style={{ marginTop: 14, borderTop: "1px solid var(--border)", paddingTop: 14 }}>
      <button
        className="adv-toggle"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--label)" }}>
          ⚖ Compare a “what if?” scenario
        </span>
        <span style={{
          fontSize: 10, color: "var(--accent)", fontWeight: 700,
          background: "var(--accent-chip)", border: "1px solid var(--accent-border-c)",
          borderRadius: 6, padding: "2px 10px", whiteSpace: "nowrap",
        }}>
          {open ? "▲ Hide" : "▼ Compare"}
        </span>
      </button>

      {open && (
        <div style={{ marginTop: 14 }}>
          {/* Variant controls */}
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 14 }}>
            <div style={{ flex: "1 1 160px", maxWidth: 220 }}>
              <div style={{ fontSize: 11, color: B_COLOR, fontWeight: 600, marginBottom: 4 }}>Scenario B — Monthly salary</div>
              <MoneyInput className="hl-in" value={salaryB} max={1_000_000} onChange={setSalaryB}
                style={{ fontFamily: "'DM Mono', monospace" }} />
            </div>
            <div style={{ flex: "1 1 160px", maxWidth: 220 }}>
              <div style={{ fontSize: 11, color: B_COLOR, fontWeight: 600, marginBottom: 4 }}>Annual increment (%)</div>
              <input type="number" className="hl-in" min={0} max={20} step={0.5} value={incrementB}
                onChange={e => setIncrementB(parseFloat(e.target.value) || 0)}
                style={{ fontFamily: "'DM Mono', monospace" }} />
            </div>
            {changed && (
              <button onClick={() => { setSalaryB(baseInputs.salary); setIncrementB(baseInputs.annualIncrement); }}
                style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--input-bg)", color: "var(--muted)", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                ↺ Reset to current
              </button>
            )}
          </div>

          {/* Overlay chart */}
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridLineColor} />
              <XAxis dataKey="year" tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "var(--muted)", fontSize: 10 }} axisLine={false} tickLine={false} width={55}
                tickFormatter={v => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v} />
              <Tooltip
                formatter={(value, name) => [fmtD(value), name === "A" ? "Current" : "Scenario B"]}
                labelFormatter={y => `Year ${y}`}
                contentStyle={{ background: "var(--tooltip-bg)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
              />
              <Legend formatter={name => name === "A" ? "Current" : "Scenario B"} wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="A" stroke="var(--accent)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="B" stroke={B_COLOR} strokeWidth={2} strokeDasharray="6 3" dot={false} />
            </LineChart>
          </ResponsiveContainer>

          {/* Delta summary */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 12 }}>
            {[
              { label: "Current — final CPF", value: fmtD(finalA.total), color: "var(--accent)" },
              { label: "Scenario B — final CPF", value: fmtD(finalB.total), color: B_COLOR },
              { label: `Difference after ${finalA.year} yrs`, value: `${delta >= 0 ? "+" : "−"}${fmtD(Math.abs(delta))}`, color: delta >= 0 ? SEM.oa : SEM.danger },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ flex: "1 1 150px", padding: "10px 14px", borderRadius: 10, background: "var(--hover-bg)", border: "1px solid var(--border)" }}>
                <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, marginBottom: 4 }}>{label}</div>
                <div style={{ fontFamily: "'DM Mono', monospace", fontWeight: 800, fontSize: 16, color }}>{value}</div>
              </div>
            ))}
          </div>

          {lifeA && lifeB && (
            <div style={{ marginTop: 10, fontSize: 12, color: "var(--muted)", lineHeight: 1.6 }}>
              Est. CPF LIFE at {lifeA.payoutAge}: current <strong style={{ color: "var(--accent)" }}>{fmtD(lifeA.payoutLow)}–{fmtD(lifeA.payoutHigh)}/mo</strong>
              {" "}vs scenario B <strong style={{ color: B_COLOR }}>{fmtD(lifeB.payoutLow)}–{fmtD(lifeB.payoutHigh)}/mo</strong>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
