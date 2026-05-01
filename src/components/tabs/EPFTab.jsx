import { useState, useMemo, useEffect } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { EPF_PER, EPF_SEJ, EPF_FLK, computeEpfMonthly, projectEpfYears } from "../../lib/epf.js";

export default function EPFTab() {
  const [wage, setWage] = useState(() => parseFloat(localStorage.getItem("epf_wage") || "5000"));
  const [age, setAge] = useState(() => parseInt(localStorage.getItem("epf_age") || "30"));
  const [retireAge, setRetireAge] = useState(() => parseInt(localStorage.getItem("epf_retire_age") || "60"));
  const [annualIncrement, setAnnualIncrement] = useState(() => parseFloat(localStorage.getItem("epf_increment") || "3"));
  const [dividendRate, setDividendRate] = useState(() => parseFloat(localStorage.getItem("epf_dividend") || "5.5"));
  const [startPer, setStartPer] = useState(() => parseFloat(localStorage.getItem("epf_per_start") || "0"));
  const [startSej, setStartSej] = useState(() => parseFloat(localStorage.getItem("epf_sej_start") || "0"));
  const [startFlek, setStartFlek] = useState(() => parseFloat(localStorage.getItem("epf_flek_start") || "0"));
  const [epfTab, setEpfTab] = useState("chart");

  useEffect(() => {
    localStorage.setItem("epf_wage", wage);
    localStorage.setItem("epf_age", age);
    localStorage.setItem("epf_retire_age", retireAge);
    localStorage.setItem("epf_increment", annualIncrement);
    localStorage.setItem("epf_dividend", dividendRate);
    localStorage.setItem("epf_per_start", startPer);
    localStorage.setItem("epf_sej_start", startSej);
    localStorage.setItem("epf_flek_start", startFlek);
  }, [wage, age, retireAge, annualIncrement, dividendRate, startPer, startSej, startFlek]);

  const years = Math.max(1, retireAge - age);
  const monthly = useMemo(() => computeEpfMonthly(wage, age), [wage, age]);
  const projection = useMemo(() => projectEpfYears({ wage, age, annualIncrement, years, dividendRate, startPer, startSej, startFlek }), [wage, age, annualIncrement, years, dividendRate, startPer, startSej, startFlek]);
  const finalRow = projection[projection.length - 1] || { per: startPer, sej: startSej, flek: startFlek, total: startPer + startSej + startFlek };

  const totalAcc = finalRow.per + finalRow.sej + finalRow.flek;
  const perPct = totalAcc > 0 ? (finalRow.per / totalAcc) * 100 : 75;
  const sejPct = totalAcc > 0 ? (finalRow.sej / totalAcc) * 100 : 15;
  const flkPct = totalAcc > 0 ? (finalRow.flek / totalAcc) * 100 : 10;

  const fmtRM = v => "RM " + Math.round(v).toLocaleString();
  const fmtRM2 = v => "RM " + v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  const cardStyle = { borderRadius: 12, padding: "14px 18px", background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)" };
  const inputStyle = { background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 10px", color: "var(--text)", fontSize: 13, width: "100%" };
  const subTabBtn = (id, label) => (
    <button
      key={id}
      onClick={() => setEpfTab(id)}
      style={{
        padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12,
        background: epfTab === id ? EPF_PER : "rgba(255,255,255,0.05)",
        color: epfTab === id ? "#fff" : "var(--muted)",
        fontWeight: epfTab === id ? 600 : 400,
      }}
    >{label}</button>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

      {/* Inputs */}
      <div style={{ ...cardStyle, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14 }}>
        <div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>Monthly Gross Wage (RM)</div>
          <input type="number" min={0} value={wage} onChange={e => setWage(parseFloat(e.target.value) || 0)} style={inputStyle} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>Current Age</div>
          <input type="number" min={18} max={75} value={age} onChange={e => setAge(parseInt(e.target.value) || 30)} style={inputStyle} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>Retirement Age</div>
          <input type="number" min={age + 1} max={80} value={retireAge} onChange={e => setRetireAge(parseInt(e.target.value) || 60)} style={inputStyle} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>Annual Salary Increment (%)</div>
          <input type="number" min={0} max={30} step={0.5} value={annualIncrement} onChange={e => setAnnualIncrement(parseFloat(e.target.value) || 0)} style={inputStyle} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>EPF Dividend Rate (%)</div>
          <input type="number" min={0} max={20} step={0.1} value={dividendRate} onChange={e => setDividendRate(parseFloat(e.target.value) || 0)} style={inputStyle} />
        </div>
      </div>

      {/* Starting Balances */}
      <div style={{ ...cardStyle }}>
        <div style={{ fontSize: 12, color: "var(--label)", fontWeight: 600, marginBottom: 10 }}>Current EPF Balances</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14 }}>
          <div>
            <div style={{ fontSize: 11, color: EPF_PER, marginBottom: 4 }}>Akaun Persaraan (RM)</div>
            <input type="number" min={0} value={startPer} onChange={e => setStartPer(parseFloat(e.target.value) || 0)} style={inputStyle} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: EPF_SEJ, marginBottom: 4 }}>Akaun Sejahtera (RM)</div>
            <input type="number" min={0} value={startSej} onChange={e => setStartSej(parseFloat(e.target.value) || 0)} style={inputStyle} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: EPF_FLK, marginBottom: 4 }}>Akaun Fleksibel (RM)</div>
            <input type="number" min={0} value={startFlek} onChange={e => setStartFlek(parseFloat(e.target.value) || 0)} style={inputStyle} />
          </div>
        </div>
      </div>

      {/* Monthly Breakdown */}
      <div style={{ ...cardStyle }}>
        <div style={{ fontSize: 12, color: "var(--label)", fontWeight: 600, marginBottom: 12 }}>Monthly Contribution Breakdown</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
          {[
            { label: "Employee (11%)", value: monthly.employeeContrib, color: "var(--accent)" },
            { label: `Employer (${age < 60 ? (wage > 5000 ? "12%" : "13%") : "6%"})`, value: monthly.employerContrib, color: "var(--accent2)" },
            { label: "Total Monthly", value: monthly.total, color: "#fff" },
            { label: "Take-Home Pay", value: monthly.takeHome, color: EPF_PER },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: "10px 14px" }}>
              <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 15, fontWeight: 700, color }}>{fmtRM(value)}</div>
            </div>
          ))}
        </div>

        {/* Account allocation bar */}
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 6 }}>Monthly allocation to accounts</div>
          <div style={{ display: "flex", height: 20, borderRadius: 6, overflow: "hidden", gap: 2 }}>
            <div style={{ flex: 75, background: EPF_PER, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 10, color: "#fff", fontWeight: 600 }}>Persaraan 75%</span>
            </div>
            <div style={{ flex: 15, background: EPF_SEJ, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 10, color: "#fff", fontWeight: 600 }}>Sej 15%</span>
            </div>
            <div style={{ flex: 10, background: EPF_FLK, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 10, color: "#fff", fontWeight: 600 }}>10%</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 16, marginTop: 8, flexWrap: "wrap" }}>
            {[
              { label: "Akaun Persaraan", val: monthly.persaraan, color: EPF_PER },
              { label: "Akaun Sejahtera", val: monthly.sejahtera, color: EPF_SEJ },
              { label: "Akaun Fleksibel", val: monthly.fleksibel, color: EPF_FLK },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ fontSize: 12, color: "var(--muted)" }}>
                <span style={{ color, fontWeight: 600 }}>{label}</span>: {fmtRM(val)}/mo
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Projected totals */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
        {[
          { label: `Akaun Persaraan (Yr ${years})`, value: finalRow.per, color: EPF_PER },
          { label: `Akaun Sejahtera (Yr ${years})`, value: finalRow.sej, color: EPF_SEJ },
          { label: `Akaun Fleksibel (Yr ${years})`, value: finalRow.flek, color: EPF_FLK },
          { label: `Total EPF (Yr ${years})`, value: finalRow.total, color: "#fff" },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ ...cardStyle, textAlign: "center" }}>
            <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color }}>{fmtRM(value)}</div>
          </div>
        ))}
      </div>

      {/* Projected balance allocation bar */}
      {totalAcc > 0 && (
        <div style={cardStyle}>
          <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 8 }}>Projected balance allocation at retirement</div>
          <div style={{ display: "flex", height: 22, borderRadius: 6, overflow: "hidden", gap: 2 }}>
            <div style={{ flex: perPct, background: EPF_PER }} />
            <div style={{ flex: sejPct, background: EPF_SEJ }} />
            <div style={{ flex: flkPct, background: EPF_FLK }} />
          </div>
          <div style={{ display: "flex", gap: 16, marginTop: 8, flexWrap: "wrap" }}>
            {[
              { label: "Persaraan", pct: perPct, color: EPF_PER },
              { label: "Sejahtera", pct: sejPct, color: EPF_SEJ },
              { label: "Fleksibel", pct: flkPct, color: EPF_FLK },
            ].map(({ label, pct, color }) => (
              <div key={label} style={{ fontSize: 12, color: "var(--muted)" }}>
                <span style={{ color, fontWeight: 600 }}>{label}</span>: {pct.toFixed(1)}%
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sub-tabs: Chart / Table */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {subTabBtn("chart", "📈 Growth Chart")}
        {subTabBtn("table", "📋 Year-by-Year")}
      </div>

      {/* Growth Chart */}
      {epfTab === "chart" && (
        <div style={cardStyle}>
          <div style={{ fontSize: 12, color: "var(--label)", fontWeight: 600, marginBottom: 12 }}>EPF Balance Projection</div>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={projection} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <defs>
                <linearGradient id="gEpfPer" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={EPF_PER} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={EPF_PER} stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="gEpfSej" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={EPF_SEJ} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={EPF_SEJ} stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="gEpfFlek" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={EPF_FLK} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={EPF_FLK} stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="age" tick={{ fontSize: 11, fill: "var(--muted)" }} label={{ value: "Age", position: "insideBottomRight", offset: -5, fontSize: 11, fill: "var(--muted)" }} />
              <YAxis tickFormatter={v => "RM " + (v >= 1000 ? (v / 1000).toFixed(0) + "k" : v)} tick={{ fontSize: 10, fill: "var(--muted)" }} />
              <Tooltip
                formatter={(v, name) => [fmtRM(v), name]}
                contentStyle={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                labelFormatter={l => `Age ${l}`}
              />
              <Area type="monotone" dataKey="per" name="Persaraan" stroke={EPF_PER} fill="url(#gEpfPer)" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="sej" name="Sejahtera" stroke={EPF_SEJ} fill="url(#gEpfSej)" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="flek" name="Fleksibel" stroke={EPF_FLK} fill="url(#gEpfFlek)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Year-by-Year Table */}
      {epfTab === "table" && (
        <div style={cardStyle}>
          <div style={{ fontSize: 12, color: "var(--label)", fontWeight: 600, marginBottom: 10 }}>Year-by-Year Projection</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ color: "var(--muted)", borderBottom: "1px solid var(--border)" }}>
                  {["Yr", "Age", "Monthly Wage", "Contrib/mo", "Persaraan", "Sejahtera", "Fleksibel", "Total"].map(h => (
                    <th key={h} style={{ padding: "6px 8px", textAlign: "right", fontWeight: 500, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {projection.map((row, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)" }}>
                    <td style={{ padding: "5px 8px", textAlign: "right", color: "var(--muted)" }}>{row.year}</td>
                    <td style={{ padding: "5px 8px", textAlign: "right", color: "var(--muted)" }}>{row.age}</td>
                    <td style={{ padding: "5px 8px", textAlign: "right" }}>RM {row.wage.toLocaleString()}</td>
                    <td style={{ padding: "5px 8px", textAlign: "right" }}>RM {row.monthlyContrib.toLocaleString()}</td>
                    <td style={{ padding: "5px 8px", textAlign: "right", color: EPF_PER }}>{fmtRM(row.per)}</td>
                    <td style={{ padding: "5px 8px", textAlign: "right", color: EPF_SEJ }}>{fmtRM(row.sej)}</td>
                    <td style={{ padding: "5px 8px", textAlign: "right", color: EPF_FLK }}>{fmtRM(row.flek)}</td>
                    <td style={{ padding: "5px 8px", textAlign: "right", fontWeight: 600 }}>{fmtRM(row.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Disclaimer */}
      <div style={{ padding: "12px 16px", borderRadius: 10, background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", fontSize: 11, color: "var(--muted)", lineHeight: 1.7 }}>
        <strong style={{ color: "var(--label)" }}>Note (EPF Malaysia):</strong> Employee contribution is 11% for members under 60 (5.5% reduced rate applies at 60 and above). Employer contributes 12% for wages above RM 5,000 or 13% for RM 5,000 and below, dropping to 6% at 60 and above. Post-2024 restructure: contributions split as Persaraan 75% / Sejahtera 15% / Fleksibel 10%. Dividend is projected at a flat rate applied to average balance. For personal planning only — not financial advice.
      </div>
    </div>
  );
}
