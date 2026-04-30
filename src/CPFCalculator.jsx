import { useState, useMemo, useCallback, useEffect } from "react";
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

// ─── Housing Loan Tab ─────────────────────────────────────────────────

const RM  = (n) => "RM " + Number(n || 0).toLocaleString("en-MY", { maximumFractionDigits: 0 });
const RM2 = (n) => "RM " + Number(n || 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function calcInstallment(principal, annualRatePct, tenureYears) {
  if (!principal || !annualRatePct || !tenureYears) return 0;
  const r = annualRatePct / 100 / 12;
  const n = tenureYears * 12;
  if (r === 0) return principal / n;
  return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function newProperty() {
  return {
    id: uid(), name: "My Property", developer: "", address: "",
    type: "under_construction",
    purchasePrice: 500000, interestRate: 4.0, tenure: 35,
    spaDate: "", vpDate: "",
    downpaymentRecords: [], progressiveRecords: [],
  };
}

function LabelField({ label, children }) {
  return (
    <div>
      <label style={{ fontSize: 12, color: "var(--label)", display: "block", marginBottom: 5, fontWeight: 500 }}>{label}</label>
      {children}
    </div>
  );
}

function HousingLoanTab() {
  const [properties, setProperties] = useState(() => {
    try {
      const s = localStorage.getItem("hl_props_v1");
      if (s) { const p = JSON.parse(s); if (Array.isArray(p) && p.length) return p; }
    } catch {}
    return [newProperty()];
  });

  const [selId, setSelId] = useState(() => {
    try { return localStorage.getItem("hl_selid_v1") || null; } catch { return null; }
  });

  const [dpForm, setDpForm] = useState({ date: "", amount: "", note: "" });
  const [prForm, setPrForm] = useState({ month: "", claimAmount: "", stage: "", note: "" });

  useEffect(() => {
    try { localStorage.setItem("hl_props_v1", JSON.stringify(properties)); } catch {}
  }, [properties]);

  useEffect(() => {
    if (selId) try { localStorage.setItem("hl_selid_v1", selId); } catch {}
  }, [selId]);

  const effectiveId = (properties.find(p => p.id === selId) ? selId : properties[0]?.id) || null;
  const prop = properties.find(p => p.id === effectiveId) || null;

  const upd = (updates) => setProperties(ps => ps.map(p => p.id === effectiveId ? { ...p, ...updates } : p));

  const addProp = () => {
    const np = newProperty();
    setProperties(ps => [...ps, np]);
    setSelId(np.id);
  };

  const delProp = () => {
    if (!window.confirm(`Delete "${prop?.name}"? This cannot be undone.`)) return;
    setProperties(ps => {
      const next = ps.filter(p => p.id !== effectiveId);
      const fallback = next.length ? next : [newProperty()];
      setSelId(fallback[0].id);
      return fallback;
    });
  };

  const addDP = () => {
    if (!prop || !dpForm.date || !dpForm.amount) return;
    const rec = { id: uid(), date: dpForm.date, amount: parseFloat(dpForm.amount) || 0, note: dpForm.note.trim() };
    upd({ downpaymentRecords: [...(prop.downpaymentRecords || []), rec].sort((a, b) => a.date.localeCompare(b.date)) });
    setDpForm({ date: "", amount: "", note: "" });
  };

  const delDP = (recId) => prop && upd({ downpaymentRecords: prop.downpaymentRecords.filter(r => r.id !== recId) });

  const addPR = () => {
    if (!prop || !prForm.month || !prForm.claimAmount) return;
    const rec = { id: uid(), month: prForm.month, claimAmount: parseFloat(prForm.claimAmount) || 0, stage: prForm.stage.trim(), note: prForm.note.trim() };
    upd({ progressiveRecords: [...(prop.progressiveRecords || []), rec].sort((a, b) => a.month.localeCompare(b.month)) });
    setPrForm({ month: "", claimAmount: "", stage: "", note: "" });
  };

  const delPR = (recId) => prop && upd({ progressiveRecords: prop.progressiveRecords.filter(r => r.id !== recId) });

  const totalDownpaid = useMemo(() =>
    (prop?.downpaymentRecords || []).reduce((s, r) => s + (r.amount || 0), 0), [prop]);

  const loanAmount = Math.max(0, (prop?.purchasePrice || 0) - totalDownpaid);
  const monthlyInstallment = calcInstallment(loanAmount, prop?.interestRate || 0, prop?.tenure || 0);
  const totalPayable = monthlyInstallment * (prop?.tenure || 0) * 12;
  const totalInterest = Math.max(0, totalPayable - loanAmount);

  const progressiveTimeline = useMemo(() => {
    if (!prop) return [];
    const r = (prop.interestRate || 0) / 100 / 12;
    let cum = 0;
    return (prop.progressiveRecords || []).map(rec => {
      cum += rec.claimAmount || 0;
      return { ...rec, cumulative: cum, monthlyInterest: cum * r };
    });
  }, [prop]);

  const totalProgInterest = progressiveTimeline.reduce((s, r) => s + r.monthlyInterest, 0);

  if (!prop) return null;

  const addBtnStyle = {
    padding: "8px 18px", borderRadius: 8, background: "rgba(110,231,183,0.12)",
    color: "var(--accent)", border: "1px solid rgba(110,231,183,0.25)",
    cursor: "pointer", fontWeight: 600, fontSize: 13, fontFamily: "inherit", whiteSpace: "nowrap",
  };

  return (
    <div>
      {/* Property Selector */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 20 }}>
        {properties.map(p => (
          <button key={p.id} onClick={() => setSelId(p.id)} className={`pr-chip ${p.id === effectiveId ? "selected" : ""}`}>
            🏠 {p.name}
          </button>
        ))}
        <button onClick={addProp} className="pr-chip" style={{ color: "var(--accent)", borderColor: "rgba(110,231,183,0.3)" }}>
          + Add Property
        </button>
      </div>

      {/* Property Details Form */}
      <div style={{ background: "var(--card-bg)", borderRadius: 16, padding: 24, border: "1px solid var(--border)", marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div className="section-title" style={{ margin: 0 }}>Property Details</div>
          <button onClick={delProp} style={{ padding: "5px 14px", borderRadius: 8, background: "rgba(248,113,113,0.1)", color: "#f87171", border: "1px solid rgba(248,113,113,0.2)", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit" }}>
            Delete Property
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 14 }}>
          <LabelField label="Property Name">
            <input className="hl-in" value={prop.name} onChange={e => upd({ name: e.target.value })} placeholder="e.g. Residensi Tropika Unit A-12-3" />
          </LabelField>
          <LabelField label="Developer / Vendor">
            <input className="hl-in" value={prop.developer} onChange={e => upd({ developer: e.target.value })} placeholder="Developer or seller name" />
          </LabelField>
          <LabelField label="Address">
            <input className="hl-in" value={prop.address || ""} onChange={e => upd({ address: e.target.value })} placeholder="Property address" />
          </LabelField>
          <LabelField label="Property Type">
            <select className="hl-in" value={prop.type} onChange={e => upd({ type: e.target.value })}>
              <option value="under_construction">Under Construction (Dalam Pembinaan)</option>
              <option value="completed">Completed / Subsale</option>
            </select>
          </LabelField>
          <LabelField label="Purchase Price (RM)">
            <input className="hl-in" type="number" value={prop.purchasePrice} onChange={e => upd({ purchasePrice: parseFloat(e.target.value) || 0 })} min={0} step={1000} style={{ fontFamily: "'DM Mono', monospace" }} />
          </LabelField>
          <LabelField label="Interest Rate (% p.a.)">
            <input className="hl-in" type="number" value={prop.interestRate} onChange={e => upd({ interestRate: parseFloat(e.target.value) || 0 })} min={0} max={20} step={0.05} style={{ fontFamily: "'DM Mono', monospace" }} />
          </LabelField>
          <LabelField label="Loan Tenure (Years)">
            <input className="hl-in" type="number" value={prop.tenure} onChange={e => upd({ tenure: parseInt(e.target.value) || 0 })} min={1} max={35} step={1} style={{ fontFamily: "'DM Mono', monospace" }} />
          </LabelField>
          <LabelField label="SPA Date">
            <input className="hl-in" type="date" value={prop.spaDate} onChange={e => upd({ spaDate: e.target.value })} />
          </LabelField>
          <LabelField label={prop.type === "under_construction" ? "Expected VP / Handover Date" : "Completion / Key Date"}>
            <input className="hl-in" type="date" value={prop.vpDate} onChange={e => upd({ vpDate: e.target.value })} />
          </LabelField>
        </div>
      </div>

      {/* Loan Summary Cards */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
        <StatCard label="Purchase Price" value={RM(prop.purchasePrice)} color="#e8eaf0" />
        <StatCard label="Downpayment Paid" value={RM(totalDownpaid)} sub={prop.purchasePrice > 0 ? `${((totalDownpaid / prop.purchasePrice) * 100).toFixed(1)}% of price` : "—"} color="var(--accent)" />
        <StatCard label="Loan Amount" value={RM(loanAmount)} sub={prop.purchasePrice > 0 ? `${((loanAmount / prop.purchasePrice) * 100).toFixed(1)}% financing` : "—"} color="var(--accent2)" />
        <StatCard label="Monthly Installment" value={RM2(monthlyInstallment)} sub={`${prop.tenure}yr @ ${prop.interestRate}% p.a.`} color="#f472b6" />
        <StatCard label="Total Payable" value={RM(totalPayable)} sub="Over full tenure" color="#fbbf24" />
        <StatCard label="Total Interest" value={RM(totalInterest)} sub={loanAmount > 0 ? `${((totalInterest / loanAmount) * 100).toFixed(1)}% of loan` : "—"} color="#f87171" />
      </div>

      {/* Downpayment Records */}
      <div style={{ background: "var(--card-bg)", borderRadius: 16, padding: 24, border: "1px solid var(--border)", marginBottom: 20 }}>
        <div className="section-title">Downpayment Records</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16, alignItems: "flex-end" }}>
          <div style={{ flex: "0 0 auto" }}>
            <label style={{ fontSize: 11, color: "var(--label)", display: "block", marginBottom: 4 }}>Date</label>
            <input className="hl-in" type="date" style={{ width: 160 }} value={dpForm.date} onChange={e => setDpForm(f => ({ ...f, date: e.target.value }))} />
          </div>
          <div style={{ flex: "1 1 140px" }}>
            <label style={{ fontSize: 11, color: "var(--label)", display: "block", marginBottom: 4 }}>Amount (RM)</label>
            <input className="hl-in" type="number" placeholder="e.g. 50000" value={dpForm.amount} onChange={e => setDpForm(f => ({ ...f, amount: e.target.value }))} min={0} step={100} style={{ fontFamily: "'DM Mono', monospace" }} />
          </div>
          <div style={{ flex: "2 1 200px" }}>
            <label style={{ fontSize: 11, color: "var(--label)", display: "block", marginBottom: 4 }}>Note</label>
            <input className="hl-in" placeholder="e.g. Booking fee / 10% downpayment" value={dpForm.note} onChange={e => setDpForm(f => ({ ...f, note: e.target.value }))} />
          </div>
          <button onClick={addDP} style={addBtnStyle}>+ Add</button>
        </div>
        {prop.downpaymentRecords.length > 0 ? (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {["Date", "Amount (RM)", "Note", "Running Total", ""].map(h => (
                    <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(() => {
                  let running = 0;
                  return prop.downpaymentRecords.map((r, i) => {
                    running += r.amount || 0;
                    return (
                      <tr key={r.id} style={{ borderBottom: "1px solid var(--border)", background: i % 2 ? "rgba(255,255,255,0.01)" : "transparent" }}>
                        <td style={{ padding: "10px 12px", color: "var(--label)", whiteSpace: "nowrap" }}>{r.date}</td>
                        <td style={{ padding: "10px 12px", fontFamily: "'DM Mono', monospace", fontWeight: 600, color: "var(--accent)" }}>{RM(r.amount)}</td>
                        <td style={{ padding: "10px 12px", color: "var(--text)" }}>{r.note || "—"}</td>
                        <td style={{ padding: "10px 12px", fontFamily: "'DM Mono', monospace", color: "var(--label)" }}>{RM(running)}</td>
                        <td style={{ padding: "10px 12px" }}>
                          <button onClick={() => delDP(r.id)} style={{ color: "#f87171", background: "none", border: "none", cursor: "pointer", fontSize: 14, padding: "2px 8px" }}>✕</button>
                        </td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "2px solid var(--border)" }}>
                  <td style={{ padding: "12px", fontWeight: 700, color: "var(--label)" }}>Total Paid</td>
                  <td colSpan={4} style={{ padding: "12px", fontFamily: "'DM Mono', monospace", fontWeight: 800, color: "var(--accent)", fontSize: 15 }}>{RM(totalDownpaid)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <div style={{ textAlign: "center", padding: "28px", color: "var(--muted)", fontSize: 13 }}>
            No downpayment records yet. Add your first entry above.
          </div>
        )}
      </div>

      {/* Progressive Interest (Under Construction only) */}
      {prop.type === "under_construction" && (
        <div style={{ background: "var(--card-bg)", borderRadius: 16, padding: 24, border: "1px solid var(--border)", marginBottom: 20 }}>
          <div className="section-title">Progressive Interest Records</div>
          <div style={{ fontSize: 12, color: "var(--label)", marginBottom: 16, lineHeight: 1.7, padding: "10px 14px", background: "rgba(110,231,183,0.05)", borderRadius: 8, border: "1px solid rgba(110,231,183,0.1)" }}>
            💡 For under-construction properties, the bank disburses funds to the developer stage by stage. You pay interest-only on the cumulative amount released. Add a record for each progress claim to track your monthly interest payments before VP (Vacant Possession).
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16, alignItems: "flex-end" }}>
            <div style={{ flex: "0 0 auto" }}>
              <label style={{ fontSize: 11, color: "var(--label)", display: "block", marginBottom: 4 }}>Month</label>
              <input className="hl-in" type="month" style={{ width: 160 }} value={prForm.month} onChange={e => setPrForm(f => ({ ...f, month: e.target.value }))} />
            </div>
            <div style={{ flex: "1 1 140px" }}>
              <label style={{ fontSize: 11, color: "var(--label)", display: "block", marginBottom: 4 }}>Claim Amount (RM)</label>
              <input className="hl-in" type="number" placeholder="Amount disbursed" value={prForm.claimAmount} onChange={e => setPrForm(f => ({ ...f, claimAmount: e.target.value }))} min={0} step={1000} style={{ fontFamily: "'DM Mono', monospace" }} />
            </div>
            <div style={{ flex: "2 1 180px" }}>
              <label style={{ fontSize: 11, color: "var(--label)", display: "block", marginBottom: 4 }}>Construction Stage</label>
              <input className="hl-in" placeholder="e.g. Foundation completed (10%)" value={prForm.stage} onChange={e => setPrForm(f => ({ ...f, stage: e.target.value }))} />
            </div>
            <div style={{ flex: "1 1 140px" }}>
              <label style={{ fontSize: 11, color: "var(--label)", display: "block", marginBottom: 4 }}>Note</label>
              <input className="hl-in" placeholder="Optional" value={prForm.note} onChange={e => setPrForm(f => ({ ...f, note: e.target.value }))} />
            </div>
            <button onClick={addPR} style={addBtnStyle}>+ Add</button>
          </div>
          {progressiveTimeline.length > 0 ? (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    {["Month", "Stage", "Claim (RM)", "Cumulative Disbursed", "Monthly Interest", "Note", ""].map(h => (
                      <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {progressiveTimeline.map((r, i) => (
                    <tr key={r.id} style={{ borderBottom: "1px solid var(--border)", background: i % 2 ? "rgba(255,255,255,0.01)" : "transparent" }}>
                      <td style={{ padding: "10px 12px", color: "var(--label)", whiteSpace: "nowrap" }}>{r.month}</td>
                      <td style={{ padding: "10px 12px", color: "var(--text)" }}>{r.stage || "—"}</td>
                      <td style={{ padding: "10px 12px", fontFamily: "'DM Mono', monospace", fontWeight: 600, color: "#818cf8" }}>{RM(r.claimAmount)}</td>
                      <td style={{ padding: "10px 12px", fontFamily: "'DM Mono', monospace", color: "var(--accent2)" }}>{RM(r.cumulative)}</td>
                      <td style={{ padding: "10px 12px", fontFamily: "'DM Mono', monospace", fontWeight: 700, color: "#f472b6" }}>{RM2(r.monthlyInterest)}</td>
                      <td style={{ padding: "10px 12px", color: "var(--muted)", fontSize: 12 }}>{r.note || "—"}</td>
                      <td style={{ padding: "10px 12px" }}>
                        <button onClick={() => delPR(r.id)} style={{ color: "#f87171", background: "none", border: "none", cursor: "pointer", fontSize: 14, padding: "2px 8px" }}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: "2px solid var(--border)" }}>
                    <td colSpan={4} style={{ padding: "12px", fontWeight: 700, color: "var(--label)" }}>Est. Total Interest During Construction</td>
                    <td style={{ padding: "12px", fontFamily: "'DM Mono', monospace", fontWeight: 800, color: "#f472b6", fontSize: 15 }}>{RM2(totalProgInterest)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "28px", color: "var(--muted)", fontSize: 13 }}>
              No progressive interest records yet. Add a claim when the developer bills for each construction stage.
            </div>
          )}
          {prop.vpDate && (
            <div style={{ marginTop: 16, padding: "12px 16px", borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)", fontSize: 12, color: "var(--label)", lineHeight: 1.6 }}>
              🔑 Expected VP: <strong style={{ color: "var(--accent)" }}>{prop.vpDate}</strong> — Full installments of <strong style={{ color: "var(--accent)" }}>{RM2(monthlyInstallment)}/month</strong> begin after key handover.
            </div>
          )}
        </div>
      )}

      <div style={{ padding: "14px 18px", borderRadius: 12, background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", fontSize: 11, color: "var(--muted)", lineHeight: 1.7 }}>
        <strong style={{ color: "var(--label)" }}>Note (Malaysia):</strong> Monthly installment uses the standard reducing balance (monthly rest) formula. Actual figures depend on your bank's Base Rate (BR), BLR-linked packages, lock-in periods, and rounding. Progressive interest is estimated at the entered rate on the cumulative disbursed amount. MRTA/MLTA premiums and legal fees are not included. Always refer to your loan agreement and bank for accurate figures.
      </div>
    </div>
  );
}

// ─── US Stocks Portfolio Tab ──────────────────────────────────────────

const USD = (n) => "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function StocksTab() {
  const [holdings, setHoldings] = useState(() => {
    try {
      const s = localStorage.getItem("stocks_v1");
      if (s) { const h = JSON.parse(s); if (Array.isArray(h)) return h; }
    } catch {}
    return [];
  });

  const [prices, setPrices] = useState({});
  const [fetching, setFetching] = useState(new Set());
  const [fetchErrors, setFetchErrors] = useState({});
  const [form, setForm] = useState({ ticker: "", shares: "", avgCost: "", fees: "0", buyDate: "", notes: "" });
  const [refreshedAt, setRefreshedAt] = useState(null);

  useEffect(() => {
    try { localStorage.setItem("stocks_v1", JSON.stringify(holdings)); } catch {}
  }, [holdings]);

  const fetchPrice = async (ticker) => {
    setFetching(s => new Set([...s, ticker]));
    setFetchErrors(e => { const n = { ...e }; delete n[ticker]; return n; });
    try {
      const res = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const meta = data?.chart?.result?.[0]?.meta;
      if (!meta?.regularMarketPrice) throw new Error("Price unavailable");
      setPrices(p => ({
        ...p,
        [ticker]: {
          price: meta.regularMarketPrice,
          prevClose: meta.previousClose ?? meta.chartPreviousClose,
          at: Date.now(),
        },
      }));
    } catch (err) {
      setFetchErrors(e => ({ ...e, [ticker]: err.message || "Failed" }));
    }
    setFetching(s => { const n = new Set(s); n.delete(ticker); return n; });
  };

  const refreshAll = () => {
    const tickers = [...new Set(holdings.map(h => h.ticker))];
    tickers.forEach(fetchPrice);
    setRefreshedAt(Date.now());
  };

  const addHolding = () => {
    const ticker = form.ticker.toUpperCase().trim();
    if (!ticker || !form.shares || !form.avgCost) return;
    setHoldings(hs => [...hs, {
      id: uid(), ticker,
      shares: parseFloat(form.shares) || 0,
      avgCost: parseFloat(form.avgCost) || 0,
      totalFees: parseFloat(form.fees) || 0,
      buyDate: form.buyDate,
      notes: form.notes.trim(),
    }]);
    setForm({ ticker: "", shares: "", avgCost: "", fees: "0", buyDate: "", notes: "" });
  };

  const delHolding = (id) => setHoldings(hs => hs.filter(h => h.id !== id));

  const enriched = useMemo(() => holdings.map(h => {
    const cost = h.shares * h.avgCost + (h.totalFees || 0);
    const p = prices[h.ticker];
    const value = p ? h.shares * p.price : null;
    const pnl = value !== null ? value - cost : null;
    const pnlPct = cost > 0 && pnl !== null ? (pnl / cost) * 100 : null;
    return { ...h, cost, value, pnl, pnlPct, pd: p || null };
  }), [holdings, prices]);

  const totalCost = enriched.reduce((s, h) => s + h.cost, 0);
  const priced = enriched.filter(h => h.value !== null);
  const totalValue = priced.reduce((s, h) => s + h.value, 0);
  const totalPnl = priced.reduce((s, h) => s + h.pnl, 0);
  const totalPnlPct = totalCost > 0 && priced.length ? (totalPnl / totalCost) * 100 : null;
  const anyFetching = fetching.size > 0;

  const addBtnStyle = {
    padding: "8px 18px", borderRadius: 8, background: "rgba(110,231,183,0.12)",
    color: "var(--accent)", border: "1px solid rgba(110,231,183,0.25)",
    cursor: "pointer", fontWeight: 600, fontSize: 13, fontFamily: "inherit", whiteSpace: "nowrap",
  };

  const thS = (align) => ({
    padding: "12px 14px", textAlign: align, fontSize: 11, fontWeight: 600,
    color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap",
  });

  const cols = [
    ["Ticker", "left"], ["Shares", "right"], ["Buy Price", "right"], ["Fees", "right"],
    ["Total Cost", "right"], ["Current Price", "right"], ["Value", "right"],
    ["P&L (USD)", "right"], ["P&L %", "right"], ["", "right"],
  ];

  return (
    <div>
      {/* Summary */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
        <StatCard label="Total Invested" value={USD(totalCost)} sub="Cost basis incl. fees" color="#e8eaf0" />
        <StatCard
          label="Portfolio Value"
          value={priced.length ? USD(totalValue) : "—"}
          sub={priced.length < enriched.length && enriched.length > 0 ? `${priced.length}/${enriched.length} positions priced` : "Live prices"}
          color="var(--accent2)"
        />
        <StatCard
          label="Total P&L"
          value={priced.length ? USD(totalPnl) : "—"}
          sub={totalPnlPct !== null ? `${totalPnl >= 0 ? "+" : ""}${totalPnlPct.toFixed(2)}% overall` : "Refresh to see"}
          color={totalPnl >= 0 ? "#4ade80" : "#f87171"}
        />
      </div>

      {/* Add Holding */}
      <div style={{ background: "var(--card-bg)", borderRadius: 16, padding: 24, border: "1px solid var(--border)", marginBottom: 20 }}>
        <div className="section-title">Add Holding</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
          <div style={{ flex: "0 0 90px" }}>
            <label style={{ fontSize: 11, color: "var(--label)", display: "block", marginBottom: 4 }}>Ticker</label>
            <input className="hl-in" style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, textTransform: "uppercase" }}
              placeholder="AAPL" value={form.ticker}
              onChange={e => setForm(f => ({ ...f, ticker: e.target.value }))}
              onKeyDown={e => e.key === "Enter" && addHolding()} />
          </div>
          <div style={{ flex: "1 1 90px" }}>
            <label style={{ fontSize: 11, color: "var(--label)", display: "block", marginBottom: 4 }}>Shares</label>
            <input className="hl-in" type="number" placeholder="10" value={form.shares}
              onChange={e => setForm(f => ({ ...f, shares: e.target.value }))} min={0} step={0.001}
              style={{ fontFamily: "'DM Mono', monospace" }} />
          </div>
          <div style={{ flex: "1 1 120px" }}>
            <label style={{ fontSize: 11, color: "var(--label)", display: "block", marginBottom: 4 }}>Buy Price (USD/share)</label>
            <input className="hl-in" type="number" placeholder="150.00" value={form.avgCost}
              onChange={e => setForm(f => ({ ...f, avgCost: e.target.value }))} min={0} step={0.01}
              style={{ fontFamily: "'DM Mono', monospace" }} />
          </div>
          <div style={{ flex: "1 1 90px" }}>
            <label style={{ fontSize: 11, color: "var(--label)", display: "block", marginBottom: 4 }}>Fees (USD)</label>
            <input className="hl-in" type="number" placeholder="0" value={form.fees}
              onChange={e => setForm(f => ({ ...f, fees: e.target.value }))} min={0} step={0.01}
              style={{ fontFamily: "'DM Mono', monospace" }} />
          </div>
          <div style={{ flex: "0 0 auto" }}>
            <label style={{ fontSize: 11, color: "var(--label)", display: "block", marginBottom: 4 }}>Buy Date</label>
            <input className="hl-in" type="date" style={{ width: 155 }} value={form.buyDate}
              onChange={e => setForm(f => ({ ...f, buyDate: e.target.value }))} />
          </div>
          <div style={{ flex: "2 1 160px" }}>
            <label style={{ fontSize: 11, color: "var(--label)", display: "block", marginBottom: 4 }}>Notes</label>
            <input className="hl-in" placeholder="Optional" value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
          <button onClick={addHolding} style={addBtnStyle}>+ Add</button>
        </div>
      </div>

      {/* Holdings Table */}
      {enriched.length > 0 ? (
        <div style={{ background: "var(--card-bg)", borderRadius: 16, border: "1px solid var(--border)", marginBottom: 20, overflow: "hidden" }}>
          <div style={{ padding: "20px 24px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
            <div className="section-title" style={{ margin: 0 }}>Holdings</div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {refreshedAt && (
                <span style={{ fontSize: 11, color: "var(--muted)" }}>
                  Updated {new Date(refreshedAt).toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
              <button onClick={refreshAll} disabled={anyFetching} style={{ padding: "6px 16px", borderRadius: 8, background: anyFetching ? "transparent" : "rgba(110,231,183,0.1)", color: anyFetching ? "var(--muted)" : "var(--accent)", border: "1px solid rgba(110,231,183,0.2)", cursor: anyFetching ? "not-allowed" : "pointer", fontWeight: 600, fontSize: 12, fontFamily: "inherit" }}>
                {anyFetching ? "⟳ Fetching…" : "⟳ Refresh Prices"}
              </button>
            </div>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {cols.map(([label, align]) => (
                    <th key={label} style={thS(align)}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {enriched.map((h, i) => {
                  const isLoading = fetching.has(h.ticker);
                  const err = fetchErrors[h.ticker];
                  return (
                    <tr key={h.id} style={{ borderBottom: "1px solid var(--border)", background: i % 2 ? "rgba(255,255,255,0.01)" : "transparent" }}>
                      <td style={{ padding: "12px 14px" }}>
                        <div style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: "var(--accent2)", fontSize: 14 }}>{h.ticker}</div>
                        {h.buyDate && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{h.buyDate}</div>}
                        {h.notes && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.notes}</div>}
                      </td>
                      <td style={{ padding: "12px 14px", textAlign: "right", fontFamily: "'DM Mono', monospace" }}>{h.shares}</td>
                      <td style={{ padding: "12px 14px", textAlign: "right", fontFamily: "'DM Mono', monospace" }}>{USD(h.avgCost)}</td>
                      <td style={{ padding: "12px 14px", textAlign: "right", fontFamily: "'DM Mono', monospace", color: "var(--muted)" }}>{USD(h.totalFees)}</td>
                      <td style={{ padding: "12px 14px", textAlign: "right", fontFamily: "'DM Mono', monospace" }}>{USD(h.cost)}</td>
                      <td style={{ padding: "12px 14px", textAlign: "right" }}>
                        {isLoading ? (
                          <span style={{ color: "var(--muted)", fontSize: 12 }}>Loading…</span>
                        ) : err ? (
                          <button onClick={() => fetchPrice(h.ticker)} style={{ color: "#f87171", background: "none", border: "none", cursor: "pointer", fontSize: 11, padding: 0 }} title={err}>
                            ⚠ Retry
                          </button>
                        ) : h.pd ? (
                          <div>
                            <div style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>{USD(h.pd.price)}</div>
                            {h.pd.prevClose != null && (() => {
                              const chg = ((h.pd.price - h.pd.prevClose) / h.pd.prevClose) * 100;
                              return (
                                <div style={{ fontSize: 11, color: chg >= 0 ? "#4ade80" : "#f87171" }}>
                                  {chg >= 0 ? "▲" : "▼"} {Math.abs(chg).toFixed(2)}% today
                                </div>
                              );
                            })()}
                          </div>
                        ) : (
                          <button onClick={() => fetchPrice(h.ticker)} style={{ padding: "4px 10px", borderRadius: 6, background: "rgba(110,231,183,0.1)", color: "var(--accent)", border: "1px solid rgba(110,231,183,0.2)", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>
                            Fetch
                          </button>
                        )}
                      </td>
                      <td style={{ padding: "12px 14px", textAlign: "right", fontFamily: "'DM Mono', monospace" }}>
                        {h.value !== null ? USD(h.value) : "—"}
                      </td>
                      <td style={{ padding: "12px 14px", textAlign: "right", fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>
                        {h.pnl !== null ? <span style={{ color: h.pnl >= 0 ? "#4ade80" : "#f87171" }}>{h.pnl >= 0 ? "+" : ""}{USD(h.pnl)}</span> : "—"}
                      </td>
                      <td style={{ padding: "12px 14px", textAlign: "right", fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>
                        {h.pnlPct !== null ? <span style={{ color: h.pnlPct >= 0 ? "#4ade80" : "#f87171" }}>{h.pnlPct >= 0 ? "+" : ""}{h.pnlPct.toFixed(2)}%</span> : "—"}
                      </td>
                      <td style={{ padding: "12px 14px" }}>
                        <button onClick={() => delHolding(h.id)} style={{ color: "#f87171", background: "none", border: "none", cursor: "pointer", fontSize: 14, padding: "2px 8px" }}>✕</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {enriched.length > 1 && (
                <tfoot>
                  <tr style={{ borderTop: "2px solid var(--border)" }}>
                    <td style={{ padding: "12px 14px", fontWeight: 700, color: "var(--label)", fontSize: 12 }}>TOTAL</td>
                    <td colSpan={3} />
                    <td style={{ padding: "12px 14px", textAlign: "right", fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>{USD(totalCost)}</td>
                    <td />
                    <td style={{ padding: "12px 14px", textAlign: "right", fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>{priced.length ? USD(totalValue) : "—"}</td>
                    <td style={{ padding: "12px 14px", textAlign: "right", fontFamily: "'DM Mono', monospace", fontWeight: 800 }}>
                      {priced.length ? <span style={{ color: totalPnl >= 0 ? "#4ade80" : "#f87171" }}>{totalPnl >= 0 ? "+" : ""}{USD(totalPnl)}</span> : "—"}
                    </td>
                    <td style={{ padding: "12px 14px", textAlign: "right", fontFamily: "'DM Mono', monospace", fontWeight: 800 }}>
                      {totalPnlPct !== null ? <span style={{ color: totalPnlPct >= 0 ? "#4ade80" : "#f87171" }}>{totalPnlPct >= 0 ? "+" : ""}{totalPnlPct.toFixed(2)}%</span> : "—"}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      ) : (
        <div style={{ textAlign: "center", padding: "48px 24px", color: "var(--muted)", fontSize: 14, background: "var(--card-bg)", borderRadius: 16, border: "1px solid var(--border)", marginBottom: 20 }}>
          No holdings yet. Add your first stock position above.
        </div>
      )}

      <div style={{ padding: "14px 18px", borderRadius: 12, background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", fontSize: 11, color: "var(--muted)", lineHeight: 1.7 }}>
        <strong style={{ color: "var(--label)" }}>Note:</strong> Prices are fetched live from Yahoo Finance and may be delayed up to 15–20 minutes during market hours. P&L shown is unrealised gain/loss based on your cost basis (shares × buy price + fees). All values in USD. For personal record-keeping only — not financial advice.
      </div>
    </div>
  );
}

// ─── Crypto Portfolio Tab ─────────────────────────────────────────────

const COIN_IDS = {
  BTC: "bitcoin", ETH: "ethereum", SOL: "solana", BNB: "binancecoin",
  XRP: "ripple", ADA: "cardano", AVAX: "avalanche-2", DOGE: "dogecoin",
  MATIC: "matic-network", POL: "matic-network", DOT: "polkadot",
  SHIB: "shiba-inu", LTC: "litecoin", LINK: "chainlink", UNI: "uniswap",
  ATOM: "cosmos", XLM: "stellar", ALGO: "algorand", VET: "vechain",
  FIL: "filecoin", NEAR: "near", APT: "aptos", ARB: "arbitrum",
  OP: "optimism", SUI: "sui", INJ: "injective-protocol", TRX: "tron",
  TON: "the-open-network", PEPE: "pepe", WIF: "dogwifcoin", BONK: "bonk",
  USDT: "tether", USDC: "usd-coin", DAI: "dai",
  HBAR: "hedera-hashgraph", ICP: "internet-computer", IMX: "immutable-x",
  SAND: "the-sandbox", MANA: "decentraland", AXS: "axie-infinity",
};

function fmtCoin(n) {
  if (n == null) return "—";
  if (n >= 1000) return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (n >= 1)    return "$" + n.toFixed(2);
  if (n >= 0.01) return "$" + n.toFixed(4);
  if (n >= 0.000001) return "$" + n.toFixed(6);
  return "$" + n.toPrecision(4);
}

function CryptoTab() {
  const [holdings, setHoldings] = useState(() => {
    try {
      const s = localStorage.getItem("crypto_v1");
      if (s) { const h = JSON.parse(s); if (Array.isArray(h)) return h; }
    } catch {}
    return [];
  });

  const [prices, setPrices] = useState({});
  const [fetching, setFetching] = useState(new Set());
  const [fetchErrors, setFetchErrors] = useState({});
  const [form, setForm] = useState({ ticker: "", amount: "", buyPrice: "", fees: "0", buyDate: "", notes: "" });
  const [refreshedAt, setRefreshedAt] = useState(null);

  useEffect(() => {
    try { localStorage.setItem("crypto_v1", JSON.stringify(holdings)); } catch {}
  }, [holdings]);

  const fetchPrice = async (ticker) => {
    const coinId = COIN_IDS[ticker.toUpperCase()] || ticker.toLowerCase();
    setFetching(s => new Set([...s, ticker]));
    setFetchErrors(e => { const n = { ...e }; delete n[ticker]; return n; });
    try {
      const res = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(coinId)}&vs_currencies=usd&include_24hr_change=true`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data[coinId]?.usd) throw new Error(`"${ticker}" not found — try the CoinGecko coin ID`);
      setPrices(p => ({
        ...p,
        [ticker]: { price: data[coinId].usd, change24h: data[coinId].usd_24h_change, at: Date.now() },
      }));
    } catch (err) {
      setFetchErrors(e => ({ ...e, [ticker]: err.message || "Failed" }));
    }
    setFetching(s => { const n = new Set(s); n.delete(ticker); return n; });
  };

  const refreshAll = () => {
    const tickers = [...new Set(holdings.map(h => h.ticker))];
    tickers.forEach(fetchPrice);
    setRefreshedAt(Date.now());
  };

  const addHolding = () => {
    const ticker = form.ticker.toUpperCase().trim();
    if (!ticker || !form.amount || !form.buyPrice) return;
    setHoldings(hs => [...hs, {
      id: uid(), ticker,
      amount: parseFloat(form.amount) || 0,
      buyPrice: parseFloat(form.buyPrice) || 0,
      totalFees: parseFloat(form.fees) || 0,
      buyDate: form.buyDate, notes: form.notes.trim(),
    }]);
    setForm({ ticker: "", amount: "", buyPrice: "", fees: "0", buyDate: "", notes: "" });
  };

  const delHolding = (id) => setHoldings(hs => hs.filter(h => h.id !== id));

  const enriched = useMemo(() => holdings.map(h => {
    const cost = h.amount * h.buyPrice + (h.totalFees || 0);
    const p = prices[h.ticker];
    const value = p ? h.amount * p.price : null;
    const pnl = value !== null ? value - cost : null;
    const pnlPct = cost > 0 && pnl !== null ? (pnl / cost) * 100 : null;
    return { ...h, cost, value, pnl, pnlPct, pd: p || null };
  }), [holdings, prices]);

  const totalCost = enriched.reduce((s, h) => s + h.cost, 0);
  const priced = enriched.filter(h => h.value !== null);
  const totalValue = priced.reduce((s, h) => s + h.value, 0);
  const totalPnl = priced.reduce((s, h) => s + h.pnl, 0);
  const totalPnlPct = totalCost > 0 && priced.length ? (totalPnl / totalCost) * 100 : null;
  const anyFetching = fetching.size > 0;

  const GOLD = "#fbbf24";
  const addBtnStyle = { padding: "8px 18px", borderRadius: 8, background: "rgba(251,191,36,0.12)", color: GOLD, border: "1px solid rgba(251,191,36,0.25)", cursor: "pointer", fontWeight: 600, fontSize: 13, fontFamily: "inherit", whiteSpace: "nowrap" };
  const thS = (align) => ({ padding: "12px 14px", textAlign: align, fontSize: 11, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" });
  const cols = [
    ["Coin", "left"], ["Amount", "right"], ["Buy Price", "right"], ["Fees", "right"],
    ["Total Cost", "right"], ["Current Price", "right"], ["Value", "right"],
    ["P&L (USD)", "right"], ["P&L %", "right"], ["", "right"],
  ];

  return (
    <div>
      {/* Summary */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
        <StatCard label="Total Invested" value={USD(totalCost)} sub="Cost basis incl. fees" color="#e8eaf0" />
        <StatCard
          label="Portfolio Value"
          value={priced.length ? USD(totalValue) : "—"}
          sub={priced.length < enriched.length && enriched.length > 0 ? `${priced.length}/${enriched.length} positions priced` : "Live prices"}
          color={GOLD}
        />
        <StatCard
          label="Total P&L"
          value={priced.length ? USD(totalPnl) : "—"}
          sub={totalPnlPct !== null ? `${totalPnl >= 0 ? "+" : ""}${totalPnlPct.toFixed(2)}% overall` : "Refresh to see"}
          color={totalPnl >= 0 ? "#4ade80" : "#f87171"}
        />
      </div>

      {/* Add Holding */}
      <div style={{ background: "var(--card-bg)", borderRadius: 16, padding: 24, border: "1px solid var(--border)", marginBottom: 20 }}>
        <div className="section-title">Add Holding</div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>
          Use common ticker symbols (BTC, ETH, SOL…) or paste the CoinGecko coin ID for any unlisted token.
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
          <div style={{ flex: "0 0 90px" }}>
            <label style={{ fontSize: 11, color: "var(--label)", display: "block", marginBottom: 4 }}>Coin</label>
            <input className="hl-in" style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, textTransform: "uppercase" }}
              placeholder="BTC" value={form.ticker}
              onChange={e => setForm(f => ({ ...f, ticker: e.target.value }))}
              onKeyDown={e => e.key === "Enter" && addHolding()} />
          </div>
          <div style={{ flex: "1 1 110px" }}>
            <label style={{ fontSize: 11, color: "var(--label)", display: "block", marginBottom: 4 }}>Amount</label>
            <input className="hl-in" type="number" placeholder="0.5" value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} min={0} step="any"
              style={{ fontFamily: "'DM Mono', monospace" }} />
          </div>
          <div style={{ flex: "1 1 130px" }}>
            <label style={{ fontSize: 11, color: "var(--label)", display: "block", marginBottom: 4 }}>Buy Price (USD/coin)</label>
            <input className="hl-in" type="number" placeholder="45000" value={form.buyPrice}
              onChange={e => setForm(f => ({ ...f, buyPrice: e.target.value }))} min={0} step="any"
              style={{ fontFamily: "'DM Mono', monospace" }} />
          </div>
          <div style={{ flex: "1 1 90px" }}>
            <label style={{ fontSize: 11, color: "var(--label)", display: "block", marginBottom: 4 }}>Fees (USD)</label>
            <input className="hl-in" type="number" placeholder="0" value={form.fees}
              onChange={e => setForm(f => ({ ...f, fees: e.target.value }))} min={0} step={0.01}
              style={{ fontFamily: "'DM Mono', monospace" }} />
          </div>
          <div style={{ flex: "0 0 auto" }}>
            <label style={{ fontSize: 11, color: "var(--label)", display: "block", marginBottom: 4 }}>Buy Date</label>
            <input className="hl-in" type="date" style={{ width: 155 }} value={form.buyDate}
              onChange={e => setForm(f => ({ ...f, buyDate: e.target.value }))} />
          </div>
          <div style={{ flex: "2 1 160px" }}>
            <label style={{ fontSize: 11, color: "var(--label)", display: "block", marginBottom: 4 }}>Notes</label>
            <input className="hl-in" placeholder="Optional" value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
          <button onClick={addHolding} style={addBtnStyle}>+ Add</button>
        </div>
      </div>

      {/* Holdings Table */}
      {enriched.length > 0 ? (
        <div style={{ background: "var(--card-bg)", borderRadius: 16, border: "1px solid var(--border)", marginBottom: 20, overflow: "hidden" }}>
          <div style={{ padding: "20px 24px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
            <div className="section-title" style={{ margin: 0 }}>Holdings</div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {refreshedAt && (
                <span style={{ fontSize: 11, color: "var(--muted)" }}>
                  Updated {new Date(refreshedAt).toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
              <button onClick={refreshAll} disabled={anyFetching} style={{ padding: "6px 16px", borderRadius: 8, background: anyFetching ? "transparent" : "rgba(251,191,36,0.1)", color: anyFetching ? "var(--muted)" : GOLD, border: `1px solid rgba(251,191,36,0.2)`, cursor: anyFetching ? "not-allowed" : "pointer", fontWeight: 600, fontSize: 12, fontFamily: "inherit" }}>
                {anyFetching ? "⟳ Fetching…" : "⟳ Refresh Prices"}
              </button>
            </div>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {cols.map(([label, align]) => <th key={label} style={thS(align)}>{label}</th>)}
                </tr>
              </thead>
              <tbody>
                {enriched.map((h, i) => {
                  const isLoading = fetching.has(h.ticker);
                  const err = fetchErrors[h.ticker];
                  return (
                    <tr key={h.id} style={{ borderBottom: "1px solid var(--border)", background: i % 2 ? "rgba(255,255,255,0.01)" : "transparent" }}>
                      <td style={{ padding: "12px 14px" }}>
                        <div style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: GOLD, fontSize: 14 }}>{h.ticker}</div>
                        {h.buyDate && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{h.buyDate}</div>}
                        {h.notes && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.notes}</div>}
                      </td>
                      <td style={{ padding: "12px 14px", textAlign: "right", fontFamily: "'DM Mono', monospace" }}>{h.amount}</td>
                      <td style={{ padding: "12px 14px", textAlign: "right", fontFamily: "'DM Mono', monospace" }}>{fmtCoin(h.buyPrice)}</td>
                      <td style={{ padding: "12px 14px", textAlign: "right", fontFamily: "'DM Mono', monospace", color: "var(--muted)" }}>{USD(h.totalFees)}</td>
                      <td style={{ padding: "12px 14px", textAlign: "right", fontFamily: "'DM Mono', monospace" }}>{USD(h.cost)}</td>
                      <td style={{ padding: "12px 14px", textAlign: "right" }}>
                        {isLoading ? (
                          <span style={{ color: "var(--muted)", fontSize: 12 }}>Loading…</span>
                        ) : err ? (
                          <button onClick={() => fetchPrice(h.ticker)} style={{ color: "#f87171", background: "none", border: "none", cursor: "pointer", fontSize: 11, padding: 0 }} title={err}>⚠ Retry</button>
                        ) : h.pd ? (
                          <div>
                            <div style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>{fmtCoin(h.pd.price)}</div>
                            {h.pd.change24h != null && (
                              <div style={{ fontSize: 11, color: h.pd.change24h >= 0 ? "#4ade80" : "#f87171" }}>
                                {h.pd.change24h >= 0 ? "▲" : "▼"} {Math.abs(h.pd.change24h).toFixed(2)}% 24h
                              </div>
                            )}
                          </div>
                        ) : (
                          <button onClick={() => fetchPrice(h.ticker)} style={{ padding: "4px 10px", borderRadius: 6, background: "rgba(251,191,36,0.1)", color: GOLD, border: "1px solid rgba(251,191,36,0.2)", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>Fetch</button>
                        )}
                      </td>
                      <td style={{ padding: "12px 14px", textAlign: "right", fontFamily: "'DM Mono', monospace" }}>{h.value !== null ? USD(h.value) : "—"}</td>
                      <td style={{ padding: "12px 14px", textAlign: "right", fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>
                        {h.pnl !== null ? <span style={{ color: h.pnl >= 0 ? "#4ade80" : "#f87171" }}>{h.pnl >= 0 ? "+" : ""}{USD(h.pnl)}</span> : "—"}
                      </td>
                      <td style={{ padding: "12px 14px", textAlign: "right", fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>
                        {h.pnlPct !== null ? <span style={{ color: h.pnlPct >= 0 ? "#4ade80" : "#f87171" }}>{h.pnlPct >= 0 ? "+" : ""}{h.pnlPct.toFixed(2)}%</span> : "—"}
                      </td>
                      <td style={{ padding: "12px 14px" }}>
                        <button onClick={() => delHolding(h.id)} style={{ color: "#f87171", background: "none", border: "none", cursor: "pointer", fontSize: 14, padding: "2px 8px" }}>✕</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {enriched.length > 1 && (
                <tfoot>
                  <tr style={{ borderTop: "2px solid var(--border)" }}>
                    <td style={{ padding: "12px 14px", fontWeight: 700, color: "var(--label)", fontSize: 12 }}>TOTAL</td>
                    <td colSpan={3} />
                    <td style={{ padding: "12px 14px", textAlign: "right", fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>{USD(totalCost)}</td>
                    <td />
                    <td style={{ padding: "12px 14px", textAlign: "right", fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>{priced.length ? USD(totalValue) : "—"}</td>
                    <td style={{ padding: "12px 14px", textAlign: "right", fontFamily: "'DM Mono', monospace", fontWeight: 800 }}>
                      {priced.length ? <span style={{ color: totalPnl >= 0 ? "#4ade80" : "#f87171" }}>{totalPnl >= 0 ? "+" : ""}{USD(totalPnl)}</span> : "—"}
                    </td>
                    <td style={{ padding: "12px 14px", textAlign: "right", fontFamily: "'DM Mono', monospace", fontWeight: 800 }}>
                      {totalPnlPct !== null ? <span style={{ color: totalPnlPct >= 0 ? "#4ade80" : "#f87171" }}>{totalPnlPct >= 0 ? "+" : ""}{totalPnlPct.toFixed(2)}%</span> : "—"}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      ) : (
        <div style={{ textAlign: "center", padding: "48px 24px", color: "var(--muted)", fontSize: 14, background: "var(--card-bg)", borderRadius: 16, border: "1px solid var(--border)", marginBottom: 20 }}>
          No holdings yet. Add your first crypto position above.
        </div>
      )}

      <div style={{ padding: "14px 18px", borderRadius: 12, background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", fontSize: 11, color: "var(--muted)", lineHeight: 1.7 }}>
        <strong style={{ color: "var(--label)" }}>Note:</strong> Prices are fetched from CoinGecko (free public API). P&L is unrealised gain/loss based on your cost basis (amount × buy price + fees). All values in USD. For unlisted tokens, enter the CoinGecko coin ID (e.g. "wrapped-bitcoin") in the Coin field. For personal record-keeping only — not financial advice.
      </div>
    </div>
  );
}

// ─── Summary Tab ──────────────────────────────────────────────────────

function SummaryTab({ cpfData, yearsToProject }) {
  const properties = useMemo(() => {
    try { const s = localStorage.getItem("hl_props_v1"); return s ? JSON.parse(s) : []; } catch { return []; }
  }, []);

  const stockHoldings = useMemo(() => {
    try { const s = localStorage.getItem("stocks_v1"); return s ? JSON.parse(s) : []; } catch { return []; }
  }, []);

  const cryptoHoldings = useMemo(() => {
    try { const s = localStorage.getItem("crypto_v1"); return s ? JSON.parse(s) : []; } catch { return []; }
  }, []);

  const SGD = (n) => "S$" + Number(n || 0).toLocaleString("en-SG", { maximumFractionDigits: 0 });

  // CPF
  const cpfOA = cpfData?.oa || 0;
  const cpfSA = cpfData?.sa || 0;
  const cpfMA = cpfData?.ma || 0;
  const cpfTotal = cpfData?.total || 0;
  const cpfFinalAge = cpfData?.age || 0;

  // Housing (MYR)
  const propStats = useMemo(() => properties.map(p => {
    const downpaid = (p.downpaymentRecords || []).reduce((s, r) => s + (r.amount || 0), 0);
    return { ...p, downpaid, outstanding: Math.max(0, p.purchasePrice - downpaid) };
  }), [properties]);
  const totalPropValue = propStats.reduce((s, p) => s + p.purchasePrice, 0);
  const totalEquity    = propStats.reduce((s, p) => s + p.downpaid, 0);
  const totalOutstanding = propStats.reduce((s, p) => s + p.outstanding, 0);

  // Investments (USD)
  const stocksCost = stockHoldings.reduce((s, h) => s + h.shares * h.avgCost + (h.totalFees || 0), 0);
  const cryptoCost = cryptoHoldings.reduce((s, h) => s + h.amount * h.buyPrice + (h.totalFees || 0), 0);
  const totalUSD = stocksCost + cryptoCost;

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
      {/* Multi-currency notice */}
      <div style={{ padding: "12px 16px", borderRadius: 10, background: "rgba(129,140,248,0.06)", border: "1px solid rgba(129,140,248,0.12)", fontSize: 12, color: "var(--label)", marginBottom: 20, lineHeight: 1.7 }}>
        ℹ️ Your assets span multiple currencies — <strong>SGD</strong> (CPF), <strong>MYR</strong> (Property), <strong>USD</strong> (Stocks &amp; Crypto). Values are shown in their native currency without conversion. Stock and crypto figures reflect cost basis; visit those tabs and refresh prices to see live P&amp;L.
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
            { label: "Special Account (SA)", value: cpfSA, color: "#818cf8" },
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

      {/* Housing (MYR) */}
      <div style={{ background: "var(--card-bg)", borderRadius: 16, padding: 24, border: "1px solid var(--border)", marginBottom: 16 }}>
        <SectionHeader
          title="Property / Housing — MYR"
          sub={`${properties.length} propert${properties.length === 1 ? "y" : "ies"} · downpayment paid shown as equity`}
          value={properties.length ? RM(totalEquity) : null}
          valueColor="var(--accent)"
        />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: properties.length ? 16 : 0 }}>
          {[
            { label: "Total Property Value", value: RM(totalPropValue), color: "#e8eaf0" },
            { label: "Equity Paid", value: RM(totalEquity), color: "var(--accent)" },
            { label: "Outstanding Loan", value: RM(totalOutstanding), color: "#f87171" },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ flex: "1 1 160px", background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: "12px 14px", border: "1px solid var(--border)" }}>
              <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>{label}</div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 15, color }}>{value}</div>
            </div>
          ))}
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
                    { label: "Purchase", value: RM(p.purchasePrice), color: "var(--text)" },
                    { label: "Equity Paid", value: RM(p.downpaid), color: "var(--accent)" },
                    { label: "Outstanding", value: RM(p.outstanding), color: "#f87171" },
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
            No properties added yet. Visit the <strong style={{ color: "var(--label)" }}>Housing Loan</strong> tab to get started.
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
          {/* Stocks */}
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
          {/* Crypto */}
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

      <div style={{ padding: "14px 18px", borderRadius: 12, background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", fontSize: 11, color: "var(--muted)", lineHeight: 1.7 }}>
        <strong style={{ color: "var(--label)" }}>Note:</strong> CPF figures are projected values based on your inputs — not actual current balances. Property equity reflects total downpayments recorded, not appraised market value. Stock and crypto values show cost basis only. No currency conversion is applied between SGD, MYR, and USD.
      </div>
    </div>
  );
}

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
  const [activeTab, setActiveTab] = useState("summary");

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
        .hl-in { width: 100%; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border); background: rgba(255,255,255,0.04); color: var(--text); font-size: 13px; font-family: inherit; outline: none; transition: border 0.2s; -webkit-appearance: none; appearance: none; }
        .hl-in:focus { border-color: var(--accent); box-shadow: 0 0 0 2px rgba(110,231,183,0.12); }
        .hl-in option { background: #0a0e17; color: #e8eaf0; }
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
        <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
          <button className={`tab-btn ${activeTab === "summary" ? "active" : ""}`} onClick={() => setActiveTab("summary")}>
            🌐 Summary
          </button>
          <button className={`tab-btn ${activeTab === "projection" ? "active" : ""}`} onClick={() => setActiveTab("projection")}>
            📈 Growth Chart
          </button>
          <button className={`tab-btn ${activeTab === "table" ? "active" : ""}`} onClick={() => setActiveTab("table")}>
            📋 Year-by-Year
          </button>
          <button className={`tab-btn ${activeTab === "housing" ? "active" : ""}`} onClick={() => setActiveTab("housing")}>
            🏠 Housing Loan
          </button>
          <button className={`tab-btn ${activeTab === "stocks" ? "active" : ""}`} onClick={() => setActiveTab("stocks")}>
            📊 US Stocks
          </button>
          <button className={`tab-btn ${activeTab === "crypto" ? "active" : ""}`} onClick={() => setActiveTab("crypto")}>
            🪙 Crypto
          </button>
        </div>

        {/* Summary Tab */}
        {activeTab === "summary" && (
          <div style={{ marginBottom: 28 }}>
            <SummaryTab cpfData={finalData} yearsToProject={yearsToProject} />
          </div>
        )}

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

        {/* Housing Loan Tab */}
        {activeTab === "housing" && (
          <div style={{ marginBottom: 28 }}>
            <HousingLoanTab />
          </div>
        )}

        {/* US Stocks Tab */}
        {activeTab === "stocks" && (
          <div style={{ marginBottom: 28 }}>
            <StocksTab />
          </div>
        )}

        {/* Crypto Tab */}
        {activeTab === "crypto" && (
          <div style={{ marginBottom: 28 }}>
            <CryptoTab />
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
