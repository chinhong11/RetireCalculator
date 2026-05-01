import { useState, useEffect, useMemo } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { projectEpfYears } from "../../lib/epf.js";

export default function FireTab({ projectionData, yearsToProject }) {
  const [monthlyExpenses, setMonthlyExpenses] = useState(() => parseFloat(localStorage.getItem("fire_monthly_exp") || "3000"));
  const [withdrawalRate,  setWithdrawalRate]  = useState(() => parseFloat(localStorage.getItem("fire_rate") || "4"));
  const [includeEpf,      setIncludeEpf]      = useState(() => localStorage.getItem("fire_incl_epf")  !== "false");
  const [includeCash,     setIncludeCash]     = useState(() => localStorage.getItem("fire_incl_cash") !== "false");

  useEffect(() => { localStorage.setItem("fire_monthly_exp", monthlyExpenses); }, [monthlyExpenses]);
  useEffect(() => { localStorage.setItem("fire_rate",        withdrawalRate);  }, [withdrawalRate]);
  useEffect(() => { localStorage.setItem("fire_incl_epf",   includeEpf);      }, [includeEpf]);
  useEffect(() => { localStorage.setItem("fire_incl_cash",  includeCash);     }, [includeCash]);

  const usdToSgd = useMemo(() => parseFloat(localStorage.getItem("fx_usd_sgd") || "1.35"), []);
  const myrToSgd = useMemo(() => parseFloat(localStorage.getItem("fx_myr_sgd") || "0.30"), []);

  const stockHoldings  = useMemo(() => { try { const s = localStorage.getItem("stocks_v1");   return s ? JSON.parse(s) : []; } catch { return []; } }, []);
  const cryptoHoldings = useMemo(() => { try { const s = localStorage.getItem("crypto_v1");   return s ? JSON.parse(s) : []; } catch { return []; } }, []);
  const myStocks       = useMemo(() => { try { const s = localStorage.getItem("mystocks_v1"); return s ? JSON.parse(s) : []; } catch { return []; } }, []);
  const properties     = useMemo(() => { try { const s = localStorage.getItem("hl_props_v1"); return s ? JSON.parse(s) : []; } catch { return []; } }, []);
  const fdList         = useMemo(() => { try { const s = localStorage.getItem("fd_v1");       return s ? JSON.parse(s) : []; } catch { return []; } }, []);

  const epfSettings = useMemo(() => ({
    wage:      parseFloat(localStorage.getItem("epf_wage")       || "0"),
    age:       parseInt(localStorage.getItem("epf_age")          || "30"),
    increment: parseFloat(localStorage.getItem("epf_increment")  || "3"),
    dividend:  parseFloat(localStorage.getItem("epf_dividend")   || "5.5"),
    startPer:  parseFloat(localStorage.getItem("epf_per_start")  || "0"),
    startSej:  parseFloat(localStorage.getItem("epf_sej_start")  || "0"),
    startFlek: parseFloat(localStorage.getItem("epf_flek_start") || "0"),
  }), []);

  const epfProjection = useMemo(() => {
    if (!epfSettings.wage || yearsToProject < 1) return [];
    return projectEpfYears({
      wage: epfSettings.wage, age: epfSettings.age,
      annualIncrement: epfSettings.increment, years: yearsToProject,
      dividendRate: epfSettings.dividend,
      startPer: epfSettings.startPer, startSej: epfSettings.startSej, startFlek: epfSettings.startFlek,
    });
  }, [epfSettings, yearsToProject]);

  // Live price caches written by portfolio tabs when prices are fetched
  const stockPrices   = useMemo(() => { try { return JSON.parse(localStorage.getItem("stocks_prices_v1")   || "{}"); } catch { return {}; } }, []);
  const cryptoPrices  = useMemo(() => { try { return JSON.parse(localStorage.getItem("crypto_prices_v1")   || "{}"); } catch { return {}; } }, []);
  const myStockPrices = useMemo(() => { try { return JSON.parse(localStorage.getItem("mystocks_prices_v1") || "{}"); } catch { return {}; } }, []);

  // Per-holding market value: live price × qty when available, cost basis otherwise
  const stocksValue  = stockHoldings.reduce((s, h) => {
    const lp = stockPrices[h.ticker];
    return s + (lp ? h.shares * lp.price : h.shares * h.avgCost + (h.totalFees || 0));
  }, 0);
  const cryptoValue  = cryptoHoldings.reduce((s, h) => {
    const lp = cryptoPrices[h.ticker];
    return s + (lp ? h.amount * lp.price : h.amount * h.buyPrice + (h.totalFees || 0));
  }, 0);
  const myStockValue = myStocks.reduce((s, h) => {
    const lp = myStockPrices[h.code];
    return s + (lp ? h.shares * lp.price : h.shares * h.avgCost + (h.totalFees || 0));
  }, 0);

  const usingLivePrices = stockHoldings.some(h => stockPrices[h.ticker])
    || cryptoHoldings.some(h => cryptoPrices[h.ticker])
    || myStocks.some(h => myStockPrices[h.code]);

  const fdPrincipal   = fdList.reduce((s, fd) => s + (parseFloat(fd.principal) || 0), 0);
  const housingEquity = properties.reduce((s, p) => s + (p.downpaymentRecords || []).reduce((a, r) => a + (r.amount || 0), 0), 0);
  const epfStart      = epfSettings.startPer + epfSettings.startSej + epfSettings.startFlek;

  const monthlySavings = useMemo(() => {
    const inc = parseFloat(localStorage.getItem("sav_income") || "0") + parseFloat(localStorage.getItem("sav_other") || "0");
    let exp = 0;
    try { const s = localStorage.getItem("sav_expenses_v1"); if (s) JSON.parse(s).forEach(e => { exp += parseFloat(e.amount) || 0; }); } catch {}
    return Math.max(0, inc - exp);
  }, []);

  const annualExpenses = monthlyExpenses * 12;
  const fireNumber     = annualExpenses / (withdrawalRate / 100);

  const combinedProjection = useMemo(() => projectionData.map((d, i) => {
    const cpf          = d.total;
    const epfMYR       = i === 0 ? epfStart : (epfProjection[i - 1]?.total ?? epfStart);
    const epf          = includeEpf ? Math.round(epfMYR * myrToSgd) : 0;
    const staticAssets = Math.round((housingEquity + myStockValue + fdPrincipal) * myrToSgd + (stocksValue + cryptoValue) * usdToSgd);
    const cash         = includeCash ? Math.round(monthlySavings * 12 * i) : 0;
    return { year: i, age: d.age, cpf, epf, staticAssets, cash, total: cpf + epf + staticAssets + cash, fireTarget: fireNumber };
  }), [projectionData, epfProjection, epfStart, myrToSgd, usdToSgd, housingEquity, myStockValue, fdPrincipal, stocksValue, cryptoValue, monthlySavings, includeEpf, includeCash, fireNumber]);

  const currentWealth = combinedProjection[0]?.total || 0;
  const fireProgress  = fireNumber > 0 ? Math.min(100, (currentWealth / fireNumber) * 100) : 0;
  const crossover     = combinedProjection.find(d => d.total >= fireNumber);
  const gap           = Math.max(0, fireNumber - currentWealth);

  const fmtSGD  = v => "S$" + Math.round(v).toLocaleString();
  const fmtSGDM = v => v >= 1_000_000 ? "S$" + (v / 1_000_000).toFixed(2) + "M" : v >= 1000 ? "S$" + (v / 1000).toFixed(0) + "k" : fmtSGD(v);
  const cardStyle  = { borderRadius: 12, padding: "14px 18px", background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)" };
  const inputStyle = { background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 10px", color: "var(--text)", fontSize: 13, width: "100%" };
  const FIRE_COLOR = "#f59e0b";

  const PresetBtn = ({ label, rate }) => (
    <button onClick={() => setWithdrawalRate(rate)} style={{
      padding: "4px 12px", borderRadius: 8, border: "1px solid",
      borderColor: withdrawalRate === rate ? "rgba(245,158,11,0.4)" : "var(--border)",
      background:  withdrawalRate === rate ? "rgba(245,158,11,0.1)" : "transparent",
      color:       withdrawalRate === rate ? FIRE_COLOR : "var(--muted)",
      fontSize: 11, cursor: "pointer", fontFamily: "inherit",
    }}>{label}</button>
  );

  const ToggleChip = ({ label, value, onChange }) => (
    <button onClick={() => onChange(!value)} style={{
      padding: "5px 12px", borderRadius: 8, border: "1px solid",
      borderColor: value ? "rgba(245,158,11,0.4)" : "var(--border)",
      background:  value ? "rgba(245,158,11,0.1)" : "transparent",
      color:       value ? FIRE_COLOR : "var(--muted)",
      fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
    }}>{value ? "✓" : "○"} {label}</button>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

      <div style={cardStyle}>
        <div style={{ fontSize: 12, color: "var(--label)", fontWeight: 600, marginBottom: 12 }}>FIRE Settings</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>Target monthly expenses in retirement (SGD)</div>
            <input type="number" min={0} step={100} value={monthlyExpenses}
              onChange={e => setMonthlyExpenses(parseFloat(e.target.value) || 0)} style={inputStyle} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>Safe withdrawal rate (%)</div>
            <input type="number" min={1} max={10} step={0.1} value={withdrawalRate}
              onChange={e => setWithdrawalRate(parseFloat(e.target.value) || 4)} style={inputStyle} />
          </div>
        </div>
        <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 6 }}>Withdrawal rate presets:</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          <PresetBtn label="Lean FIRE (5%)"       rate={5}   />
          <PresetBtn label="4% Rule"              rate={4}   />
          <PresetBtn label="Conservative (3.5%)"  rate={3.5} />
          <PresetBtn label="Fat FIRE (3%)"        rate={3}   />
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <ToggleChip label="Include EPF"          value={includeEpf}  onChange={setIncludeEpf}  />
          <ToggleChip label="Include cash savings" value={includeCash} onChange={setIncludeCash} />
        </div>
      </div>

      <div style={{ ...cardStyle, background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.25)", textAlign: "center", padding: "28px 20px" }}>
        <div style={{ fontSize: 11, color: FIRE_COLOR, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Your FIRE Number</div>
        <div style={{ fontSize: 52, fontWeight: 800, fontFamily: "'DM Mono', monospace", color: FIRE_COLOR, lineHeight: 1 }}>{fmtSGDM(fireNumber)}</div>
        <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 8 }}>
          S${annualExpenses.toLocaleString()}/yr annual expenses × {(100 / withdrawalRate).toFixed(0)}× multiplier
        </div>
      </div>

      <div style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 12, flexWrap: "wrap", gap: 6 }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--muted)" }}>Current net worth (today)</div>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "'DM Mono', monospace" }}>{fmtSGD(currentWealth)}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: "var(--muted)" }}>Gap to FIRE</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: gap === 0 ? "#6ee7b7" : "#f87171", fontFamily: "'DM Mono', monospace" }}>{fmtSGD(gap)}</div>
          </div>
        </div>
        <div style={{ height: 20, borderRadius: 10, background: "rgba(255,255,255,0.07)", overflow: "hidden" }}>
          <div style={{
            height: "100%", borderRadius: 10,
            background: `linear-gradient(90deg, ${FIRE_COLOR}, #fde68a)`,
            width: `${fireProgress}%`, transition: "width 0.4s",
          }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
          <span style={{ fontSize: 12, color: FIRE_COLOR, fontWeight: 700 }}>{fireProgress.toFixed(1)}% of FIRE</span>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>Target: {fmtSGDM(fireNumber)}</span>
        </div>
      </div>

      {crossover ? (
        <div style={{ ...cardStyle, background: "rgba(110,231,183,0.07)", border: "1px solid rgba(110,231,183,0.3)", textAlign: "center", padding: "24px 20px" }}>
          <div style={{ fontSize: 11, color: "#6ee7b7", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>🔥 FIRE Crossover</div>
          <div style={{ fontSize: 42, fontWeight: 800, fontFamily: "'DM Mono', monospace", color: "#6ee7b7", marginTop: 4, lineHeight: 1 }}>
            Age {crossover.age}
          </div>
          <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 8 }}>
            {crossover.year === 0
              ? "You're already financially independent!"
              : `Year ${crossover.year} · ${crossover.year} year${crossover.year !== 1 ? "s" : ""} from now · projected net worth ${fmtSGD(crossover.total)}`}
          </div>
        </div>
      ) : (
        <div style={{ ...cardStyle, background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)", textAlign: "center", padding: "20px" }}>
          <div style={{ fontSize: 14, color: "#f87171", fontWeight: 600 }}>FIRE not reached within {yearsToProject}-year window</div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>
            Try: extending the projection slider · increasing savings rate · lowering target expenses
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
        {[
          { label: "Annual expenses",               value: fmtSGD(annualExpenses),   color: "var(--muted)" },
          { label: "FIRE number",                   value: fmtSGDM(fireNumber),      color: FIRE_COLOR     },
          { label: "Monthly passive income @ FIRE", value: fmtSGD(monthlyExpenses),  color: "#6ee7b7"      },
          { label: "Withdrawal rate",               value: `${withdrawalRate}%`,      color: "#818cf8"      },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ ...cardStyle, textAlign: "center" }}>
            <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color }}>{value}</div>
          </div>
        ))}
      </div>

      <div style={cardStyle}>
        <div style={{ fontSize: 12, color: "var(--label)", fontWeight: 600, marginBottom: 4 }}>Net Worth vs FIRE Target</div>
        <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 16 }}>
          {crossover ? `Projected to cross FIRE target at age ${crossover.age}` : `FIRE target not reached within ${yearsToProject} years — extend projection slider`}
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={combinedProjection} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <defs>
              {[["fireGradCpf","#6ee7b7"],["fireGradEpf","#6366f1"],["fireGradStatic","#38bdf8"],["fireGradCash",FIRE_COLOR]].map(([id, color]) => (
                <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={color} stopOpacity={0.4} />
                  <stop offset="95%" stopColor={color} stopOpacity={0.05} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="age" tick={{ fontSize: 11, fill: "var(--muted)" }}
              label={{ value: "Age", position: "insideBottomRight", offset: -5, fontSize: 11, fill: "var(--muted)" }} />
            <YAxis tickFormatter={v => v >= 1_000_000 ? "S$" + (v / 1_000_000).toFixed(1) + "M" : "S$" + (v / 1000).toFixed(0) + "k"}
              tick={{ fontSize: 10, fill: "var(--muted)" }} />
            <Tooltip
              formatter={(v, name) => [name === "FIRE Target" ? fmtSGDM(v) : fmtSGD(v), name]}
              contentStyle={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
              labelFormatter={l => `Age ${l}`}
            />
            <Area type="monotone" dataKey="cpf"          name="CPF"          stackId="1" stroke="#6ee7b7"   fill="url(#fireGradCpf)"    strokeWidth={1.5} dot={false} />
            {includeEpf  && <Area type="monotone" dataKey="epf"          name="EPF (SGD)"    stackId="1" stroke="#6366f1"   fill="url(#fireGradEpf)"    strokeWidth={1.5} dot={false} />}
            <Area type="monotone" dataKey="staticAssets" name="Other Assets" stackId="1" stroke="#38bdf8"   fill="url(#fireGradStatic)" strokeWidth={1.5} dot={false} />
            {includeCash && <Area type="monotone" dataKey="cash"         name="Cash Savings" stackId="1" stroke={FIRE_COLOR} fill="url(#fireGradCash)"  strokeWidth={1.5} dot={false} />}
            <Area type="monotone" dataKey="fireTarget" name="FIRE Target" stackId={undefined}
              stroke={FIRE_COLOR} fill="none" strokeWidth={2} strokeDasharray="8 4" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div style={cardStyle}>
        <div style={{ fontSize: 12, color: "var(--label)", fontWeight: 600, marginBottom: 12 }}>Sensitivity — FIRE Number by Monthly Expenses</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ color: "var(--muted)", borderBottom: "1px solid var(--border)" }}>
                {["Monthly Expenses", "Annual", "@ 5% (Lean)", "@ 4% (Standard)", "@ 3% (Fat)"].map(h => (
                  <th key={h} style={{ padding: "6px 10px", textAlign: "right", fontWeight: 500, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[1000, 1500, 2000, 2500, 3000, 4000, 5000, 7500, 10000].map(mo => {
                const an = mo * 12;
                const isActive = mo === Math.round(monthlyExpenses / 500) * 500 || mo === monthlyExpenses;
                return (
                  <tr key={mo} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", background: isActive ? "rgba(245,158,11,0.08)" : "transparent" }}>
                    <td style={{ padding: "5px 10px", textAlign: "right", color: isActive ? FIRE_COLOR : "var(--text)", fontWeight: isActive ? 700 : 400 }}>
                      {fmtSGD(mo)}/mo
                    </td>
                    <td style={{ padding: "5px 10px", textAlign: "right", color: "var(--muted)" }}>{fmtSGD(an)}/yr</td>
                    <td style={{ padding: "5px 10px", textAlign: "right", fontFamily: "'DM Mono', monospace" }}>{fmtSGDM(an / 0.05)}</td>
                    <td style={{ padding: "5px 10px", textAlign: "right", fontFamily: "'DM Mono', monospace", color: isActive ? FIRE_COLOR : "inherit", fontWeight: isActive ? 700 : 400 }}>{fmtSGDM(an / 0.04)}</td>
                    <td style={{ padding: "5px 10px", textAlign: "right", fontFamily: "'DM Mono', monospace" }}>{fmtSGDM(an / 0.03)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ padding: "12px 16px", borderRadius: 10, background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", fontSize: 11, color: "var(--muted)", lineHeight: 1.7 }}>
        <strong style={{ color: "var(--label)" }}>Note:</strong> FIRE number = Annual expenses ÷ Safe withdrawal rate. The 4% rule originates from the Trinity Study (US equities, 30-year horizon). CPF and EPF are projected using their respective tab settings. Stocks and crypto use <strong style={{ color: "var(--label)" }}>{usingLivePrices ? "live market prices" : "cost basis (no prices fetched yet)"}</strong> — visit the portfolio tabs and fetch prices for a more accurate net worth. Housing equity and Fixed Deposits are static (no future appreciation). Cash savings are projected at a flat monthly rate. For planning purposes only — not financial advice.
      </div>
    </div>
  );
}
