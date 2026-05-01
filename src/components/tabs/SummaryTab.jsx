import { useState, useEffect, useMemo } from "react";
import { RM, USD, uid } from "../../lib/finance.js";

export default function SummaryTab({ cpfData, yearsToProject, projectionData }) {
  const properties = useMemo(() => {
    try { const s = localStorage.getItem("hl_props_v1"); return s ? JSON.parse(s) : []; } catch { return []; }
  }, []);
  const stockHoldings = useMemo(() => {
    try { const s = localStorage.getItem("stocks_v1"); return s ? JSON.parse(s) : []; } catch { return []; }
  }, []);
  const cryptoHoldings = useMemo(() => {
    try { const s = localStorage.getItem("crypto_v1"); return s ? JSON.parse(s) : []; } catch { return []; }
  }, []);
  const myStockHoldings = useMemo(() => {
    try { const s = localStorage.getItem("mystocks_v1"); return s ? JSON.parse(s) : []; } catch { return []; }
  }, []);

  const SGD = (n) => "S$" + Number(n || 0).toLocaleString("en-SG", { maximumFractionDigits: 0 });

  const cpfOA       = cpfData?.oa    || 0;
  const cpfSA       = cpfData?.sa    || 0;
  const cpfMA       = cpfData?.ma    || 0;
  const cpfTotal    = cpfData?.total || 0;
  const cpfFinalAge = cpfData?.age   || 0;

  const propStats = useMemo(() => properties.map(p => {
    const downpaid = (p.downpaymentRecords || []).reduce((s, r) => s + (r.amount || 0), 0);
    return { ...p, downpaid, outstanding: Math.max(0, p.purchasePrice - downpaid) };
  }), [properties]);
  const totalPropValue  = propStats.reduce((s, p) => s + p.purchasePrice, 0);
  const totalEquity     = propStats.reduce((s, p) => s + p.downpaid, 0);
  const totalOutstanding = propStats.reduce((s, p) => s + p.outstanding, 0);

  const myStocksCost = myStockHoldings.reduce((s, h) => s + h.shares * h.avgCost + (h.totalFees || 0), 0);
  const stocksCost   = stockHoldings.reduce((s, h)   => s + h.shares * h.avgCost + (h.totalFees || 0), 0);
  const cryptoCost   = cryptoHoldings.reduce((s, h)  => s + h.amount * h.buyPrice + (h.totalFees || 0), 0);
  const totalUSD     = stocksCost + cryptoCost;

  const [goals, setGoals] = useState(() => {
    try { const s = localStorage.getItem("goals_v1"); return s ? JSON.parse(s) : []; } catch { return []; }
  });
  const [goalForm, setGoalForm] = useState({ name: "", currency: "SGD", target: "", targetAge: "", notes: "" });

  useEffect(() => {
    try { localStorage.setItem("goals_v1", JSON.stringify(goals)); } catch {}
  }, [goals]);

  const addGoal = () => {
    if (!goalForm.name.trim() || !goalForm.target) return;
    setGoals(gs => [...gs, {
      id: uid(), name: goalForm.name.trim(),
      currency: goalForm.currency,
      target: parseFloat(goalForm.target) || 0,
      targetAge: parseInt(goalForm.targetAge) || null,
      notes: goalForm.notes.trim(),
    }]);
    setGoalForm({ name: "", currency: "SGD", target: "", targetAge: "", notes: "" });
  };

  const delGoal = (id) => setGoals(gs => gs.filter(g => g.id !== id));

  const currentByCurrency = { SGD: cpfTotal, MYR: totalEquity + myStocksCost, USD: stocksCost + cryptoCost };
  const fmtByCurrency     = { SGD, MYR: RM, USD };

  const cpfAgeForTarget = (target) => {
    if (!projectionData) return null;
    const hit = projectionData.find(d => d.total >= target);
    return hit ? hit.age : null;
  };

  const MiniBar = ({ pct, color }) => (
    <div style={{ background: "var(--track)", borderRadius: 6, height: 6, overflow: "hidden" }}>
      <div style={{ width: `${Math.min(100, pct || 0)}%`, height: "100%", background: color, borderRadius: 6, transition: "width 0.5s ease" }} />
    </div>
  );

  const SectionHeader = ({ title, sub, value, valueColor }) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18, flexWrap: "wrap", gap: 8 }}>
      <div>
        <div className="section-title" style={{ margin: 0 }}>{title}</div>
        {sub && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>{sub}</div>}
      </div>
      {value != null && (
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 26, fontWeight: 800, fontFamily: "'DM Mono', monospace", color: valueColor || "var(--accent)" }}>{value}</div>
        </div>
      )}
    </div>
  );

  return (
    <div>
      <div style={{ padding: "12px 16px", borderRadius: 10, background: "rgba(129,140,248,0.06)", border: "1px solid rgba(129,140,248,0.12)", fontSize: 12, color: "var(--label)", marginBottom: 20, lineHeight: 1.7 }}>
        ℹ️ Your assets span multiple currencies — <strong>SGD</strong> (CPF), <strong>MYR</strong> (Property &amp; MY Stocks), <strong>USD</strong> (US Stocks &amp; Crypto). Values are shown in their native currency without conversion. Stock and crypto figures reflect cost basis; visit those tabs and refresh prices to see live P&amp;L.
      </div>

      {/* CPF (SGD) */}
      <div style={{ background: "var(--card-bg)", borderRadius: 16, padding: 24, border: "1px solid var(--border)", marginBottom: 16 }}>
        <SectionHeader
          title="CPF Balance — SGD"
          sub={`Projected after ${yearsToProject} years · Age ${cpfFinalAge}`}
          value={SGD(cpfTotal)}
          valueColor="var(--accent)"
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[
            { label: "Ordinary Account (OA)", value: cpfOA, color: "#4ade80" },
            { label: "Special Account (SA)",  value: cpfSA, color: "#818cf8" },
            { label: "MediSave Account (MA)", value: cpfMA, color: "#f472b6" },
          ].map(({ label, value, color }) => (
            <div key={label}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 5 }}>
                <span style={{ color: "var(--label)" }}>{label}</span>
                <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color }}>{SGD(value)}</span>
              </div>
              <MiniBar pct={cpfTotal > 0 ? (value / cpfTotal) * 100 : 0} color={color} />
            </div>
          ))}
        </div>
        {cpfTotal === 0 && (
          <div style={{ marginTop: 12, fontSize: 12, color: "var(--muted)" }}>
            Set your salary and profile in the Growth Chart tab to see projected CPF balances.
          </div>
        )}
      </div>

      {/* Housing + MY Stocks (MYR) */}
      <div style={{ background: "var(--card-bg)", borderRadius: 16, padding: 24, border: "1px solid var(--border)", marginBottom: 16 }}>
        <SectionHeader
          title="MYR Assets — Property &amp; Bursa Stocks"
          sub={`${properties.length} propert${properties.length === 1 ? "y" : "ies"} · ${myStockHoldings.length} Bursa position${myStockHoldings.length !== 1 ? "s" : ""} · cost basis`}
          value={(properties.length || myStockHoldings.length) ? RM(totalEquity + myStocksCost) : null}
          valueColor="var(--accent)"
        />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: properties.length ? 16 : 0 }}>
          {[
            { label: "Total Property Value", value: RM(totalPropValue),   color: "#e8eaf0" },
            { label: "Equity Paid",          value: RM(totalEquity),      color: "var(--accent)" },
            { label: "Outstanding Loan",     value: RM(totalOutstanding), color: "#f87171" },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ flex: "1 1 160px", background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: "12px 14px", border: "1px solid var(--border)" }}>
              <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>{label}</div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 15, color }}>{value}</div>
            </div>
          ))}
        </div>
        <div style={{ background: "rgba(56,189,248,0.06)", borderRadius: 12, padding: "14px 16px", border: "1px solid rgba(56,189,248,0.15)", marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#38bdf8" }}>📈 Bursa Malaysia Stocks</span>
            <span style={{ fontSize: 11, color: "var(--muted)" }}>{myStockHoldings.length} position{myStockHoldings.length !== 1 ? "s" : ""}</span>
          </div>
          <div style={{ fontFamily: "'DM Mono', monospace", fontWeight: 800, fontSize: 20, color: "#38bdf8", marginBottom: 4 }}>{RM(myStocksCost)}</div>
          <div style={{ fontSize: 11, color: "var(--muted)" }}>Cost basis · visit MY Stocks tab for live P&amp;L</div>
          {myStockHoldings.length === 0 && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>No positions yet.</div>}
        </div>
        {propStats.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {propStats.map(p => (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", borderRadius: 10, background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", flexWrap: "wrap", gap: 10 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                    {p.type === "under_construction" ? "Under Construction" : "Completed"}
                    {p.developer ? ` · ${p.developer}` : ""}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                  {[
                    { label: "Purchase",    value: RM(p.purchasePrice), color: "var(--text)" },
                    { label: "Equity Paid", value: RM(p.downpaid),      color: "var(--accent)" },
                    { label: "Outstanding", value: RM(p.outstanding),   color: "#f87171" },
                  ].map(({ label, value, color }) => (
                    <div key={label} style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 11, color: "var(--muted)" }}>{label}</div>
                      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 600, color }}>{value}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ textAlign: "center", color: "var(--muted)", fontSize: 13, padding: "8px 0" }}>
            No properties added yet. Visit the <strong style={{ color: "var(--label)" }}>Housing Loan</strong> or <strong style={{ color: "var(--label)" }}>MY Stocks</strong> tab to get started.
          </div>
        )}
      </div>

      {/* Investments (USD) */}
      <div style={{ background: "var(--card-bg)", borderRadius: 16, padding: 24, border: "1px solid var(--border)", marginBottom: 16 }}>
        <SectionHeader
          title="Investments — USD"
          sub="US Stocks + Crypto · cost basis (visit tabs for live P&L)"
          value={totalUSD > 0 ? USD(totalUSD) : null}
          valueColor="var(--accent2)"
        />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          <div style={{ flex: "1 1 200px", background: "rgba(129,140,248,0.06)", borderRadius: 12, padding: "16px 18px", border: "1px solid rgba(129,140,248,0.15)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--accent2)" }}>📊 US Stocks</span>
              <span style={{ fontSize: 11, color: "var(--muted)" }}>{stockHoldings.length} position{stockHoldings.length !== 1 ? "s" : ""}</span>
            </div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontWeight: 800, fontSize: 22, color: "var(--accent2)", marginBottom: 6 }}>{USD(stocksCost)}</div>
            {totalUSD > 0 && (
              <>
                <MiniBar pct={(stocksCost / totalUSD) * 100} color="var(--accent2)" />
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 5, textAlign: "right" }}>{((stocksCost / totalUSD) * 100).toFixed(1)}% of investments</div>
              </>
            )}
            {stockHoldings.length === 0 && <div style={{ fontSize: 12, color: "var(--muted)" }}>No positions yet.</div>}
          </div>
          <div style={{ flex: "1 1 200px", background: "rgba(251,191,36,0.06)", borderRadius: 12, padding: "16px 18px", border: "1px solid rgba(251,191,36,0.15)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#fbbf24" }}>🪙 Crypto</span>
              <span style={{ fontSize: 11, color: "var(--muted)" }}>{cryptoHoldings.length} position{cryptoHoldings.length !== 1 ? "s" : ""}</span>
            </div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontWeight: 800, fontSize: 22, color: "#fbbf24", marginBottom: 6 }}>{USD(cryptoCost)}</div>
            {totalUSD > 0 && (
              <>
                <MiniBar pct={(cryptoCost / totalUSD) * 100} color="#fbbf24" />
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 5, textAlign: "right" }}>{((cryptoCost / totalUSD) * 100).toFixed(1)}% of investments</div>
              </>
            )}
            {cryptoHoldings.length === 0 && <div style={{ fontSize: 12, color: "var(--muted)" }}>No positions yet.</div>}
          </div>
        </div>
        {stockHoldings.length === 0 && cryptoHoldings.length === 0 && (
          <div style={{ textAlign: "center", color: "var(--muted)", fontSize: 13, marginTop: 12 }}>
            No holdings yet. Add positions in the <strong style={{ color: "var(--label)" }}>US Stocks</strong> or <strong style={{ color: "var(--label)" }}>Crypto</strong> tabs.
          </div>
        )}
      </div>

      {/* Retirement Goals */}
      <div style={{ background: "var(--card-bg)", borderRadius: 16, padding: 24, border: "1px solid var(--border)", marginBottom: 16 }}>
        <SectionHeader title="🎯 Retirement Goals" sub="Track how close you are to each financial milestone" />

        <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 12, padding: 18, border: "1px solid var(--border)", marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--label)", marginBottom: 14 }}>Add a Goal</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
            <input
              placeholder="Goal name (e.g. Retirement Fund)"
              value={goalForm.name}
              onChange={e => setGoalForm(f => ({ ...f, name: e.target.value }))}
              style={{ flex: "2 1 200px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 12px", color: "var(--text)", fontSize: 13 }}
            />
            <select
              value={goalForm.currency}
              onChange={e => setGoalForm(f => ({ ...f, currency: e.target.value }))}
              style={{ flex: "0 0 90px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 10px", color: "var(--text)", fontSize: 13 }}
            >
              <option value="SGD">SGD</option>
              <option value="MYR">MYR</option>
              <option value="USD">USD</option>
            </select>
            <input
              type="number"
              placeholder="Target amount"
              value={goalForm.target}
              onChange={e => setGoalForm(f => ({ ...f, target: e.target.value }))}
              style={{ flex: "1 1 150px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 12px", color: "var(--text)", fontSize: 13 }}
            />
            <input
              type="number"
              placeholder="Target age (opt)"
              value={goalForm.targetAge}
              onChange={e => setGoalForm(f => ({ ...f, targetAge: e.target.value }))}
              style={{ flex: "1 1 130px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 12px", color: "var(--text)", fontSize: 13 }}
            />
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <input
              placeholder="Notes (optional)"
              value={goalForm.notes}
              onChange={e => setGoalForm(f => ({ ...f, notes: e.target.value }))}
              style={{ flex: 1, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 12px", color: "var(--text)", fontSize: 13 }}
            />
            <button
              onClick={addGoal}
              style={{ padding: "9px 22px", background: "var(--accent)", color: "#0a0e17", borderRadius: 8, border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}
            >
              + Add
            </button>
          </div>
        </div>

        {goals.length === 0 ? (
          <div style={{ textAlign: "center", color: "var(--muted)", fontSize: 13, padding: "20px 0" }}>
            No goals yet. Add a milestone above to start tracking your progress.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {goals.map(g => {
              const current  = currentByCurrency[g.currency] || 0;
              const pct      = g.target > 0 ? Math.min(100, (current / g.target) * 100) : 0;
              const remaining = Math.max(0, g.target - current);
              const achieved  = current >= g.target;
              const fmtFn     = fmtByCurrency[g.currency] || (n => n.toLocaleString());
              const projAge   = g.currency === "SGD" ? cpfAgeForTarget(g.target) : null;
              const barColor  = achieved ? "#34d399" : pct > 60 ? "var(--accent)" : pct > 30 ? "#fbbf24" : "#f87171";

              return (
                <div key={g.id} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 12, padding: "18px 20px", border: `1px solid ${achieved ? "rgba(52,211,153,0.25)" : "var(--border)"}`, position: "relative" }}>
                  <button
                    onClick={() => delGoal(g.id)}
                    title="Remove goal"
                    style={{ position: "absolute", top: 14, right: 14, background: "none", border: "none", color: "var(--muted)", fontSize: 16, cursor: "pointer", lineHeight: 1 }}
                  >×</button>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10, paddingRight: 24 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text)" }}>{g.name}</div>
                      {g.notes && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>{g.notes}</div>}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 13, color: "var(--muted)" }}>Target</div>
                      <div style={{ fontFamily: "'DM Mono', monospace", fontWeight: 800, fontSize: 20, color: "var(--label)" }}>{fmtFn(g.target)}</div>
                      <div style={{ fontSize: 11, color: "var(--muted)" }}>{g.currency}</div>
                    </div>
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <MiniBar pct={pct} color={barColor} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                    <div>
                      <span style={{ fontSize: 12, color: "var(--muted)" }}>Current: </span>
                      <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: "var(--text)" }}>{fmtFn(current)}</span>
                      <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: 4 }}>({pct.toFixed(1)}%)</span>
                    </div>
                    {achieved ? (
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#34d399", background: "rgba(52,211,153,0.1)", borderRadius: 6, padding: "3px 10px" }}>✓ Goal reached!</span>
                    ) : (
                      <div style={{ textAlign: "right" }}>
                        <span style={{ fontSize: 12, color: "var(--muted)" }}>Still needed: </span>
                        <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: "#f87171" }}>{fmtFn(remaining)}</span>
                      </div>
                    )}
                  </div>
                  {g.currency === "SGD" && !achieved && (
                    <div style={{ marginTop: 10, fontSize: 12, color: "var(--muted)", borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                      {projAge
                        ? <>📈 Based on your CPF projection, you may reach this target around <strong style={{ color: "var(--accent)" }}>age {projAge}</strong>.</>
                        : <>📈 Target exceeds your current {yearsToProject}-year CPF projection. Consider extending the projection period.</>
                      }
                    </div>
                  )}
                  {g.targetAge && !achieved && (
                    <div style={{ marginTop: g.currency === "SGD" ? 6 : 10, fontSize: 12, color: "var(--muted)" }}>
                      🗓️ Your target age: <strong style={{ color: "var(--label)" }}>{g.targetAge}</strong>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ padding: "14px 18px", borderRadius: 12, background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", fontSize: 11, color: "var(--muted)", lineHeight: 1.7 }}>
        <strong style={{ color: "var(--label)" }}>Note:</strong> CPF figures are projected values based on your inputs — not actual current balances. Property equity reflects total downpayments recorded, not appraised market value. Stock and crypto values show cost basis only. No currency conversion is applied between SGD, MYR, and USD. Visit each tab and refresh prices to see live portfolio values and unrealised P&amp;L.
      </div>
    </div>
  );
}
