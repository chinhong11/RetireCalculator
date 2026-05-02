import { useState, useEffect, useMemo } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { EXPENSE_CATS, EXPENSE_CAT_COLORS } from "../../lib/finance.js";

export default function SavingsTab({ projectionData, yearsToProject, cpfMonthly, salary }) {
  const [takeHome, setTakeHome]       = useState(() => parseFloat(localStorage.getItem("sav_income") || "0"));
  const [otherIncome, setOtherIncome] = useState(() => parseFloat(localStorage.getItem("sav_other") || "0"));
  const [startCash, setStartCash]     = useState(() => parseFloat(localStorage.getItem("sav_start_cash") || "0"));
  const [cashReturn, setCashReturn]   = useState(() => parseFloat(localStorage.getItem("sav_cash_return") || "0"));
  const [expenses, setExpenses]       = useState(() => {
    try { const s = localStorage.getItem("sav_expenses_v1"); return s ? JSON.parse(s) : []; } catch { return []; }
  });
  const [form, setForm]     = useState({ category: EXPENSE_CATS[0], amount: "", note: "" });
  const [editId, setEditId] = useState(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => { localStorage.setItem("sav_income", takeHome); }, [takeHome]);
  useEffect(() => { localStorage.setItem("sav_other", otherIncome); }, [otherIncome]);
  useEffect(() => { localStorage.setItem("sav_start_cash", startCash); }, [startCash]);
  useEffect(() => { localStorage.setItem("sav_cash_return", cashReturn); }, [cashReturn]);
  useEffect(() => { try { localStorage.setItem("sav_expenses_v1", JSON.stringify(expenses)); } catch {} }, [expenses]);

  const goals    = useMemo(() => { try { const s = localStorage.getItem("goals_v1"); return s ? JSON.parse(s) : []; } catch { return []; } }, []);
  const fxUsdSgd = useMemo(() => parseFloat(localStorage.getItem("fx_usd_sgd") || "1.35"), []);
  const fxMyrSgd = useMemo(() => parseFloat(localStorage.getItem("fx_myr_sgd") || "0.30"), []);

  const totalIncome    = takeHome + otherIncome;
  const totalExpenses  = useMemo(() => expenses.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0), [expenses]);
  const monthlySavings = totalIncome - totalExpenses;
  const savingsRate    = totalIncome > 0 ? (monthlySavings / totalIncome) * 100 : 0;
  const annualSavings  = monthlySavings * 12;
  const rateColor      = savingsRate >= 20 ? "#6ee7b7" : savingsRate >= 10 ? "#fbbf24" : "#f87171";

  const handleSave = () => {
    if (!form.category || !form.amount) return;
    if (editId !== null) {
      setExpenses(es => es.map(e => e.id === editId ? { ...form, id: editId } : e));
    } else {
      setExpenses(es => [...es, { ...form, id: Date.now() }]);
    }
    setForm({ category: EXPENSE_CATS[0], amount: "", note: "" });
    setEditId(null);
    setShowForm(false);
  };

  const handleEdit   = (exp) => { setForm({ ...exp }); setEditId(exp.id); setShowForm(true); };
  const handleDelete = (id)  => setExpenses(es => es.filter(e => e.id !== id));
  const cancelForm   = ()    => { setForm({ category: EXPENSE_CATS[0], amount: "", note: "" }); setEditId(null); setShowForm(false); };

  const expByCat = useMemo(() => {
    const map = {};
    expenses.forEach(e => { const a = parseFloat(e.amount) || 0; map[e.category] = (map[e.category] || 0) + a; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [expenses]);

  const savingsProjection = useMemo(() => {
    const r = cashReturn / 100;
    return projectionData.map((d, i) => {
      let cash;
      if (r === 0) {
        cash = startCash + annualSavings * i;
      } else {
        // FV of lump sum + FV of constant annual contributions
        const growth = Math.pow(1 + r, i);
        cash = startCash * growth + annualSavings * (growth - 1) / r;
      }
      return { year: i, age: d.age, cpf: d.total, cash: Math.max(0, Math.round(cash)) };
    });
  }, [projectionData, annualSavings, startCash, cashReturn]);

  const fmtSGD   = v => "S$" + Math.round(v).toLocaleString();
  const cardStyle  = { borderRadius: 12, padding: "14px 18px", background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)" };
  const inputStyle = { background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 10px", color: "var(--text)", fontSize: 13, width: "100%" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

      {cpfMonthly && salary > 0 && (
        <div style={{ ...cardStyle, background: "rgba(110,231,183,0.05)", border: "1px solid rgba(110,231,183,0.2)" }}>
          <div style={{ fontSize: 11, color: "#6ee7b7", fontWeight: 600, marginBottom: 8 }}>
            CPF Forced Savings — salary S${salary.toLocaleString()}
          </div>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            {[
              { label: "OA",             val: cpfMonthly.oaAmount,       color: "#6ee7b7" },
              { label: "SA",             val: cpfMonthly.saAmount,        color: "#818cf8" },
              { label: "MA",             val: cpfMonthly.maAmount,        color: "#f472b6" },
              { label: "Employee total", val: cpfMonthly.employeeContrib, color: "var(--text)" },
              { label: "Employer total", val: cpfMonthly.employerContrib, color: "var(--muted)" },
            ].map(({ label, val, color }) => (
              <div key={label}>
                <div style={{ fontSize: 10, color: "var(--muted)" }}>{label}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color }}>{fmtSGD(val)}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 8 }}>
            Take-home ≈ {fmtSGD(cpfMonthly.takeHome)} · use this as your income below
          </div>
        </div>
      )}

      <div style={cardStyle}>
        <div style={{ fontSize: 12, color: "var(--label)", fontWeight: 600, marginBottom: 12 }}>Monthly Income (SGD)</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>Take-home pay (after CPF deduction)</div>
            <input type="number" min={0} value={takeHome} onChange={e => setTakeHome(parseFloat(e.target.value) || 0)} style={inputStyle} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>Other income (freelance, rental, etc.)</div>
            <input type="number" min={0} value={otherIncome} onChange={e => setOtherIncome(parseFloat(e.target.value) || 0)} style={inputStyle} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>Cash / savings starting balance (SGD)</div>
            <input type="number" min={0} value={startCash} onChange={e => setStartCash(parseFloat(e.target.value) || 0)} style={inputStyle} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>
              Cash return rate — {cashReturn.toFixed(1)}% / yr
            </div>
            <input type="range" min={0} max={10} step={0.5} value={cashReturn}
              onChange={e => setCashReturn(parseFloat(e.target.value))}
              style={{ width: "100%", accentColor: "var(--accent)" }} />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--muted)", marginTop: 2 }}>
              <span>0% (no growth)</span><span>5% (index fund)</span><span>10%</span>
            </div>
          </div>
        </div>
      </div>

      <div style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: showForm ? 14 : expenses.length > 0 ? 12 : 0 }}>
          <div style={{ fontSize: 12, color: "var(--label)", fontWeight: 600 }}>Monthly Expenses (SGD)</div>
          <button
            onClick={() => showForm ? cancelForm() : setShowForm(true)}
            style={{ background: showForm ? "rgba(255,255,255,0.06)" : "#f59e0b", color: showForm ? "var(--muted)" : "#000", border: "none", borderRadius: 8, padding: "5px 14px", fontSize: 12, cursor: "pointer", fontWeight: 600 }}
          >{showForm ? "✕ Cancel" : "+ Add"}</button>
        </div>

        {showForm && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>Category</div>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} style={inputStyle}>
                {EXPENSE_CATS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>Amount (SGD) *</div>
              <input type="number" min={0} placeholder="500" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>Note</div>
              <input placeholder="e.g. HDB loan" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} style={inputStyle} />
            </div>
            <div style={{ display: "flex", alignItems: "flex-end" }}>
              <button
                onClick={handleSave} disabled={!form.amount}
                style={{ width: "100%", padding: "8px 0", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13, background: "#f59e0b", color: "#000", opacity: !form.amount ? 0.4 : 1 }}
              >{editId !== null ? "Save Changes" : "Add Expense"}</button>
            </div>
          </div>
        )}

        {expenses.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {expenses.map(e => (
              <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 8, background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)" }}>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{e.category}</span>
                  {e.note && <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: 8, fontStyle: "italic" }}>{e.note}</span>}
                </div>
                <div style={{ fontSize: 13, fontFamily: "'DM Mono', monospace", fontWeight: 600, color: "#f87171" }}>
                  −{fmtSGD(parseFloat(e.amount) || 0)}
                </div>
                <button onClick={() => handleEdit(e)} style={{ background: "rgba(255,255,255,0.06)", color: "var(--muted)", border: "1px solid var(--border)", borderRadius: 6, padding: "3px 8px", fontSize: 11, cursor: "pointer" }}>✎</button>
                <button onClick={() => handleDelete(e.id)} style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 6, padding: "3px 8px", fontSize: 11, cursor: "pointer" }}>✕</button>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 4 }}>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>Total: </span>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#f87171", marginLeft: 6, fontFamily: "'DM Mono', monospace" }}>{fmtSGD(totalExpenses)}</span>
            </div>
          </div>
        )}
      </div>

      {totalIncome > 0 && (<>

        <div style={{ ...cardStyle, textAlign: "center", padding: "28px 18px" }}>
          <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Savings Rate</div>
          <div style={{ fontSize: 56, fontWeight: 800, fontFamily: "'DM Mono', monospace", color: rateColor, lineHeight: 1 }}>
            {savingsRate.toFixed(1)}%
          </div>
          <div style={{ fontSize: 13, color: rateColor, marginTop: 10, fontWeight: 600 }}>
            {savingsRate >= 20 ? "✓ Healthy — on track for long-term goals"
              : savingsRate >= 10 ? "⚠ Below target — aim for 20%+"
              : monthlySavings < 0 ? "✗ Spending more than earning"
              : "✗ Very low — consider reducing expenses"}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
          {[
            { label: "Monthly Income",   value: totalIncome,    color: "#6ee7b7" },
            { label: "Monthly Expenses", value: totalExpenses,  color: "#f87171" },
            { label: "Monthly Savings",  value: monthlySavings, color: rateColor },
            { label: "Annual Savings",   value: annualSavings,  color: rateColor },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ ...cardStyle, textAlign: "center" }}>
              <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 15, fontWeight: 700, color }}>{fmtSGD(value)}</div>
            </div>
          ))}
        </div>

        {totalExpenses > 0 && (
          <div style={cardStyle}>
            <div style={{ fontSize: 12, color: "var(--label)", fontWeight: 600, marginBottom: 10 }}>Income Allocation</div>
            <div style={{ display: "flex", height: 26, borderRadius: 8, overflow: "hidden", gap: 2 }}>
              <div style={{ flex: Math.max(0, totalExpenses), background: "#f87171", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {totalExpenses / totalIncome > 0.12 && (
                  <span style={{ fontSize: 11, color: "#fff", fontWeight: 700 }}>{((totalExpenses / totalIncome) * 100).toFixed(0)}% expenses</span>
                )}
              </div>
              {monthlySavings > 0 && (
                <div style={{ flex: monthlySavings, background: rateColor, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {savingsRate > 8 && (
                    <span style={{ fontSize: 11, color: "#000", fontWeight: 700 }}>{savingsRate.toFixed(0)}% saved</span>
                  )}
                </div>
              )}
            </div>
            {expByCat.length > 0 && (
              <>
                <div style={{ display: "flex", height: 10, borderRadius: 4, overflow: "hidden", gap: 1, marginTop: 6 }}>
                  {expByCat.map(([cat, amt], i) => (
                    <div key={cat} title={`${cat}: ${fmtSGD(amt)}`}
                      style={{ flex: amt, background: EXPENSE_CAT_COLORS[i % EXPENSE_CAT_COLORS.length] }} />
                  ))}
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
                  {expByCat.map(([cat, amt], i) => (
                    <div key={cat} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <div style={{ width: 7, height: 7, borderRadius: 2, background: EXPENSE_CAT_COLORS[i % EXPENSE_CAT_COLORS.length], flexShrink: 0 }} />
                      <span style={{ fontSize: 11, color: "var(--muted)" }}>{cat}</span>
                      <span style={{ fontSize: 11, fontWeight: 600 }}>{fmtSGD(amt)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        <div style={cardStyle}>
          <div style={{ fontSize: 12, color: "var(--label)", fontWeight: 600, marginBottom: 4 }}>Wealth Accumulation Projection</div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 16 }}>
            Cash {cashReturn > 0 ? `compounding at ${cashReturn.toFixed(1)}% p.a.` : "(no investment return)"} stacked with CPF projection
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={savingsProjection} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <defs>
                <linearGradient id="savGradCpf" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6ee7b7" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#6ee7b7" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="savGradCash" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={rateColor} stopOpacity={0.4} />
                  <stop offset="95%" stopColor={rateColor} stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="age" tick={{ fontSize: 11, fill: "var(--muted)" }}
                label={{ value: "Age", position: "insideBottomRight", offset: -5, fontSize: 11, fill: "var(--muted)" }} />
              <YAxis tickFormatter={v => v >= 1000000 ? "S$" + (v / 1000000).toFixed(1) + "M" : "S$" + (v / 1000).toFixed(0) + "k"}
                tick={{ fontSize: 10, fill: "var(--muted)" }} />
              <Tooltip
                formatter={(v, name) => [fmtSGD(v), name]}
                contentStyle={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                labelFormatter={l => `Age ${l}`}
              />
              <Area type="monotone" dataKey="cpf"  name="CPF"          stackId="1" stroke="#6ee7b7"   fill="url(#savGradCpf)"  strokeWidth={1.5} dot={false} />
              <Area type="monotone" dataKey="cash" name="Cash Savings" stackId="1" stroke={rateColor} fill="url(#savGradCash)" strokeWidth={1.5} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
          <div style={{ display: "flex", gap: 16, marginTop: 10, flexWrap: "wrap" }}>
            {[
              { color: "#6ee7b7", label: "CPF (projected)" },
              { color: rateColor, label: cashReturn > 0 ? `Cash savings (${cashReturn.toFixed(1)}% p.a.)` : "Cash savings (no return)" },
            ].map(({ color, label }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: color }} />
                <span style={{ fontSize: 11, color: "var(--muted)" }}>{label}</span>
              </div>
            ))}
          </div>
        </div>

        {goals.length > 0 && (
          <div style={cardStyle}>
            <div style={{ fontSize: 12, color: "var(--label)", fontWeight: 600, marginBottom: 12 }}>Goals Realism Check</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {goals.map(g => {
                const targetSGD = g.currency === "SGD" ? g.target
                  : g.currency === "MYR" ? g.target * fxMyrSgd
                  : g.target * fxUsdSgd;

                if (monthlySavings <= 0) {
                  return (
                    <div key={g.id} style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)" }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#f87171" }}>{g.name}</span>
                      <span style={{ fontSize: 12, color: "var(--muted)", marginLeft: 10 }}>No positive savings — unable to project</span>
                    </div>
                  );
                }

                const monthsNeeded = Math.ceil(targetSGD / monthlySavings);
                const yearsNeeded  = monthsNeeded / 12;
                const currentAge   = projectionData[0]?.age ?? 30;
                const reachAge     = currentAge + yearsNeeded;
                const feasible     = g.targetAge ? reachAge <= g.targetAge : yearsNeeded <= yearsToProject;
                const accentRGB    = feasible ? "110,231,183" : "251,191,36";
                const accentHex    = feasible ? "#6ee7b7" : "#fbbf24";

                let cpfHitAge = null;
                if (g.currency === "SGD" && projectionData) {
                  const hit = projectionData.find(d => d.total >= g.target);
                  cpfHitAge = hit?.age;
                }

                const paceWidth = Math.min(100, g.targetAge
                  ? ((g.targetAge - currentAge) / yearsNeeded) * 100
                  : (yearsToProject / yearsNeeded) * 100);

                return (
                  <div key={g.id} style={{ padding: "12px 14px", borderRadius: 10, background: `rgba(${accentRGB},0.06)`, border: `1px solid rgba(${accentRGB},0.2)` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: accentHex }}>{g.name}</div>
                        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                          Target: {g.currency} {g.target.toLocaleString()}{g.targetAge ? ` by age ${g.targetAge}` : ""}
                          {g.currency !== "SGD" && <span style={{ marginLeft: 6, color: "var(--muted)", fontStyle: "italic" }}>(≈ {fmtSGD(targetSGD)})</span>}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 12, color: "var(--muted)" }}>at {fmtSGD(monthlySavings)}/mo cash</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: accentHex }}>
                          {yearsNeeded < 1
                            ? `${monthsNeeded} months → age ${Math.round(reachAge)}`
                            : `${yearsNeeded.toFixed(1)} yrs → age ${Math.round(reachAge)}`}
                        </div>
                        {cpfHitAge && (
                          <div style={{ fontSize: 11, color: "#6ee7b7", marginTop: 2 }}>CPF alone hits this at age {cpfHitAge}</div>
                        )}
                      </div>
                    </div>
                    <div style={{ height: 5, borderRadius: 3, background: "rgba(255,255,255,0.08)" }}>
                      <div style={{ height: "100%", borderRadius: 3, background: accentHex, width: `${paceWidth}%`, transition: "width 0.3s" }} />
                    </div>
                    <div style={{ fontSize: 10, color: accentHex, marginTop: 3, textAlign: "right" }}>
                      {feasible ? "On track" : g.targetAge ? `${(yearsNeeded - (g.targetAge - currentAge)).toFixed(1)} years behind` : "Beyond projection window"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </>)}

      {totalIncome === 0 && (
        <div style={{ textAlign: "center", color: "var(--muted)", fontSize: 13, padding: "40px 0" }}>
          Enter your monthly income above to see your savings rate.
        </div>
      )}

      <div style={{ padding: "12px 16px", borderRadius: 10, background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", fontSize: 11, color: "var(--muted)", lineHeight: 1.7 }}>
        <strong style={{ color: "var(--label)" }}>Note:</strong> Savings rate = (Income − Expenses) ÷ Income. The 20% benchmark is a widely-used personal finance guideline. Cash projection uses FV of lump sum plus FV of annual contributions at the chosen return rate (0% = simple accumulation). Goals check uses cash savings only; CPF is shown separately. FX for non-SGD goals uses the rates set in the Net Worth tab. For personal planning only — not financial advice.
      </div>
    </div>
  );
}
