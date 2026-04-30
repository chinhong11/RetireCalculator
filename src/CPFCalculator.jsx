import { useState, useMemo, useCallback } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

// ─── CPF Rate Tables (from 1 Jan 2026) ───────────────────────────────
const CPF_RATES = {
  "spr1": { // 1st year SPR (G/G)
    "55":   { employee: 0.05, employer: 0.04, total: 0.09 },
    "60":   { employee: 0.05, employer: 0.04, total: 0.09 },
    "65":   { employee: 0.05, employer: 0.035, total: 0.085 },
    "999":  { employee: 0.05, employer: 0.035, total: 0.085 },
  },
  "spr2": { // 2nd year SPR (G/G)
    "55":   { employee: 0.15, employer: 0.09, total: 0.24 },
    "60":   { employee: 0.125, employer: 0.06, total: 0.185 },
    "65":   { employee: 0.075, employer: 0.035, total: 0.11 },
    "999":  { employee: 0.05, employer: 0.035, total: 0.085 },
  },
  "spr3": { // 3rd year onwards / SC
    "55":   { employee: 0.20, employer: 0.17, total: 0.37 },
    "60":   { employee: 0.18, employer: 0.16, total: 0.34 },
    "65":   { employee: 0.125, employer: 0.125, total: 0.25 },
    "70":   { employee: 0.075, employer: 0.09, total: 0.165 },
    "999":  { employee: 0.05, employer: 0.075, total: 0.125 },
  },
};

// CPF Account allocation ratios (from 1 Jan 2026)
const ALLOCATION_RATIOS = {
  "35":  { oa: 0.6217, sa: 0.1621, ma: 0.2162 },
  "45":  { oa: 0.5677, sa: 0.1891, ma: 0.2432 },
  "50":  { oa: 0.5136, sa: 0.2162, ma: 0.2702 },
  "55":  { oa: 0.4055, sa: 0.3108, ma: 0.2837 },
  "60":  { oa: 0.353,  sa: 0.3382, ma: 0.3088 },
  "65":  { oa: 0.14,   sa: 0.44,   ma: 0.42 },
  "70":  { oa: 0.0607, sa: 0.303,  ma: 0.6363 },
  "999": { oa: 0.08,   sa: 0.08,   ma: 0.84 },
};

const OW_CEILING = 8000;

function getRateKey(age) {
  if (age <= 55) return "55";
  if (age <= 60) return "60";
  if (age <= 65) return "65";
  if (age <= 70) return "70";
  return "999";
}

function getAllocationKey(age) {
  if (age <= 35) return "35";
  if (age <= 45) return "45";
  if (age <= 50) return "50";
  if (age <= 55) return "55";
  if (age <= 60) return "60";
  if (age <= 65) return "65";
  if (age <= 70) return "70";
  return "999";
}

function getSPRKey(prYear) {
  if (prYear <= 1) return "spr1";
  if (prYear <= 2) return "spr2";
  return "spr3";
}

function getContribRates(age, prYear) {
  const sprKey = getSPRKey(prYear);
  const ageKey = getRateKey(age);
  const table = CPF_RATES[sprKey];
  // find closest key
  const keys = Object.keys(table).map(Number).sort((a, b) => a - b);
  for (const k of keys) {
    if (age <= k) return table[String(k)];
  }
  return table[String(keys[keys.length - 1])];
}

function getAllocation(age) {
  const key = getAllocationKey(age);
  return ALLOCATION_RATIOS[key];
}

function computeMonthly(salary, age, prYear) {
  const cappedOW = Math.min(salary, OW_CEILING);
  const rates = getContribRates(age, prYear);
  const allocation = getAllocation(age);
  
  const employeeContrib = Math.floor(cappedOW * rates.employee);
  const totalContrib = Math.round(cappedOW * rates.total);
  const employerContrib = totalContrib - employeeContrib;
  
  const oaAmount = Math.round(totalContrib * allocation.oa);
  const maAmount = Math.round(totalContrib * allocation.ma);
  const saAmount = totalContrib - oaAmount - maAmount;
  
  return {
    salary,
    cappedOW,
    employeeContrib,
    employerContrib,
    totalContrib,
    takeHome: salary - employeeContrib,
    oaAmount,
    saAmount,
    maAmount,
    rates,
    allocation,
  };
}

function projectYears({ salary, age, prYear, annualIncrement, yearsToProject, oaReturn, saReturn, maReturn }) {
  const data = [];
  let oaBalance = 0, saBalance = 0, maBalance = 0;
  let currentSalary = salary;
  let currentAge = age;
  let currentPRYear = prYear;

  for (let y = 0; y <= yearsToProject; y++) {
    if (y > 0) {
      // Apply interest
      oaBalance *= (1 + oaReturn / 100);
      saBalance *= (1 + saReturn / 100);
      maBalance *= (1 + maReturn / 100);
      
      // Apply salary increment
      currentSalary = currentSalary * (1 + annualIncrement / 100);
      currentAge += 1;
      currentPRYear += 1;
    }
    
    // Contributions for 12 months
    const monthly = computeMonthly(currentSalary, currentAge, currentPRYear);
    if (y > 0) {
      oaBalance += monthly.oaAmount * 12;
      saBalance += monthly.saAmount * 12;
      maBalance += monthly.maAmount * 12;
    }
    
    data.push({
      year: y,
      label: `Year ${y}`,
      age: currentAge,
      prYear: currentPRYear,
      salary: Math.round(currentSalary),
      oa: Math.round(oaBalance),
      sa: Math.round(saBalance),
      ma: Math.round(maBalance),
      total: Math.round(oaBalance + saBalance + maBalance),
      monthlyContrib: monthly.totalContrib,
      annualContrib: monthly.totalContrib * 12,
      takeHome: monthly.takeHome,
    });
  }
  return data;
}

const fmt = (n) => n.toLocaleString("en-SG", { maximumFractionDigits: 0 });
const fmtD = (n) => `$${fmt(n)}`;

// ─── Components ───────────────────────────────────────────────────────

function SliderInput({ label, value, onChange, min, max, step, suffix = "", prefix = "" }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 13, color: "var(--label)", fontWeight: 500, letterSpacing: "0.02em" }}>{label}</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: "var(--accent)", fontFamily: "'DM Mono', monospace" }}>
          {prefix}{typeof value === "number" ? (Number.isInteger(step) || step >= 1 ? value : value.toFixed(1)) : value}{suffix}
        </span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ width: "100%", accentColor: "var(--accent)" }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
        <span>{prefix}{min}{suffix}</span>
        <span>{prefix}{max}{suffix}</span>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, color }) {
  return (
    <div style={{
      background: "var(--card-bg)",
      borderRadius: 14,
      padding: "18px 20px",
      border: "1px solid var(--border)",
      flex: "1 1 0",
      minWidth: 140,
    }}>
      <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: color || "var(--text)", fontFamily: "'DM Mono', monospace" }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function AccountBar({ label, amount, total, color }) {
  const pct = total > 0 ? (amount / total) * 100 : 0;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
        <span style={{ color: "var(--label)", fontWeight: 500 }}>{label}</span>
        <span style={{ fontWeight: 700, fontFamily: "'DM Mono', monospace", color }}>{fmtD(amount)}<span style={{ color: "var(--muted)", fontWeight: 400, fontSize: 11 }}> /mo</span></span>
      </div>
      <div style={{ background: "var(--track)", borderRadius: 6, height: 8, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 6, transition: "width 0.5s ease" }} />
      </div>
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div style={{
      background: "var(--tooltip-bg)",
      backdropFilter: "blur(12px)",
      border: "1px solid var(--border)",
      borderRadius: 12,
      padding: "14px 18px",
      fontSize: 13,
      color: "var(--text)",
      boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
      minWidth: 200,
    }}>
      <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 14 }}>Year {d.year} <span style={{ color: "var(--muted)", fontWeight: 400 }}>(Age {d.age})</span></div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "4px 16px" }}>
        <span style={{ color: "var(--muted)" }}>Salary</span><span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>{fmtD(d.salary)}</span>
        <span style={{ color: "#4ade80" }}>OA</span><span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>{fmtD(d.oa)}</span>
        <span style={{ color: "#818cf8" }}>SA</span><span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>{fmtD(d.sa)}</span>
        <span style={{ color: "#f472b6" }}>MA</span><span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>{fmtD(d.ma)}</span>
        <div style={{ gridColumn: "1 / -1", borderTop: "1px solid var(--border)", margin: "4px 0" }} />
        <span style={{ fontWeight: 600 }}>Total CPF</span><span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 800, color: "var(--accent)" }}>{fmtD(d.total)}</span>
      </div>
    </div>
  );
};

// ─── Main App ─────────────────────────────────────────────────────────

export default function CPFCalculator() {
  const [salary, setSalary] = useState(5000);
  const [age, setAge] = useState(30);
  const [prYear, setPrYear] = useState(1);
  const [annualIncrement, setAnnualIncrement] = useState(3);
  const [yearsToProject, setYearsToProject] = useState(20);
  const [oaReturn, setOaReturn] = useState(2.5);
  const [saReturn, setSaReturn] = useState(4.0);
  const [maReturn, setMaReturn] = useState(4.0);
  const [activeTab, setActiveTab] = useState("projection");

  const monthly = useMemo(() => computeMonthly(salary, age, prYear), [salary, age, prYear]);
  const projectionData = useMemo(() => projectYears({
    salary, age, prYear, annualIncrement, yearsToProject, oaReturn, saReturn, maReturn
  }), [salary, age, prYear, annualIncrement, yearsToProject, oaReturn, saReturn, maReturn]);

  const finalData = projectionData[projectionData.length - 1];

  return (
    <div style={{
      "--bg": "#0a0e17",
      "--card-bg": "rgba(255,255,255,0.03)",
      "--border": "rgba(255,255,255,0.08)",
      "--text": "#e8eaf0",
      "--label": "#a0a8c0",
      "--muted": "#5a6380",
      "--accent": "#6ee7b7",
      "--accent2": "#818cf8",
      "--track": "rgba(255,255,255,0.06)",
      "--tooltip-bg": "rgba(15,20,35,0.92)",
      fontFamily: "'Instrument Sans', 'SF Pro Display', system-ui, sans-serif",
      background: "var(--bg)",
      color: "var(--text)",
      minHeight: "100vh",
      padding: "0 0 40px 0",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        input[type=range] { -webkit-appearance: none; height: 6px; border-radius: 4px; background: var(--track); outline: none; }
        input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 18px; height: 18px; border-radius: 50%; background: var(--accent); cursor: pointer; border: 2px solid var(--bg); box-shadow: 0 0 10px rgba(110,231,183,0.3); }
        input[type=range]::-moz-range-thumb { width: 18px; height: 18px; border-radius: 50%; background: var(--accent); cursor: pointer; border: 2px solid var(--bg); }
        .tab-btn { padding: 10px 20px; border-radius: 10px; border: 1px solid transparent; background: transparent; color: var(--muted); font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; font-family: inherit; }
        .tab-btn:hover { color: var(--text); background: rgba(255,255,255,0.04); }
        .tab-btn.active { background: rgba(110,231,183,0.1); color: var(--accent); border-color: rgba(110,231,183,0.2); }
        .recharts-cartesian-grid-horizontal line, .recharts-cartesian-grid-vertical line { stroke: rgba(255,255,255,0.04); }
        .input-field { width: 100%; padding: 10px 14px; border-radius: 10px; border: 1px solid var(--border); background: rgba(255,255,255,0.04); color: var(--text); font-size: 15px; font-family: 'DM Mono', monospace; font-weight: 500; outline: none; transition: border 0.2s; }
        .input-field:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(110,231,183,0.1); }
        .pr-chip { display: inline-flex; align-items: center; padding: 6px 14px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; border: 1px solid var(--border); background: transparent; color: var(--muted); font-family: inherit; }
        .pr-chip.selected { background: rgba(110,231,183,0.12); color: var(--accent); border-color: rgba(110,231,183,0.25); }
        .section-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--muted); font-weight: 600; margin-bottom: 16px; }
      `}</style>

      {/* Header */}
      <div style={{
        padding: "32px 24px 24px",
        background: "linear-gradient(180deg, rgba(110,231,183,0.06) 0%, transparent 100%)",
        borderBottom: "1px solid var(--border)",
        marginBottom: 24,
      }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent)", boxShadow: "0 0 12px rgba(110,231,183,0.5)" }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Singapore 2026</span>
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.2 }}>
            CPF Contribution<br />Calculator
          </h1>
          <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 8, lineHeight: 1.5 }}>
            For Permanent Residents · OW ceiling $8,000 · Based on official CPF rates
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 800, margin: "0 auto", padding: "0 20px" }}>
        {/* Input Section */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 20,
          marginBottom: 28,
        }}>
          {/* Left: Salary & Profile */}
          <div style={{ background: "var(--card-bg)", borderRadius: 16, padding: 24, border: "1px solid var(--border)" }}>
            <div className="section-title">Your Profile</div>
            
            <div style={{ marginBottom: 18 }}>
              <label style={{ fontSize: 13, color: "var(--label)", fontWeight: 500, display: "block", marginBottom: 6 }}>Monthly Salary (SGD)</label>
              <input
                type="number" className="input-field" value={salary}
                onChange={e => setSalary(Math.max(0, parseInt(e.target.value) || 0))}
                min={0} step={100}
              />
              {salary > OW_CEILING && (
                <div style={{ fontSize: 11, color: "#fbbf24", marginTop: 6, display: "flex", alignItems: "center", gap: 4 }}>
                  ⚠ Capped at ${fmt(OW_CEILING)} OW ceiling for CPF
                </div>
              )}
            </div>

            <SliderInput label="Age" value={age} onChange={setAge} min={21} max={70} step={1} suffix=" yrs" />

            <div style={{ marginBottom: 18 }}>
              <label style={{ fontSize: 13, color: "var(--label)", fontWeight: 500, display: "block", marginBottom: 8 }}>PR Status Year</label>
              <div style={{ display: "flex", gap: 8 }}>
                {[1, 2, 3].map(y => (
                  <button key={y} className={`pr-chip ${prYear === y ? "selected" : ""}`}
                    onClick={() => setPrYear(y)}>
                    {y === 3 ? "3rd yr+" : y === 1 ? "1st yr" : "2nd yr"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Projection Settings */}
          <div style={{ background: "var(--card-bg)", borderRadius: 16, padding: 24, border: "1px solid var(--border)" }}>
            <div className="section-title">Projection Settings</div>
            <SliderInput label="Annual Salary Increment" value={annualIncrement} onChange={setAnnualIncrement} min={0} max={15} step={0.5} suffix="%" />
            <SliderInput label="Project Over" value={yearsToProject} onChange={setYearsToProject} min={1} max={40} step={1} suffix=" years" />
            <SliderInput label="OA Return Rate" value={oaReturn} onChange={setOaReturn} min={0} max={8} step={0.5} suffix="%" />
            <SliderInput label="SA Return Rate" value={saReturn} onChange={setSaReturn} min={0} max={8} step={0.5} suffix="%" />
            <SliderInput label="MA Return Rate" value={maReturn} onChange={setMaReturn} min={0} max={8} step={0.5} suffix="%" />
          </div>
        </div>

        {/* Monthly Breakdown */}
        <div style={{
          background: "var(--card-bg)", borderRadius: 16, padding: 24,
          border: "1px solid var(--border)", marginBottom: 28,
        }}>
          <div className="section-title">Monthly Contribution Breakdown</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 24 }}>
            <StatCard label="Take-Home Pay" value={fmtD(monthly.takeHome)} sub="After employee CPF" color="#e8eaf0" />
            <StatCard label="Your Contribution" value={fmtD(monthly.employeeContrib)} sub={`${(monthly.rates.employee * 100).toFixed(0)}% of capped wage`} color="#f472b6" />
            <StatCard label="Employer Pays" value={fmtD(monthly.employerContrib)} sub={`${(monthly.rates.employer * 100).toFixed(0)}% of capped wage`} color="var(--accent2)" />
            <StatCard label="Total to CPF" value={fmtD(monthly.totalContrib)} sub={`${(monthly.rates.total * 100).toFixed(0)}% combined`} color="var(--accent)" />
          </div>

          <div className="section-title" style={{ marginTop: 8 }}>Account Allocation</div>
          <AccountBar label="Ordinary Account (OA)" amount={monthly.oaAmount} total={monthly.totalContrib} color="#4ade80" />
          <AccountBar label="Special Account (SA)" amount={monthly.saAmount} total={monthly.totalContrib} color="#818cf8" />
          <AccountBar label="MediSave Account (MA)" amount={monthly.maAmount} total={monthly.totalContrib} color="#f472b6" />

          <div style={{
            marginTop: 16, padding: "12px 16px", borderRadius: 10,
            background: "rgba(110,231,183,0.05)", border: "1px solid rgba(110,231,183,0.1)",
            fontSize: 12, color: "var(--label)", lineHeight: 1.6,
          }}>
            {prYear === 1 && "💡 As a 1st-year PR, your combined CPF rate is 9% — much lower than the full 37%. Rates increase in Year 2 (24%) and reach full citizen rates from Year 3 onwards."}
            {prYear === 2 && "💡 As a 2nd-year PR, your combined CPF rate is 24%. From next year, you'll contribute at the full citizen rate of 37%."}
            {prYear >= 3 && "💡 You're contributing at the full citizen rate of 37% (employee 20% + employer 17%)."}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          <button className={`tab-btn ${activeTab === "projection" ? "active" : ""}`} onClick={() => setActiveTab("projection")}>
            📈 Growth Chart
          </button>
          <button className={`tab-btn ${activeTab === "table" ? "active" : ""}`} onClick={() => setActiveTab("table")}>
            📋 Year-by-Year
          </button>
        </div>

        {/* Projection Chart */}
        {activeTab === "projection" && (
          <div style={{
            background: "var(--card-bg)", borderRadius: 16, padding: 24,
            border: "1px solid var(--border)", marginBottom: 28,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 24 }}>
              <div>
                <div className="section-title" style={{ marginBottom: 4 }}>Projected CPF Balance</div>
                <div style={{ fontSize: 32, fontWeight: 800, fontFamily: "'DM Mono', monospace", color: "var(--accent)" }}>
                  {fmtD(finalData.total)}
                </div>
                <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>
                  After {yearsToProject} years · Age {finalData.age}
                </div>
              </div>
              <div style={{ display: "flex", gap: 16, fontSize: 12 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: "#4ade80" }}></span> OA</span>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: "#818cf8" }}></span> SA</span>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: "#f472b6" }}></span> MA</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={projectionData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <defs>
                  <linearGradient id="gOA" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4ade80" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#4ade80" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="gSA" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#818cf8" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#818cf8" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="gMA" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f472b6" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#f472b6" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="year" tick={{ fill: "#5a6380", fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fill: "#5a6380", fontSize: 11 }} axisLine={false} tickLine={false}
                  tickFormatter={v => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : v}
                  width={55}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="oa" stackId="1" stroke="#4ade80" fill="url(#gOA)" strokeWidth={2} />
                <Area type="monotone" dataKey="sa" stackId="1" stroke="#818cf8" fill="url(#gSA)" strokeWidth={2} />
                <Area type="monotone" dataKey="ma" stackId="1" stroke="#f472b6" fill="url(#gMA)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Table View */}
        {activeTab === "table" && (
          <div style={{
            background: "var(--card-bg)", borderRadius: 16,
            border: "1px solid var(--border)", marginBottom: 28, overflow: "hidden",
          }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    {["Year", "Age", "PR Yr", "Salary", "Monthly", "OA", "SA", "MA", "Total CPF"].map(h => (
                      <th key={h} style={{
                        padding: "14px 12px", textAlign: "right", fontSize: 11, fontWeight: 600,
                        color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em",
                        position: "sticky", top: 0, background: "var(--bg)",
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {projectionData.map((d, i) => (
                    <tr key={i} style={{
                      borderBottom: "1px solid var(--border)",
                      background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)",
                    }}>
                      <td style={{ padding: "12px", textAlign: "right", fontWeight: 600 }}>{d.year}</td>
                      <td style={{ padding: "12px", textAlign: "right", color: "var(--label)" }}>{d.age}</td>
                      <td style={{ padding: "12px", textAlign: "right", color: "var(--label)" }}>
                        {d.prYear >= 3 ? "3+" : d.prYear}
                      </td>
                      <td style={{ padding: "12px", textAlign: "right", fontFamily: "'DM Mono', monospace" }}>{fmtD(d.salary)}</td>
                      <td style={{ padding: "12px", textAlign: "right", fontFamily: "'DM Mono', monospace" }}>{fmtD(d.monthlyContrib)}</td>
                      <td style={{ padding: "12px", textAlign: "right", fontFamily: "'DM Mono', monospace", color: "#4ade80" }}>{fmtD(d.oa)}</td>
                      <td style={{ padding: "12px", textAlign: "right", fontFamily: "'DM Mono', monospace", color: "#818cf8" }}>{fmtD(d.sa)}</td>
                      <td style={{ padding: "12px", textAlign: "right", fontFamily: "'DM Mono', monospace", color: "#f472b6" }}>{fmtD(d.ma)}</td>
                      <td style={{ padding: "12px", textAlign: "right", fontFamily: "'DM Mono', monospace", fontWeight: 700, color: "var(--accent)" }}>{fmtD(d.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Summary Cards */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 12, marginBottom: 28,
        }}>
          <StatCard label={`OA Balance (Yr ${yearsToProject})`} value={fmtD(finalData.oa)} color="#4ade80" sub={`at ${oaReturn}% return`} />
          <StatCard label={`SA Balance (Yr ${yearsToProject})`} value={fmtD(finalData.sa)} color="#818cf8" sub={`at ${saReturn}% return`} />
          <StatCard label={`MA Balance (Yr ${yearsToProject})`} value={fmtD(finalData.ma)} color="#f472b6" sub={`at ${maReturn}% return`} />
        </div>

        {/* Footer Disclaimer */}
        <div style={{
          padding: "16px 20px", borderRadius: 12,
          background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)",
          fontSize: 11, color: "var(--muted)", lineHeight: 1.7,
        }}>
          <strong style={{ color: "var(--label)" }}>Disclaimer:</strong> This calculator is for estimation purposes only.
          Rates are based on CPF Board's official tables effective 1 Jan 2026.
          OW ceiling is $8,000/month. Actual contributions may vary due to Additional Wages, bonus months,
          annual salary ceiling ($102,000), and rounding rules. Interest computation uses a simplified annual model
          and does not include the extra 1% on first $60K or extra 0.5% on next $30K of combined balances.
          Always refer to <span style={{ color: "var(--accent)" }}>cpf.gov.sg</span> for official calculations.
        </div>
      </div>
    </div>
  );
}
