import { useState, useMemo, useCallback, useEffect, useRef } from "react";
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

function projectYears({ salary, age, prYear, annualIncrement, yearsToProject, oaReturn, saReturn, maReturn, oaStart = 0, saStart = 0, maStart = 0 }) {
  const data = [];
  let oaBalance = oaStart, saBalance = saStart, maBalance = maStart;
  let currentSalary = salary;
  let currentAge = age;
  let currentPRYear = prYear;

  for (let y = 0; y <= yearsToProject; y++) {
    if (y > 0) {
      // Apply base interest
      oaBalance *= (1 + oaReturn / 100);
      saBalance *= (1 + saReturn / 100);
      maBalance *= (1 + maReturn / 100);

      // Extra CPF interest on combined balances (credited to SA)
      // OA contribution capped at $20,000 towards the threshold
      const oaCapped = Math.min(oaBalance, 20000);
      const combined = oaCapped + saBalance + maBalance;
      let extraInterest = 0;
      if (currentAge >= 55) {
        // Age 55+: extra 2% on first $30K, extra 1% on next $30K
        extraInterest = Math.min(combined, 30000) * 0.02
                      + Math.min(Math.max(0, combined - 30000), 30000) * 0.01;
      } else {
        // Under 55: extra 1% on first $60K
        extraInterest = Math.min(combined, 60000) * 0.01;
      }
      saBalance += extraInterest;

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

// ─── EPF helpers ──────────────────────────────────────────────────────

function getEpfRates(age, monthlyWage) {
  if (age < 60) {
    return { employee: 0.11, employer: monthlyWage > 5000 ? 0.12 : 0.13 };
  }
  return { employee: 0.055, employer: 0.06 };
}

function computeEpfMonthly(wage, age) {
  const rates = getEpfRates(age, wage);
  const employeeContrib = Math.floor(wage * rates.employee);
  const employerContrib = Math.round(wage * rates.employer);
  const total = employeeContrib + employerContrib;
  const persaraan = Math.round(total * 0.75);
  const sejahtera = Math.round(total * 0.15);
  const fleksibel = total - persaraan - sejahtera;
  return {
    wage, employeeContrib, employerContrib, total,
    persaraan, sejahtera, fleksibel,
    rates: { employee: rates.employee, employer: rates.employer, total: rates.employee + rates.employer },
    takeHome: wage - employeeContrib,
  };
}

function projectEpfYears({ wage, age, annualIncrement, years, dividendRate, startPer, startSej, startFlek }) {
  let per = startPer, sej = startSej, flek = startFlek;
  let w = wage, a = age;
  const r = dividendRate / 100;
  return Array.from({ length: years }, (_, idx) => {
    const m = computeEpfMonthly(w, a);
    const yPer = m.persaraan * 12, ySej = m.sejahtera * 12, yFlek = m.fleksibel * 12;
    const divPer = r * (per + yPer * 0.5);
    const divSej = r * (sej + ySej * 0.5);
    const divFlek = r * (flek + yFlek * 0.5);
    per = per + yPer + divPer;
    sej = sej + ySej + divSej;
    flek = flek + yFlek + divFlek;
    const row = { year: idx + 1, age: a, wage: w, monthlyContrib: m.total, per, sej, flek, total: per + sej + flek };
    w = Math.round(w * (1 + annualIncrement / 100));
    a++;
    return row;
  });
}

// ─── Export / Backup helpers ──────────────────────────────────────────

function downloadBlob(filename, content, type = "text/plain") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function toCsv(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const esc = v => { const s = String(v ?? ""); return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [headers.join(","), ...rows.map(r => headers.map(h => esc(r[h])).join(","))].join("\n");
}

function printTable(title, sections) {
  const win = window.open("", "_blank");
  const body = sections.map(({ heading, headers, rows }) => `
    ${heading ? `<h2>${heading}</h2>` : ""}
    <table>
      <thead><tr>${headers.map(h => `<th>${h}</th>`).join("")}</tr></thead>
      <tbody>${rows.map(row => `<tr>${row.map(c => `<td>${c ?? ""}</td>`).join("")}</tr>`).join("")}</tbody>
    </table>
  `).join("\n");
  win.document.write(`<!DOCTYPE html><html><head><title>${title}</title><style>
    body{font-family:system-ui,sans-serif;padding:24px;color:#111;font-size:13px}
    h1{font-size:20px;margin-bottom:4px}h2{font-size:15px;margin:20px 0 8px;color:#374151;border-bottom:1px solid #e5e7eb;padding-bottom:4px}
    .meta{font-size:12px;color:#6b7280;margin-bottom:16px}
    table{border-collapse:collapse;width:100%;margin-bottom:8px}
    th{background:#f3f4f6;padding:7px 10px;text-align:left;border:1px solid #d1d5db;font-weight:600}
    td{padding:6px 10px;border:1px solid #e5e7eb;white-space:nowrap}
    .print-btn{padding:8px 16px;background:#111;color:#fff;border:none;border-radius:6px;cursor:pointer;margin-bottom:16px;font-size:13px}
    @media print{.print-btn{display:none}}
  </style></head><body>
    <h1>${title}</h1>
    <div class="meta">Generated ${new Date().toLocaleString()}</div>
    <button class="print-btn" onclick="window.print()">Print / Save as PDF</button>
    ${body}
  </body></html>`);
  win.document.close();
}

const LS_KEYS = ["cpf_oa_start","cpf_sa_start","cpf_ma_start","hl_props_v1","hl_selid_v1","stocks_v1","crypto_v1","mystocks_v1","goals_v1","epf_per_start","epf_sej_start","epf_flek_start","fd_v1","epf_wage","epf_age","epf_retire_age","epf_increment","epf_dividend","fx_usd_sgd","fx_myr_sgd","sav_income","sav_other","sav_expenses_v1","fire_monthly_exp","fire_rate","fire_incl_epf","fire_incl_cash"];

function exportBackup() {
  const data = {};
  LS_KEYS.forEach(k => {
    try { const v = localStorage.getItem(k); if (v !== null) data[k] = JSON.parse(v); } catch { try { data[k] = localStorage.getItem(k); } catch {} }
  });
  downloadBlob(`retire-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2), "application/json");
}

function importBackup(file, onDone) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      LS_KEYS.forEach(k => {
        if (k in data) try { localStorage.setItem(k, JSON.stringify(data[k])); } catch {}
      });
      onDone(true);
    } catch { onDone(false); }
  };
  reader.readAsText(file);
}

// ─── Housing Loan Tab ─────────────────────────────────────────────────

function BackupBar() {
  const [status, setStatus] = useState(null);
  const fileRef = useRef(null);

  const handleImport = e => {
    const file = e.target.files?.[0];
    if (!file) return;
    importBackup(file, ok => {
      setStatus(ok ? "ok" : "err");
      if (ok) setTimeout(() => window.location.reload(), 900);
    });
    e.target.value = "";
  };

  const btnStyle = {
    padding: "7px 14px", borderRadius: 8, border: "1px solid var(--border)",
    background: "rgba(255,255,255,0.05)", color: "var(--label)", fontSize: 12,
    fontWeight: 600, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <button style={btnStyle} onClick={exportBackup}>↓ Export Backup</button>
      <button style={btnStyle} onClick={() => fileRef.current?.click()}>↑ Restore Backup</button>
      <input ref={fileRef} type="file" accept=".json" style={{ display: "none" }} onChange={handleImport} />
      {status === "ok" && <span style={{ fontSize: 12, color: "#4ade80" }}>Restored! Reloading…</span>}
      {status === "err" && <span style={{ fontSize: 12, color: "#f87171" }}>Invalid backup file.</span>}
    </div>
  );
}

const RM  = (n) => "RM " + Number(n || 0).toLocaleString("en-MY", { maximumFractionDigits: 0 });
const RM2 = (n) => "RM " + Number(n || 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function calcInstallment(principal, annualRatePct, tenureYears) {
  if (!principal || !tenureYears) return 0;
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
  const [showAmort, setShowAmort] = useState(false);
  const [amortYear, setAmortYear] = useState(1);

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

  const amortSchedule = useMemo(() => {
    if (!loanAmount || !prop?.interestRate || !prop?.tenure || !monthlyInstallment) return [];
    const r = prop.interestRate / 100 / 12;
    const n = prop.tenure * 12;
    let balance = loanAmount;

    // Derive the first repayment month from property dates
    const refStr = prop.type === "under_construction" ? prop.vpDate : prop.spaDate;
    let startDate = refStr ? new Date(refStr + "-01") : null;
    if (startDate && prop.type !== "under_construction") {
      // Completed/subsale: loan starts ~1 month after SPA
      startDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 1);
    }

    return Array.from({ length: n }, (_, idx) => {
      const i = idx + 1;
      const interest = balance * r;
      const principal = Math.min(monthlyInstallment - interest, balance);
      const closing = Math.max(0, balance - principal);
      let dateStr = "";
      if (startDate) {
        const d = new Date(startDate.getFullYear(), startDate.getMonth() + idx, 1);
        dateStr = d.toLocaleDateString("en-MY", { month: "short", year: "numeric" });
      }
      const row = { month: i, year: Math.ceil(i / 12), date: dateStr, opening: balance, principal, interest, closing };
      balance = closing;
      return row;
    });
  }, [loanAmount, prop?.interestRate, prop?.tenure, monthlyInstallment, prop?.vpDate, prop?.spaDate, prop?.type]);

  const amortTotalInterest = amortSchedule.reduce((s, r) => s + r.interest, 0);
  const amortTotalPrincipal = amortSchedule.reduce((s, r) => s + r.principal, 0);
  const amortHasDate = amortSchedule.length > 0 && !!amortSchedule[0].date;
  const amortYearRows = amortSchedule.filter(r => r.year === amortYear);
  const amortYearInterest = amortYearRows.reduce((s, r) => s + r.interest, 0);
  const amortYearPrincipal = amortYearRows.reduce((s, r) => s + r.principal, 0);

  if (!prop) return null;

  const exportHousingCsv = () => {
    const summaryRows = properties.map(p => {
      const dp = (p.downpaymentRecords || []).reduce((s, r) => s + (r.amount || 0), 0);
      const loan = Math.max(0, p.purchasePrice - dp);
      const inst = calcInstallment(loan, p.interestRate || 0, p.tenure || 0);
      return {
        Property: p.name, Developer: p.developer, Address: p.address,
        Type: p.type, "Purchase Price (MYR)": p.purchasePrice,
        "Interest Rate (%)": p.interestRate, "Tenure (yrs)": p.tenure,
        "SPA Date": p.spaDate, "VP Date": p.vpDate,
        "Total Downpaid (MYR)": dp.toFixed(2),
        "Loan Amount (MYR)": loan.toFixed(2),
        "Monthly Installment (MYR)": inst.toFixed(2),
      };
    });
    const dpRows = properties.flatMap(p =>
      (p.downpaymentRecords || []).map(r => ({
        Property: p.name, Date: r.date, "Amount (MYR)": r.amount.toFixed(2), Note: r.note,
      }))
    );
    const prRows = properties.flatMap(p =>
      (p.progressiveRecords || []).map(r => ({
        Property: p.name, Month: r.month, "Claim Amount (MYR)": r.claimAmount.toFixed(2),
        Stage: r.stage, Note: r.note,
      }))
    );
    let csv = "=== Property Summary ===\n" + toCsv(summaryRows);
    if (dpRows.length) csv += "\n\n=== Downpayment Records ===\n" + toCsv(dpRows);
    if (prRows.length) csv += "\n\n=== Progressive Disbursement Records ===\n" + toCsv(prRows);
    downloadBlob(`housing-records-${new Date().toISOString().slice(0, 10)}.csv`, csv, "text/csv");
  };

  const exportHousingPdf = () => {
    const sections = [
      {
        heading: "Property Summary",
        headers: ["Property", "Purchase Price (MYR)", "Downpaid (MYR)", "Loan (MYR)", "Rate", "Tenure", "Monthly Installment"],
        rows: properties.map(p => {
          const dp = (p.downpaymentRecords || []).reduce((s, r) => s + (r.amount || 0), 0);
          const loan = Math.max(0, p.purchasePrice - dp);
          const inst = calcInstallment(loan, p.interestRate || 0, p.tenure || 0);
          return [p.name, RM(p.purchasePrice), RM(dp), RM(loan), `${p.interestRate}%`, `${p.tenure} yrs`, RM2(inst)];
        }),
      },
    ];
    properties.forEach(p => {
      if ((p.downpaymentRecords || []).length) {
        sections.push({
          heading: `${p.name} — Downpayment Records`,
          headers: ["Date", "Amount (MYR)", "Note"],
          rows: p.downpaymentRecords.map(r => [r.date, RM2(r.amount), r.note]),
        });
      }
      if ((p.progressiveRecords || []).length) {
        sections.push({
          heading: `${p.name} — Progressive Disbursement`,
          headers: ["Month", "Claim (MYR)", "Stage", "Note"],
          rows: p.progressiveRecords.map(r => [r.month, RM2(r.claimAmount), r.stage, r.note]),
        });
      }
    });
    printTable("Housing Records", sections);
  };

  const addBtnStyle = {
    padding: "8px 18px", borderRadius: 8, background: "rgba(110,231,183,0.12)",
    color: "var(--accent)", border: "1px solid rgba(110,231,183,0.25)",
    cursor: "pointer", fontWeight: 600, fontSize: 13, fontFamily: "inherit", whiteSpace: "nowrap",
  };

  const exportAmortCsv = () => {
    const rows = amortSchedule.map(r => ({
      Month: r.month, ...(amortHasDate ? { Date: r.date } : {}),
      "Opening Balance (MYR)": r.opening.toFixed(2),
      "Principal (MYR)": r.principal.toFixed(2),
      "Interest (MYR)": r.interest.toFixed(2),
      "Closing Balance (MYR)": r.closing.toFixed(2),
    }));
    downloadBlob(
      `amortization-${prop.name.replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(rows), "text/csv"
    );
  };

  const exportBtnStyle = {
    padding: "6px 12px", borderRadius: 7, border: "1px solid var(--border)",
    background: "rgba(255,255,255,0.04)", color: "var(--label)", fontSize: 11,
    fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
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
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button style={exportBtnStyle} onClick={exportHousingCsv}>↓ CSV</button>
          <button style={exportBtnStyle} onClick={exportHousingPdf}>⎙ PDF</button>
        </div>
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

      {/* Amortization Schedule */}
      {loanAmount > 0 && prop.tenure > 0 && (
        <div style={{ background: "var(--card-bg)", borderRadius: 16, border: "1px solid var(--border)", marginBottom: 20, overflow: "hidden" }}>
          {/* Header row */}
          <div style={{ padding: "20px 24px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div className="section-title" style={{ margin: 0, marginBottom: 4 }}>Amortization Schedule</div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                {prop.tenure * 12} monthly payments · {RM2(monthlyInstallment)}/month
                {amortHasDate && amortSchedule[0]?.date && ` · Starting ${amortSchedule[0].date}`}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {showAmort && (
                <button style={exportBtnStyle} onClick={exportAmortCsv}>↓ CSV</button>
              )}
              <button
                onClick={() => setShowAmort(s => !s)}
                style={{ ...exportBtnStyle, color: showAmort ? "var(--accent)" : "var(--label)", borderColor: showAmort ? "rgba(110,231,183,0.3)" : "var(--border)" }}
              >
                {showAmort ? "▲ Hide" : "▼ Show Schedule"}
              </button>
            </div>
          </div>

          {showAmort && (
            <>
              {/* Lifetime summary mini-cards */}
              <div style={{ display: "flex", gap: 12, padding: "0 24px 20px", flexWrap: "wrap" }}>
                {[
                  { label: "Total Principal", val: RM(amortTotalPrincipal), color: "var(--accent)" },
                  { label: "Total Interest", val: RM(amortTotalInterest), color: "#f87171" },
                  { label: "Interest / Loan", val: loanAmount > 0 ? `${((amortTotalInterest / loanAmount) * 100).toFixed(1)}%` : "—", color: "#fbbf24" },
                  { label: "Total Cost", val: RM(amortTotalPrincipal + amortTotalInterest), color: "#e8eaf0" },
                ].map(({ label, val, color }) => (
                  <div key={label} style={{ flex: "1 1 120px", padding: "12px 16px", borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)" }}>
                    <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600, marginBottom: 4 }}>{label}</div>
                    <div style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 15, color }}>{val}</div>
                  </div>
                ))}
              </div>

              {/* Year selector */}
              <div style={{ padding: "0 24px 16px", display: "flex", gap: 6, flexWrap: "wrap" }}>
                {Array.from({ length: prop.tenure }, (_, i) => i + 1).map(y => (
                  <button
                    key={y}
                    onClick={() => setAmortYear(y)}
                    style={{
                      padding: "4px 12px", borderRadius: 6, border: "1px solid",
                      borderColor: amortYear === y ? "rgba(110,231,183,0.35)" : "var(--border)",
                      background: amortYear === y ? "rgba(110,231,183,0.1)" : "transparent",
                      color: amortYear === y ? "var(--accent)" : "var(--muted)",
                      fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                    }}
                  >
                    Yr {y}
                  </button>
                ))}
              </div>

              {/* Table */}
              <div style={{ borderTop: "1px solid var(--border)", overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "rgba(255,255,255,0.02)" }}>
                      {[
                        ["Mo.", "center"],
                        ...(amortHasDate ? [["Date", "left"]] : []),
                        ["Opening Balance", "right"],
                        ["Principal", "right"],
                        ["Interest", "right"],
                        ["Closing Balance", "right"],
                      ].map(([h, align]) => (
                        <th key={h} style={{ padding: "10px 14px", textAlign: align, fontSize: 11, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap", borderBottom: "1px solid var(--border)" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {amortYearRows.map((r, i) => (
                      <tr key={r.month} style={{ borderBottom: "1px solid var(--border)", background: i % 2 ? "rgba(255,255,255,0.01)" : "transparent" }}>
                        <td style={{ padding: "9px 14px", textAlign: "center", color: "var(--muted)", fontFamily: "'DM Mono', monospace", fontSize: 12 }}>{r.month}</td>
                        {amortHasDate && <td style={{ padding: "9px 14px", color: "var(--label)", whiteSpace: "nowrap", fontSize: 12 }}>{r.date}</td>}
                        <td style={{ padding: "9px 14px", textAlign: "right", fontFamily: "'DM Mono', monospace", color: "var(--label)" }}>{RM2(r.opening)}</td>
                        <td style={{ padding: "9px 14px", textAlign: "right", fontFamily: "'DM Mono', monospace", fontWeight: 600, color: "var(--accent)" }}>{RM2(r.principal)}</td>
                        <td style={{ padding: "9px 14px", textAlign: "right", fontFamily: "'DM Mono', monospace", color: "#f87171" }}>{RM2(r.interest)}</td>
                        <td style={{ padding: "9px 14px", textAlign: "right", fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>{RM2(r.closing)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: "2px solid var(--border)", background: "rgba(255,255,255,0.02)" }}>
                      <td colSpan={amortHasDate ? 3 : 2} style={{ padding: "10px 14px", fontWeight: 700, color: "var(--label)", fontSize: 12 }}>Year {amortYear} Totals</td>
                      <td style={{ padding: "10px 14px", textAlign: "right", fontFamily: "'DM Mono', monospace", fontWeight: 800, color: "var(--accent)" }}>{RM2(amortYearPrincipal)}</td>
                      <td style={{ padding: "10px 14px", textAlign: "right", fontFamily: "'DM Mono', monospace", fontWeight: 800, color: "#f87171" }}>{RM2(amortYearInterest)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </div>
      )}

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
  const [editingPrice, setEditingPrice] = useState(new Set());
  const [manualInput, setManualInput] = useState({});

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

  const commitManual = (ticker) => {
    const val = parseFloat(manualInput[ticker]);
    if (!isNaN(val) && val > 0) {
      setPrices(p => ({ ...p, [ticker]: { price: val, prevClose: null, manual: true, at: Date.now() } }));
      setFetchErrors(e => { const n = { ...e }; delete n[ticker]; return n; });
    }
    setEditingPrice(s => { const n = new Set(s); n.delete(ticker); return n; });
    setManualInput(m => { const n = { ...m }; delete n[ticker]; return n; });
  };

  const startEditing = (ticker) => setEditingPrice(s => new Set([...s, ticker]));
  const cancelEditing = (ticker) => setEditingPrice(s => { const n = new Set(s); n.delete(ticker); return n; });

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

  const exportStocksCsv = () => {
    const rows = enriched.map(h => ({
      Ticker: h.ticker, Shares: h.shares, "Buy Price (USD)": h.avgCost.toFixed(4),
      "Fees (USD)": (h.totalFees || 0).toFixed(2), "Total Cost (USD)": h.cost.toFixed(2),
      "Current Price (USD)": h.pd ? h.pd.price.toFixed(4) : "",
      "Market Value (USD)": h.value != null ? h.value.toFixed(2) : "",
      "P&L (USD)": h.pnl != null ? h.pnl.toFixed(2) : "",
      "P&L (%)": h.pnlPct != null ? h.pnlPct.toFixed(2) : "",
      "Buy Date": h.buyDate, Notes: h.notes,
    }));
    downloadBlob(`us-stocks-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows), "text/csv");
  };

  const exportStocksPdf = () => printTable("US Stock Portfolio", [{
    headers: ["Ticker", "Shares", "Buy Price", "Fees", "Total Cost", "Current Price", "Value", "P&L (USD)", "P&L %", "Buy Date"],
    rows: enriched.map(h => [
      h.ticker, h.shares, USD(h.avgCost), USD(h.totalFees || 0), USD(h.cost),
      h.pd ? USD(h.pd.price) : "—", h.value != null ? USD(h.value) : "—",
      h.pnl != null ? (h.pnl >= 0 ? "+" : "") + USD(h.pnl) : "—",
      h.pnlPct != null ? (h.pnlPct >= 0 ? "+" : "") + h.pnlPct.toFixed(2) + "%" : "—",
      h.buyDate,
    ]),
  }]);

  const addBtnStyle = {
    padding: "8px 18px", borderRadius: 8, background: "rgba(110,231,183,0.12)",
    color: "var(--accent)", border: "1px solid rgba(110,231,183,0.25)",
    cursor: "pointer", fontWeight: 600, fontSize: 13, fontFamily: "inherit", whiteSpace: "nowrap",
  };

  const exportBtnStyle = {
    padding: "6px 12px", borderRadius: 7, border: "1px solid var(--border)",
    background: "rgba(255,255,255,0.04)", color: "var(--label)", fontSize: 11,
    fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
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
              <button style={exportBtnStyle} onClick={exportStocksCsv}>↓ CSV</button>
              <button style={exportBtnStyle} onClick={exportStocksPdf}>⎙ PDF</button>
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
                        ) : editingPrice.has(h.ticker) ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}>
                            <input
                              autoFocus type="number" step="0.0001" min="0" placeholder="0.00"
                              value={manualInput[h.ticker] || ""}
                              onChange={e => setManualInput(m => ({ ...m, [h.ticker]: e.target.value }))}
                              onKeyDown={e => { if (e.key === "Enter") commitManual(h.ticker); if (e.key === "Escape") cancelEditing(h.ticker); }}
                              style={{ width: 80, padding: "4px 7px", borderRadius: 6, border: "1px solid var(--accent)", background: "rgba(110,231,183,0.08)", color: "var(--text)", fontFamily: "'DM Mono', monospace", fontSize: 12, outline: "none" }}
                            />
                            <button onClick={() => commitManual(h.ticker)} style={{ color: "var(--accent)", background: "none", border: "none", cursor: "pointer", fontSize: 15, padding: "2px 3px", lineHeight: 1 }} title="Confirm">✓</button>
                            <button onClick={() => cancelEditing(h.ticker)} style={{ color: "var(--muted)", background: "none", border: "none", cursor: "pointer", fontSize: 13, padding: "2px 3px", lineHeight: 1 }} title="Cancel">✕</button>
                          </div>
                        ) : err ? (
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                            <div style={{ display: "flex", gap: 6 }}>
                              <button onClick={() => fetchPrice(h.ticker)} style={{ color: "#f87171", background: "none", border: "none", cursor: "pointer", fontSize: 11, padding: 0 }} title={err}>⚠ Retry</button>
                              <button onClick={() => startEditing(h.ticker)} style={{ color: "var(--muted)", background: "none", border: "none", cursor: "pointer", fontSize: 11, padding: 0 }} title="Enter price manually">✎ Manual</button>
                            </div>
                          </div>
                        ) : h.pd ? (
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: 5, justifyContent: "flex-end" }}>
                              <div style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>{USD(h.pd.price)}</div>
                              <button onClick={() => startEditing(h.ticker)} style={{ color: "var(--muted)", background: "none", border: "none", cursor: "pointer", fontSize: 11, padding: 0, opacity: 0.5, lineHeight: 1 }} title="Override price">✎</button>
                            </div>
                            {h.pd.manual ? (
                              <div style={{ fontSize: 10, color: "var(--muted)", fontStyle: "italic" }}>manual</div>
                            ) : h.pd.prevClose != null && (() => {
                              const chg = ((h.pd.price - h.pd.prevClose) / h.pd.prevClose) * 100;
                              return <div style={{ fontSize: 11, color: chg >= 0 ? "#4ade80" : "#f87171" }}>{chg >= 0 ? "▲" : "▼"} {Math.abs(chg).toFixed(2)}% today</div>;
                            })()}
                          </div>
                        ) : (
                          <div style={{ display: "flex", gap: 5, justifyContent: "flex-end" }}>
                            <button onClick={() => fetchPrice(h.ticker)} style={{ padding: "4px 10px", borderRadius: 6, background: "rgba(110,231,183,0.1)", color: "var(--accent)", border: "1px solid rgba(110,231,183,0.2)", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>Fetch</button>
                            <button onClick={() => startEditing(h.ticker)} style={{ padding: "4px 8px", borderRadius: 6, background: "transparent", color: "var(--muted)", border: "1px solid var(--border)", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }} title="Enter price manually">✎</button>
                          </div>
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
  const [editingPrice, setEditingPrice] = useState(new Set());
  const [manualInput, setManualInput] = useState({});
  const [showDca, setShowDca] = useState(false);
  const [dcaTicker, setDcaTicker] = useState("");
  const [dcaAddAmount, setDcaAddAmount] = useState("");
  const [dcaAddPrice, setDcaAddPrice] = useState("");
  const [dcaAddFees, setDcaAddFees] = useState("0");

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

  const commitManual = (ticker) => {
    const val = parseFloat(manualInput[ticker]);
    if (!isNaN(val) && val > 0) {
      setPrices(p => ({ ...p, [ticker]: { price: val, change24h: null, manual: true, at: Date.now() } }));
      setFetchErrors(e => { const n = { ...e }; delete n[ticker]; return n; });
    }
    setEditingPrice(s => { const n = new Set(s); n.delete(ticker); return n; });
    setManualInput(m => { const n = { ...m }; delete n[ticker]; return n; });
  };

  const startEditing = (ticker) => setEditingPrice(s => new Set([...s, ticker]));
  const cancelEditing = (ticker) => setEditingPrice(s => { const n = new Set(s); n.delete(ticker); return n; });

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

  // Aggregate all lots for the selected DCA ticker
  const dcaPosition = useMemo(() => {
    if (!dcaTicker) return null;
    const lots = holdings.filter(h => h.ticker === dcaTicker);
    if (!lots.length) return null;
    const totalAmount = lots.reduce((s, h) => s + h.amount, 0);
    const totalCostBasis = lots.reduce((s, h) => s + h.amount * h.buyPrice + (h.totalFees || 0), 0);
    return { totalAmount, totalCostBasis, avgCost: totalAmount > 0 ? totalCostBasis / totalAmount : 0 };
  }, [dcaTicker, holdings]);

  // New average after the hypothetical add
  const dcaResult = useMemo(() => {
    if (!dcaPosition) return null;
    const addAmt = parseFloat(dcaAddAmount);
    const addPrice = parseFloat(dcaAddPrice);
    const addFees = parseFloat(dcaAddFees) || 0;
    if (!addAmt || addAmt <= 0 || !addPrice || addPrice <= 0) return null;
    const purchaseCost = addAmt * addPrice + addFees;
    const newAmount = dcaPosition.totalAmount + addAmt;
    const newCostBasis = dcaPosition.totalCostBasis + purchaseCost;
    const newAvgCost = newCostBasis / newAmount;
    const change = newAvgCost - dcaPosition.avgCost;
    const changePct = dcaPosition.avgCost > 0 ? (change / dcaPosition.avgCost) * 100 : 0;
    return { newAvgCost, newAmount, newCostBasis, purchaseCost, change, changePct };
  }, [dcaPosition, dcaAddAmount, dcaAddPrice, dcaAddFees]);

  const exportCryptoCsv = () => {
    const rows = enriched.map(h => ({
      Coin: h.ticker, Amount: h.amount, "Buy Price (USD)": h.buyPrice,
      "Fees (USD)": (h.totalFees || 0).toFixed(2), "Total Cost (USD)": h.cost.toFixed(2),
      "Current Price (USD)": h.pd ? h.pd.price : "",
      "Market Value (USD)": h.value != null ? h.value.toFixed(2) : "",
      "P&L (USD)": h.pnl != null ? h.pnl.toFixed(2) : "",
      "P&L (%)": h.pnlPct != null ? h.pnlPct.toFixed(2) : "",
      "24h Change (%)": h.pd?.change24h != null ? h.pd.change24h.toFixed(2) : "",
      "Buy Date": h.buyDate, Notes: h.notes,
    }));
    downloadBlob(`crypto-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows), "text/csv");
  };

  const exportCryptoPdf = () => printTable("Crypto Portfolio", [{
    headers: ["Coin", "Amount", "Buy Price", "Fees", "Total Cost", "Current Price", "Value", "P&L (USD)", "P&L %", "Buy Date"],
    rows: enriched.map(h => [
      h.ticker, h.amount, fmtCoin(h.buyPrice), USD(h.totalFees || 0), USD(h.cost),
      h.pd ? fmtCoin(h.pd.price) : "—", h.value != null ? USD(h.value) : "—",
      h.pnl != null ? (h.pnl >= 0 ? "+" : "") + USD(h.pnl) : "—",
      h.pnlPct != null ? (h.pnlPct >= 0 ? "+" : "") + h.pnlPct.toFixed(2) + "%" : "—",
      h.buyDate,
    ]),
  }]);

  const GOLD = "#fbbf24";
  const addBtnStyle = { padding: "8px 18px", borderRadius: 8, background: "rgba(251,191,36,0.12)", color: GOLD, border: "1px solid rgba(251,191,36,0.25)", cursor: "pointer", fontWeight: 600, fontSize: 13, fontFamily: "inherit", whiteSpace: "nowrap" };
  const exportBtnStyle = { padding: "6px 12px", borderRadius: 7, border: "1px solid var(--border)", background: "rgba(255,255,255,0.04)", color: "var(--label)", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };
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

      {/* DCA Calculator */}
      {holdings.length > 0 && (
        <div style={{ background: "var(--card-bg)", borderRadius: 16, border: "1px solid var(--border)", marginBottom: 20, overflow: "hidden" }}>
          <div style={{ padding: "18px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div>
              <div className="section-title" style={{ margin: 0, marginBottom: 3 }}>Cost Average Calculator</div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>Simulate adding to a position and see the new average cost</div>
            </div>
            <button
              onClick={() => setShowDca(s => !s)}
              style={{ ...exportBtnStyle, color: showDca ? GOLD : "var(--label)", borderColor: showDca ? "rgba(251,191,36,0.3)" : "var(--border)", whiteSpace: "nowrap" }}
            >
              {showDca ? "▲ Hide" : "▼ Show"}
            </button>
          </div>

          {showDca && (
            <div style={{ borderTop: "1px solid var(--border)", padding: "20px 24px 24px" }}>
              <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-start" }}>

                {/* Existing position */}
                <div style={{ flex: "1 1 180px" }}>
                  <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, marginBottom: 12 }}>Existing Position</div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 11, color: "var(--label)", display: "block", marginBottom: 4 }}>Coin</label>
                    <select className="hl-in" value={dcaTicker} onChange={e => { setDcaTicker(e.target.value); setDcaAddPrice(""); }}>
                      <option value="">— Select coin —</option>
                      {[...new Set(holdings.map(h => h.ticker))].map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  {dcaPosition ? (
                    <div style={{ padding: "12px 14px", borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)", fontSize: 13, lineHeight: 1.9 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", columnGap: 14 }}>
                        <span style={{ color: "var(--muted)", fontSize: 12 }}>Amount held</span>
                        <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>{dcaPosition.totalAmount.toPrecision(8).replace(/\.?0+$/, "")}</span>
                        <span style={{ color: "var(--muted)", fontSize: 12 }}>Avg cost / coin</span>
                        <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>{fmtCoin(dcaPosition.avgCost)}</span>
                        <span style={{ color: "var(--muted)", fontSize: 12 }}>Total invested</span>
                        <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>{USD(dcaPosition.totalCostBasis)}</span>
                      </div>
                    </div>
                  ) : (
                    <div style={{ padding: "16px 14px", borderRadius: 10, border: "1px dashed var(--border)", color: "var(--muted)", fontSize: 12, textAlign: "center" }}>
                      {dcaTicker ? `No lots found for ${dcaTicker}` : "Select a coin above"}
                    </div>
                  )}
                </div>

                {/* New purchase */}
                <div style={{ flex: "1 1 180px" }}>
                  <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, marginBottom: 12 }}>New Purchase</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <div>
                      <label style={{ fontSize: 11, color: "var(--label)", display: "block", marginBottom: 4 }}>Add Amount</label>
                      <input className="hl-in" type="number" placeholder="0.5" value={dcaAddAmount}
                        onChange={e => setDcaAddAmount(e.target.value)} min={0} step="any"
                        style={{ fontFamily: "'DM Mono', monospace" }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: "var(--label)", display: "block", marginBottom: 4 }}>At Price (USD / coin)</label>
                      <input className="hl-in" type="number" placeholder="0.00" value={dcaAddPrice}
                        onChange={e => setDcaAddPrice(e.target.value)} min={0} step="any"
                        style={{ fontFamily: "'DM Mono', monospace" }} />
                      {dcaTicker && prices[dcaTicker] && (
                        <button
                          onClick={() => setDcaAddPrice(String(prices[dcaTicker].price))}
                          style={{ marginTop: 5, padding: "3px 8px", borderRadius: 5, border: "1px solid rgba(251,191,36,0.3)", background: "rgba(251,191,36,0.06)", color: GOLD, fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
                        >
                          Use live · {fmtCoin(prices[dcaTicker].price)}
                        </button>
                      )}
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: "var(--label)", display: "block", marginBottom: 4 }}>Fees (USD)</label>
                      <input className="hl-in" type="number" placeholder="0" value={dcaAddFees}
                        onChange={e => setDcaAddFees(e.target.value)} min={0} step={0.01}
                        style={{ fontFamily: "'DM Mono', monospace" }} />
                    </div>
                  </div>
                </div>

                {/* Results */}
                <div style={{ flex: "1 1 200px" }}>
                  <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, marginBottom: 12 }}>After Purchase</div>
                  {dcaResult ? (
                    <>
                      <div style={{ padding: "14px 16px", borderRadius: 10, background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.2)", lineHeight: 1.9 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", columnGap: 14, fontSize: 13 }}>
                          <span style={{ color: "var(--muted)", fontSize: 12 }}>New amount</span>
                          <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>{dcaResult.newAmount.toPrecision(8).replace(/\.?0+$/, "")}</span>

                          <span style={{ color: "var(--muted)", fontSize: 12 }}>New avg cost</span>
                          <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 800, color: GOLD, fontSize: 15 }}>{fmtCoin(dcaResult.newAvgCost)}</span>

                          <span style={{ color: "var(--muted)", fontSize: 12 }}>vs current avg</span>
                          <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600, color: dcaResult.change <= 0 ? "#4ade80" : "#f87171" }}>
                            {dcaResult.change >= 0 ? "+" : ""}{fmtCoin(dcaResult.change)} ({dcaResult.changePct >= 0 ? "+" : ""}{dcaResult.changePct.toFixed(2)}%)
                          </span>

                          <span style={{ color: "var(--muted)", fontSize: 12 }}>New total invested</span>
                          <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>{USD(dcaResult.newCostBasis)}</span>

                          <span style={{ color: "var(--muted)", fontSize: 12 }}>This purchase</span>
                          <span style={{ fontFamily: "'DM Mono', monospace", color: "var(--label)" }}>{USD(dcaResult.purchaseCost)}</span>
                        </div>
                      </div>

                      {dcaTicker && prices[dcaTicker] && (() => {
                        const live = prices[dcaTicker].price;
                        const pnlPct = ((live - dcaResult.newAvgCost) / dcaResult.newAvgCost) * 100;
                        const pnl = (live - dcaResult.newAvgCost) * dcaResult.newAmount;
                        return (
                          <div style={{ marginTop: 10, padding: "10px 14px", borderRadius: 8, background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", fontSize: 12 }}>
                            <div style={{ color: "var(--muted)", marginBottom: 3 }}>P&amp;L at live price ({fmtCoin(live)})</div>
                            <div style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: pnlPct >= 0 ? "#4ade80" : "#f87171" }}>
                              {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}% &nbsp;·&nbsp; {pnl >= 0 ? "+" : ""}{USD(pnl)}
                            </div>
                          </div>
                        );
                      })()}
                    </>
                  ) : (
                    <div style={{ padding: "20px 16px", borderRadius: 10, border: "1px dashed var(--border)", textAlign: "center", color: "var(--muted)", fontSize: 12 }}>
                      {dcaPosition ? "Enter add amount and price" : "Select a coin to get started"}
                    </div>
                  )}
                </div>

              </div>
            </div>
          )}
        </div>
      )}

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
              <button style={exportBtnStyle} onClick={exportCryptoCsv}>↓ CSV</button>
              <button style={exportBtnStyle} onClick={exportCryptoPdf}>⎙ PDF</button>
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
                        ) : editingPrice.has(h.ticker) ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}>
                            <input
                              autoFocus type="number" step="0.000001" min="0" placeholder="0.00"
                              value={manualInput[h.ticker] || ""}
                              onChange={e => setManualInput(m => ({ ...m, [h.ticker]: e.target.value }))}
                              onKeyDown={e => { if (e.key === "Enter") commitManual(h.ticker); if (e.key === "Escape") cancelEditing(h.ticker); }}
                              style={{ width: 80, padding: "4px 7px", borderRadius: 6, border: `1px solid ${GOLD}`, background: "rgba(251,191,36,0.08)", color: "var(--text)", fontFamily: "'DM Mono', monospace", fontSize: 12, outline: "none" }}
                            />
                            <button onClick={() => commitManual(h.ticker)} style={{ color: GOLD, background: "none", border: "none", cursor: "pointer", fontSize: 15, padding: "2px 3px", lineHeight: 1 }} title="Confirm">✓</button>
                            <button onClick={() => cancelEditing(h.ticker)} style={{ color: "var(--muted)", background: "none", border: "none", cursor: "pointer", fontSize: 13, padding: "2px 3px", lineHeight: 1 }} title="Cancel">✕</button>
                          </div>
                        ) : err ? (
                          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                            <button onClick={() => fetchPrice(h.ticker)} style={{ color: "#f87171", background: "none", border: "none", cursor: "pointer", fontSize: 11, padding: 0 }} title={err}>⚠ Retry</button>
                            <button onClick={() => startEditing(h.ticker)} style={{ color: "var(--muted)", background: "none", border: "none", cursor: "pointer", fontSize: 11, padding: 0 }} title="Enter price manually">✎ Manual</button>
                          </div>
                        ) : h.pd ? (
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: 5, justifyContent: "flex-end" }}>
                              <div style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>{fmtCoin(h.pd.price)}</div>
                              <button onClick={() => startEditing(h.ticker)} style={{ color: "var(--muted)", background: "none", border: "none", cursor: "pointer", fontSize: 11, padding: 0, opacity: 0.5, lineHeight: 1 }} title="Override price">✎</button>
                            </div>
                            {h.pd.manual ? (
                              <div style={{ fontSize: 10, color: "var(--muted)", fontStyle: "italic" }}>manual</div>
                            ) : h.pd.change24h != null && (
                              <div style={{ fontSize: 11, color: h.pd.change24h >= 0 ? "#4ade80" : "#f87171" }}>
                                {h.pd.change24h >= 0 ? "▲" : "▼"} {Math.abs(h.pd.change24h).toFixed(2)}% 24h
                              </div>
                            )}
                          </div>
                        ) : (
                          <div style={{ display: "flex", gap: 5, justifyContent: "flex-end" }}>
                            <button onClick={() => fetchPrice(h.ticker)} style={{ padding: "4px 10px", borderRadius: 6, background: "rgba(251,191,36,0.1)", color: GOLD, border: "1px solid rgba(251,191,36,0.2)", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>Fetch</button>
                            <button onClick={() => startEditing(h.ticker)} style={{ padding: "4px 8px", borderRadius: 6, background: "transparent", color: "var(--muted)", border: "1px solid var(--border)", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }} title="Enter price manually">✎</button>
                          </div>
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

// ─── Malaysia Stocks Tab ──────────────────────────────────────────────

function MYStocksTab() {
  const [holdings, setHoldings] = useState(() => {
    try {
      const s = localStorage.getItem("mystocks_v1");
      if (s) { const h = JSON.parse(s); if (Array.isArray(h)) return h; }
    } catch {}
    return [];
  });

  const [prices, setPrices] = useState({});
  const [fetching, setFetching] = useState(new Set());
  const [fetchErrors, setFetchErrors] = useState({});
  const [form, setForm] = useState({ code: "", shares: "", avgCost: "", fees: "0", buyDate: "", notes: "" });
  const [refreshedAt, setRefreshedAt] = useState(null);
  const [editingPrice, setEditingPrice] = useState(new Set());
  const [manualInput, setManualInput] = useState({});

  useEffect(() => {
    try { localStorage.setItem("mystocks_v1", JSON.stringify(holdings)); } catch {}
  }, [holdings]);

  const toYahooTicker = (code) => {
    const c = code.toUpperCase().trim();
    return c.endsWith(".KL") ? c : c + ".KL";
  };

  const fetchPrice = async (code) => {
    const ticker = toYahooTicker(code);
    setFetching(s => new Set([...s, code]));
    setFetchErrors(e => { const n = { ...e }; delete n[code]; return n; });
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
        [code]: { price: meta.regularMarketPrice, prevClose: meta.previousClose ?? meta.chartPreviousClose, at: Date.now() },
      }));
    } catch (err) {
      setFetchErrors(e => ({ ...e, [code]: err.message || "Failed" }));
    }
    setFetching(s => { const n = new Set(s); n.delete(code); return n; });
  };

  const refreshAll = () => {
    const codes = [...new Set(holdings.map(h => h.code))];
    codes.forEach(fetchPrice);
    setRefreshedAt(Date.now());
  };

  const commitManual = (code) => {
    const val = parseFloat(manualInput[code]);
    if (!isNaN(val) && val > 0) {
      setPrices(p => ({ ...p, [code]: { price: val, prevClose: null, manual: true, at: Date.now() } }));
      setFetchErrors(e => { const n = { ...e }; delete n[code]; return n; });
    }
    setEditingPrice(s => { const n = new Set(s); n.delete(code); return n; });
    setManualInput(m => { const n = { ...m }; delete n[code]; return n; });
  };

  const startEditing = (code) => setEditingPrice(s => new Set([...s, code]));
  const cancelEditing = (code) => setEditingPrice(s => { const n = new Set(s); n.delete(code); return n; });

  const addHolding = () => {
    const code = form.code.toUpperCase().trim();
    if (!code || !form.shares || !form.avgCost) return;
    setHoldings(hs => [...hs, {
      id: uid(), code,
      shares: parseFloat(form.shares) || 0,
      avgCost: parseFloat(form.avgCost) || 0,
      totalFees: parseFloat(form.fees) || 0,
      buyDate: form.buyDate, notes: form.notes.trim(),
    }]);
    setForm({ code: "", shares: "", avgCost: "", fees: "0", buyDate: "", notes: "" });
  };

  const delHolding = (id) => setHoldings(hs => hs.filter(h => h.id !== id));

  const enriched = useMemo(() => holdings.map(h => {
    const cost = h.shares * h.avgCost + (h.totalFees || 0);
    const p = prices[h.code];
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

  const exportMyStocksCsv = () => {
    const rows = enriched.map(h => ({
      Code: h.code, Shares: h.shares, "Buy Price (MYR)": h.avgCost.toFixed(4),
      "Fees (MYR)": (h.totalFees || 0).toFixed(2), "Total Cost (MYR)": h.cost.toFixed(2),
      "Current Price (MYR)": h.pd ? h.pd.price.toFixed(4) : "",
      "Market Value (MYR)": h.value != null ? h.value.toFixed(2) : "",
      "P&L (MYR)": h.pnl != null ? h.pnl.toFixed(2) : "",
      "P&L (%)": h.pnlPct != null ? h.pnlPct.toFixed(2) : "",
      "Buy Date": h.buyDate, Notes: h.notes,
    }));
    downloadBlob(`bursa-stocks-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows), "text/csv");
  };

  const exportMyStocksPdf = () => printTable("Bursa Malaysia Stock Portfolio", [{
    headers: ["Code", "Shares", "Buy Price (MYR)", "Fees", "Total Cost", "Current Price", "Value", "P&L (MYR)", "P&L %", "Buy Date"],
    rows: enriched.map(h => [
      h.code, h.shares, RM2(h.avgCost), RM2(h.totalFees || 0), RM(h.cost),
      h.pd ? RM2(h.pd.price) : "—", h.value != null ? RM(h.value) : "—",
      h.pnl != null ? (h.pnl >= 0 ? "+" : "") + RM2(h.pnl) : "—",
      h.pnlPct != null ? (h.pnlPct >= 0 ? "+" : "") + h.pnlPct.toFixed(2) + "%" : "—",
      h.buyDate,
    ]),
  }]);

  const BLUE = "#38bdf8";
  const addBtnStyle = { padding: "8px 18px", borderRadius: 8, background: "rgba(56,189,248,0.12)", color: BLUE, border: "1px solid rgba(56,189,248,0.25)", cursor: "pointer", fontWeight: 600, fontSize: 13, fontFamily: "inherit", whiteSpace: "nowrap" };
  const exportBtnStyle = { padding: "6px 12px", borderRadius: 7, border: "1px solid var(--border)", background: "rgba(255,255,255,0.04)", color: "var(--label)", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };
  const thS = (align) => ({ padding: "12px 14px", textAlign: align, fontSize: 11, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" });
  const cols = [
    ["Stock", "left"], ["Shares", "right"], ["Buy Price", "right"], ["Fees", "right"],
    ["Total Cost", "right"], ["Current Price", "right"], ["Value", "right"],
    ["P&L (RM)", "right"], ["P&L %", "right"], ["", "right"],
  ];

  return (
    <div>
      {/* Summary */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
        <StatCard label="Total Invested" value={RM(totalCost)} sub="Cost basis incl. fees" color="#e8eaf0" />
        <StatCard
          label="Portfolio Value"
          value={priced.length ? RM(totalValue) : "—"}
          sub={priced.length < enriched.length && enriched.length > 0 ? `${priced.length}/${enriched.length} positions priced` : "Live prices"}
          color={BLUE}
        />
        <StatCard
          label="Total P&L"
          value={priced.length ? RM(totalPnl) : "—"}
          sub={totalPnlPct !== null ? `${totalPnl >= 0 ? "+" : ""}${totalPnlPct.toFixed(2)}% overall` : "Refresh to see"}
          color={totalPnl >= 0 ? "#4ade80" : "#f87171"}
        />
      </div>

      {/* Add Holding */}
      <div style={{ background: "var(--card-bg)", borderRadius: 16, padding: 24, border: "1px solid var(--border)", marginBottom: 20 }}>
        <div className="section-title">Add Holding</div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>
          Enter the Bursa Malaysia stock code (e.g. <strong style={{ color: "var(--label)" }}>1155</strong> for Maybank, <strong style={{ color: "var(--label)" }}>5347</strong> for Tenaga, <strong style={{ color: "var(--label)" }}>MAYBANK</strong>). The .KL suffix is added automatically.
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
          <div style={{ flex: "0 0 110px" }}>
            <label style={{ fontSize: 11, color: "var(--label)", display: "block", marginBottom: 4 }}>Stock Code</label>
            <input className="hl-in" style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, textTransform: "uppercase" }}
              placeholder="1155" value={form.code}
              onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
              onKeyDown={e => e.key === "Enter" && addHolding()} />
          </div>
          <div style={{ flex: "1 1 90px" }}>
            <label style={{ fontSize: 11, color: "var(--label)", display: "block", marginBottom: 4 }}>Shares</label>
            <input className="hl-in" type="number" placeholder="1000" value={form.shares}
              onChange={e => setForm(f => ({ ...f, shares: e.target.value }))} min={0} step={100}
              style={{ fontFamily: "'DM Mono', monospace" }} />
          </div>
          <div style={{ flex: "1 1 120px" }}>
            <label style={{ fontSize: 11, color: "var(--label)", display: "block", marginBottom: 4 }}>Buy Price (RM/share)</label>
            <input className="hl-in" type="number" placeholder="9.50" value={form.avgCost}
              onChange={e => setForm(f => ({ ...f, avgCost: e.target.value }))} min={0} step={0.005}
              style={{ fontFamily: "'DM Mono', monospace" }} />
          </div>
          <div style={{ flex: "1 1 90px" }}>
            <label style={{ fontSize: 11, color: "var(--label)", display: "block", marginBottom: 4 }}>Fees (RM)</label>
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
              <button onClick={refreshAll} disabled={anyFetching} style={{ padding: "6px 16px", borderRadius: 8, background: anyFetching ? "transparent" : "rgba(56,189,248,0.1)", color: anyFetching ? "var(--muted)" : BLUE, border: "1px solid rgba(56,189,248,0.2)", cursor: anyFetching ? "not-allowed" : "pointer", fontWeight: 600, fontSize: 12, fontFamily: "inherit" }}>
                {anyFetching ? "⟳ Fetching…" : "⟳ Refresh Prices"}
              </button>
              <button style={exportBtnStyle} onClick={exportMyStocksCsv}>↓ CSV</button>
              <button style={exportBtnStyle} onClick={exportMyStocksPdf}>⎙ PDF</button>
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
                  const isLoading = fetching.has(h.code);
                  const err = fetchErrors[h.code];
                  return (
                    <tr key={h.id} style={{ borderBottom: "1px solid var(--border)", background: i % 2 ? "rgba(255,255,255,0.01)" : "transparent" }}>
                      <td style={{ padding: "12px 14px" }}>
                        <div style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: BLUE, fontSize: 14 }}>{h.code}</div>
                        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>{toYahooTicker(h.code)}</div>
                        {h.buyDate && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>{h.buyDate}</div>}
                        {h.notes && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.notes}</div>}
                      </td>
                      <td style={{ padding: "12px 14px", textAlign: "right", fontFamily: "'DM Mono', monospace" }}>{h.shares.toLocaleString()}</td>
                      <td style={{ padding: "12px 14px", textAlign: "right", fontFamily: "'DM Mono', monospace" }}>{RM2(h.avgCost)}</td>
                      <td style={{ padding: "12px 14px", textAlign: "right", fontFamily: "'DM Mono', monospace", color: "var(--muted)" }}>{RM2(h.totalFees)}</td>
                      <td style={{ padding: "12px 14px", textAlign: "right", fontFamily: "'DM Mono', monospace" }}>{RM(h.cost)}</td>
                      <td style={{ padding: "12px 14px", textAlign: "right" }}>
                        {isLoading ? (
                          <span style={{ color: "var(--muted)", fontSize: 12 }}>Loading…</span>
                        ) : editingPrice.has(h.code) ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}>
                            <input
                              autoFocus type="number" step="0.0001" min="0" placeholder="0.00"
                              value={manualInput[h.code] || ""}
                              onChange={e => setManualInput(m => ({ ...m, [h.code]: e.target.value }))}
                              onKeyDown={e => { if (e.key === "Enter") commitManual(h.code); if (e.key === "Escape") cancelEditing(h.code); }}
                              style={{ width: 80, padding: "4px 7px", borderRadius: 6, border: `1px solid ${BLUE}`, background: "rgba(56,189,248,0.08)", color: "var(--text)", fontFamily: "'DM Mono', monospace", fontSize: 12, outline: "none" }}
                            />
                            <button onClick={() => commitManual(h.code)} style={{ color: BLUE, background: "none", border: "none", cursor: "pointer", fontSize: 15, padding: "2px 3px", lineHeight: 1 }} title="Confirm">✓</button>
                            <button onClick={() => cancelEditing(h.code)} style={{ color: "var(--muted)", background: "none", border: "none", cursor: "pointer", fontSize: 13, padding: "2px 3px", lineHeight: 1 }} title="Cancel">✕</button>
                          </div>
                        ) : err ? (
                          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                            <button onClick={() => fetchPrice(h.code)} style={{ color: "#f87171", background: "none", border: "none", cursor: "pointer", fontSize: 11, padding: 0 }} title={err}>⚠ Retry</button>
                            <button onClick={() => startEditing(h.code)} style={{ color: "var(--muted)", background: "none", border: "none", cursor: "pointer", fontSize: 11, padding: 0 }} title="Enter price manually">✎ Manual</button>
                          </div>
                        ) : h.pd ? (
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: 5, justifyContent: "flex-end" }}>
                              <div style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>{RM2(h.pd.price)}</div>
                              <button onClick={() => startEditing(h.code)} style={{ color: "var(--muted)", background: "none", border: "none", cursor: "pointer", fontSize: 11, padding: 0, opacity: 0.5, lineHeight: 1 }} title="Override price">✎</button>
                            </div>
                            {h.pd.manual ? (
                              <div style={{ fontSize: 10, color: "var(--muted)", fontStyle: "italic" }}>manual</div>
                            ) : h.pd.prevClose != null && (() => {
                              const chg = ((h.pd.price - h.pd.prevClose) / h.pd.prevClose) * 100;
                              return <div style={{ fontSize: 11, color: chg >= 0 ? "#4ade80" : "#f87171" }}>{chg >= 0 ? "▲" : "▼"} {Math.abs(chg).toFixed(2)}% today</div>;
                            })()}
                          </div>
                        ) : (
                          <div style={{ display: "flex", gap: 5, justifyContent: "flex-end" }}>
                            <button onClick={() => fetchPrice(h.code)} style={{ padding: "4px 10px", borderRadius: 6, background: "rgba(56,189,248,0.1)", color: BLUE, border: "1px solid rgba(56,189,248,0.2)", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>Fetch</button>
                            <button onClick={() => startEditing(h.code)} style={{ padding: "4px 8px", borderRadius: 6, background: "transparent", color: "var(--muted)", border: "1px solid var(--border)", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }} title="Enter price manually">✎</button>
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "12px 14px", textAlign: "right", fontFamily: "'DM Mono', monospace" }}>{h.value !== null ? RM(h.value) : "—"}</td>
                      <td style={{ padding: "12px 14px", textAlign: "right", fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>
                        {h.pnl !== null ? <span style={{ color: h.pnl >= 0 ? "#4ade80" : "#f87171" }}>{h.pnl >= 0 ? "+" : ""}{RM(h.pnl)}</span> : "—"}
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
                    <td style={{ padding: "12px 14px", textAlign: "right", fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>{RM(totalCost)}</td>
                    <td />
                    <td style={{ padding: "12px 14px", textAlign: "right", fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>{priced.length ? RM(totalValue) : "—"}</td>
                    <td style={{ padding: "12px 14px", textAlign: "right", fontFamily: "'DM Mono', monospace", fontWeight: 800 }}>
                      {priced.length ? <span style={{ color: totalPnl >= 0 ? "#4ade80" : "#f87171" }}>{totalPnl >= 0 ? "+" : ""}{RM(totalPnl)}</span> : "—"}
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
          No holdings yet. Add your first Bursa Malaysia stock above.
        </div>
      )}

      <div style={{ padding: "14px 18px", borderRadius: 12, background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", fontSize: 11, color: "var(--muted)", lineHeight: 1.7 }}>
        <strong style={{ color: "var(--label)" }}>Note (Bursa Malaysia):</strong> Prices are fetched from Yahoo Finance using the .KL suffix and may be delayed 15–20 minutes during Bursa trading hours (9:00am–5:00pm MYT, Mon–Fri). P&L is unrealised gain/loss based on cost basis (shares × buy price + fees). Include brokerage fees and stamp duty in the Fees field for accurate cost basis. All values in MYR. For personal record-keeping only — not financial advice.
      </div>
    </div>
  );
}

// ─── EPF Tab ──────────────────────────────────────────────────────────

const EPF_PER = "#10b981";
const EPF_SEJ = "#6366f1";
const EPF_FLK = "#f59e0b";

function EPFTab() {
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
        <strong style={{ color: "var(--label)" }}>Note (EPF Malaysia):</strong> Employee contribution is 11% for members under 60 (55% reduced rate applies above 60). Employer contributes 12% for wages above RM 5,000 or 13% for RM 5,000 and below, dropping to 6% above 60. Post-2024 restructure: contributions split as Persaraan 75% / Sejahtera 15% / Fleksibel 10%. Dividend is projected at a flat rate applied to average balance. For personal planning only — not financial advice.
      </div>
    </div>
  );
}

// ─── Fixed Deposits Tab ───────────────────────────────────────────────

const FD_EMPTY = { id: null, bank: "", principal: "", rate: "", tenureMonths: "12", startDate: "", notes: "" };

function calcFd(fd) {
  const p = parseFloat(fd.principal) || 0;
  const r = parseFloat(fd.rate) || 0;
  const t = parseInt(fd.tenureMonths) || 0;
  if (!p || !r || !t) return null;
  const interest = p * (r / 100) * (t / 12);
  const maturityValue = p + interest;
  let maturityDate = null;
  if (fd.startDate) {
    const d = new Date(fd.startDate + "-01");
    d.setMonth(d.getMonth() + t);
    maturityDate = d.toLocaleDateString("en-MY", { month: "short", year: "numeric" });
  }
  return { interest, maturityValue, maturityDate, effectiveAnnual: (r / 100) };
}

function FixedDepositsTab() {
  const [deposits, setDeposits] = useState(() => {
    try {
      const s = localStorage.getItem("fd_v1");
      if (s) { const d = JSON.parse(s); if (Array.isArray(d)) return d; }
    } catch {}
    return [];
  });
  const [form, setForm] = useState({ ...FD_EMPTY });
  const [editId, setEditId] = useState(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    try { localStorage.setItem("fd_v1", JSON.stringify(deposits)); } catch {}
  }, [deposits]);

  const fmtRM = v => "RM " + v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const fmtRMk = v => "RM " + (v >= 1000 ? (v / 1000).toFixed(1) + "k" : v.toFixed(0));

  const resetForm = () => { setForm({ ...FD_EMPTY }); setEditId(null); setShowForm(false); };

  const handleSave = () => {
    if (!form.bank || !form.principal || !form.rate || !form.tenureMonths) return;
    if (editId !== null) {
      setDeposits(d => d.map(x => x.id === editId ? { ...form, id: editId } : x));
    } else {
      setDeposits(d => [...d, { ...form, id: Date.now() }]);
    }
    resetForm();
  };

  const handleEdit = (dep) => {
    setForm({ ...dep });
    setEditId(dep.id);
    setShowForm(true);
  };

  const handleDelete = (id) => setDeposits(d => d.filter(x => x.id !== id));

  const totals = useMemo(() => {
    let principal = 0, interest = 0, maturity = 0;
    deposits.forEach(fd => {
      const c = calcFd(fd);
      if (!c) return;
      principal += parseFloat(fd.principal) || 0;
      interest += c.interest;
      maturity += c.maturityValue;
    });
    return { principal, interest, maturity };
  }, [deposits]);

  const inputStyle = {
    background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 8,
    padding: "6px 10px", color: "var(--text)", fontSize: 13, width: "100%",
  };
  const cardStyle = { borderRadius: 12, padding: "14px 18px", background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)" };
  const FD_COLOR = "#34d399";
  const INT_COLOR = "#f59e0b";

  const exportCsv = () => {
    const rows = deposits.map(fd => {
      const c = calcFd(fd) || {};
      return {
        Bank: fd.bank,
        "Principal (RM)": parseFloat(fd.principal) || 0,
        "Rate (% p.a.)": parseFloat(fd.rate) || 0,
        "Tenure (months)": fd.tenureMonths,
        "Start Date": fd.startDate || "",
        "Maturity Date": c.maturityDate || "",
        "Interest Earned (RM)": (c.interest || 0).toFixed(2),
        "Maturity Value (RM)": (c.maturityValue || 0).toFixed(2),
        Notes: fd.notes || "",
      };
    });
    downloadBlob(
      `fixed-deposits-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(rows), "text/csv"
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

      {/* Summary cards */}
      {deposits.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
          {[
            { label: "Total Principal", value: totals.principal, color: FD_COLOR },
            { label: "Total Interest", value: totals.interest, color: INT_COLOR },
            { label: "Total at Maturity", value: totals.maturity, color: "#fff" },
            { label: "Avg Rate", value: null, extra: deposits.length > 0 ? (deposits.reduce((s, fd) => s + (parseFloat(fd.rate) || 0), 0) / deposits.length).toFixed(2) + "% p.a." : "—", color: "#818cf8" },
          ].map(({ label, value, extra, color }) => (
            <div key={label} style={{ ...cardStyle, textAlign: "center" }}>
              <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 6 }}>{label}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color }}>{extra ?? fmtRM(value)}</div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit form */}
      <div style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: showForm ? 14 : 0 }}>
          <div style={{ fontSize: 12, color: "var(--label)", fontWeight: 600 }}>{editId !== null ? "Edit Deposit" : "Add Fixed Deposit"}</div>
          <button
            onClick={() => { if (showForm && editId === null) resetForm(); else setShowForm(v => !v); }}
            style={{ background: showForm ? "rgba(255,255,255,0.06)" : FD_COLOR, color: showForm ? "var(--muted)" : "#000", border: "none", borderRadius: 8, padding: "5px 14px", fontSize: 12, cursor: "pointer", fontWeight: 600 }}
          >{showForm ? "✕ Cancel" : "+ Add"}</button>
        </div>
        {showForm && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>Bank / Institution *</div>
              <input placeholder="e.g. Maybank" value={form.bank} onChange={e => setForm(f => ({ ...f, bank: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>Principal (RM) *</div>
              <input type="number" min={0} placeholder="50000" value={form.principal} onChange={e => setForm(f => ({ ...f, principal: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>Interest Rate (% p.a.) *</div>
              <input type="number" min={0} max={30} step={0.01} placeholder="3.85" value={form.rate} onChange={e => setForm(f => ({ ...f, rate: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>Tenure (months) *</div>
              <select value={form.tenureMonths} onChange={e => setForm(f => ({ ...f, tenureMonths: e.target.value }))} style={inputStyle}>
                {[1, 2, 3, 6, 9, 12, 18, 24, 36, 48, 60].map(m => (
                  <option key={m} value={m}>{m} month{m !== 1 ? "s" : ""}</option>
                ))}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>Start Date</div>
              <input type="month" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>Notes</div>
              <input placeholder="e.g. auto-renew" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={inputStyle} />
            </div>
            <div style={{ display: "flex", alignItems: "flex-end" }}>
              <button
                onClick={handleSave}
                disabled={!form.bank || !form.principal || !form.rate || !form.tenureMonths}
                style={{ width: "100%", padding: "8px 0", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13, background: FD_COLOR, color: "#000", opacity: (!form.bank || !form.principal || !form.rate) ? 0.4 : 1 }}
              >{editId !== null ? "Save Changes" : "Add Deposit"}</button>
            </div>
          </div>
        )}
      </div>

      {/* Live preview while form is open */}
      {showForm && form.principal && form.rate && form.tenureMonths && (() => {
        const c = calcFd(form);
        if (!c) return null;
        return (
          <div style={{ ...cardStyle, background: "rgba(52,211,153,0.06)", border: "1px solid rgba(52,211,153,0.25)" }}>
            <div style={{ fontSize: 11, color: FD_COLOR, fontWeight: 600, marginBottom: 10 }}>Preview</div>
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
              <div><div style={{ fontSize: 10, color: "var(--muted)" }}>Interest Earned</div><div style={{ fontSize: 16, fontWeight: 700, color: INT_COLOR }}>{fmtRM(c.interest)}</div></div>
              <div><div style={{ fontSize: 10, color: "var(--muted)" }}>Maturity Value</div><div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>{fmtRM(c.maturityValue)}</div></div>
              {c.maturityDate && <div><div style={{ fontSize: 10, color: "var(--muted)" }}>Matures</div><div style={{ fontSize: 16, fontWeight: 700, color: FD_COLOR }}>{c.maturityDate}</div></div>}
            </div>
          </div>
        );
      })()}

      {/* Deposits list */}
      {deposits.length > 0 && (
        <div style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: "var(--label)", fontWeight: 600 }}>Your Fixed Deposits</div>
            <button onClick={exportCsv} style={{ background: "rgba(255,255,255,0.06)", color: "var(--muted)", border: "1px solid var(--border)", borderRadius: 8, padding: "4px 12px", fontSize: 11, cursor: "pointer" }}>⬇ CSV</button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {deposits.map(fd => {
              const c = calcFd(fd);
              const p = parseFloat(fd.principal) || 0;
              return (
                <div key={fd.id} style={{ borderRadius: 10, padding: "12px 14px", background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 700, fontSize: 14, color: FD_COLOR }}>{fd.bank}</span>
                        <span style={{ fontSize: 12, color: "var(--muted)" }}>{fd.tenureMonths}mo @ {fd.rate}% p.a.</span>
                        {fd.notes && <span style={{ fontSize: 11, color: "var(--muted)", fontStyle: "italic" }}>{fd.notes}</span>}
                      </div>
                      <div style={{ display: "flex", gap: 18, marginTop: 8, flexWrap: "wrap" }}>
                        <div>
                          <div style={{ fontSize: 10, color: "var(--muted)" }}>Principal</div>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{fmtRM(p)}</div>
                        </div>
                        {c && <>
                          <div>
                            <div style={{ fontSize: 10, color: "var(--muted)" }}>Interest</div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: INT_COLOR }}>+{fmtRM(c.interest)}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: 10, color: "var(--muted)" }}>Maturity Value</div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>{fmtRM(c.maturityValue)}</div>
                          </div>
                          {c.maturityDate && (
                            <div>
                              <div style={{ fontSize: 10, color: "var(--muted)" }}>Matures</div>
                              <div style={{ fontSize: 13, fontWeight: 600, color: FD_COLOR }}>{c.maturityDate}</div>
                            </div>
                          )}
                        </>}
                      </div>
                      {/* Interest bar */}
                      {c && p > 0 && (
                        <div style={{ marginTop: 10 }}>
                          <div style={{ height: 6, borderRadius: 4, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                            <div style={{ height: "100%", borderRadius: 4, background: INT_COLOR, width: `${Math.min(100, (c.interest / c.maturityValue) * 100 * 3)}%`, transition: "width 0.3s" }} />
                          </div>
                          <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 3 }}>
                            {((c.interest / p) * 100).toFixed(2)}% total return over {fd.tenureMonths} months
                          </div>
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <button onClick={() => handleEdit(fd)} style={{ background: "rgba(255,255,255,0.06)", color: "var(--muted)", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 10px", fontSize: 11, cursor: "pointer" }}>✎</button>
                      <button onClick={() => handleDelete(fd.id)} style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 6, padding: "4px 10px", fontSize: 11, cursor: "pointer" }}>✕</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {deposits.length === 0 && !showForm && (
        <div style={{ textAlign: "center", color: "var(--muted)", fontSize: 13, padding: "40px 0" }}>
          No fixed deposits yet. Click <strong style={{ color: FD_COLOR }}>+ Add</strong> to get started.
        </div>
      )}

      <div style={{ padding: "12px 16px", borderRadius: 10, background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", fontSize: 11, color: "var(--muted)", lineHeight: 1.7 }}>
        <strong style={{ color: "var(--label)" }}>Note:</strong> Interest calculated using simple interest: <em>Principal × Rate × (Tenure / 12)</em>. This matches how most Malaysian banks (Maybank, CIMB, Public Bank, RHB etc.) calculate FD interest. For compound interest products, the actual return may differ slightly. All values in MYR. For personal record-keeping only — not financial advice.
      </div>
    </div>
  );
}

// ─── Savings Rate Tab ─────────────────────────────────────────────────

const EXPENSE_CATS = ["Rent / Housing", "Food & Dining", "Transport", "Utilities & Bills", "Insurance", "Entertainment", "Subscriptions", "Loan Repayments", "Others"];
const EXPENSE_CAT_COLORS = ["#6ee7b7", "#6366f1", "#f59e0b", "#f472b6", "#38bdf8", "#34d399", "#fbbf24", "#f87171", "#a78bfa"];

function SavingsTab({ projectionData, yearsToProject, cpfMonthly, salary }) {
  const [takeHome, setTakeHome]     = useState(() => parseFloat(localStorage.getItem("sav_income") || "0"));
  const [otherIncome, setOtherIncome] = useState(() => parseFloat(localStorage.getItem("sav_other") || "0"));
  const [expenses, setExpenses]     = useState(() => {
    try { const s = localStorage.getItem("sav_expenses_v1"); return s ? JSON.parse(s) : []; } catch { return []; }
  });
  const [form, setForm]   = useState({ category: EXPENSE_CATS[0], amount: "", note: "" });
  const [editId, setEditId] = useState(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => { localStorage.setItem("sav_income", takeHome); }, [takeHome]);
  useEffect(() => { localStorage.setItem("sav_other", otherIncome); }, [otherIncome]);
  useEffect(() => { try { localStorage.setItem("sav_expenses_v1", JSON.stringify(expenses)); } catch {} }, [expenses]);

  const goals = useMemo(() => {
    try { const s = localStorage.getItem("goals_v1"); return s ? JSON.parse(s) : []; } catch { return []; }
  }, []);

  const fxUsdSgd = useMemo(() => parseFloat(localStorage.getItem("fx_usd_sgd") || "1.35"), []);
  const fxMyrSgd = useMemo(() => parseFloat(localStorage.getItem("fx_myr_sgd") || "0.30"), []);

  const totalIncome   = takeHome + otherIncome;
  const totalExpenses = useMemo(() => expenses.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0), [expenses]);
  const monthlySavings = totalIncome - totalExpenses;
  const savingsRate    = totalIncome > 0 ? (monthlySavings / totalIncome) * 100 : 0;
  const annualSavings  = monthlySavings * 12;

  const rateColor = savingsRate >= 20 ? "#6ee7b7" : savingsRate >= 10 ? "#fbbf24" : "#f87171";

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
  const handleDelete = (id) => setExpenses(es => es.filter(e => e.id !== id));
  const cancelForm   = () => { setForm({ category: EXPENSE_CATS[0], amount: "", note: "" }); setEditId(null); setShowForm(false); };

  const expByCat = useMemo(() => {
    const map = {};
    expenses.forEach(e => { const a = parseFloat(e.amount) || 0; map[e.category] = (map[e.category] || 0) + a; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [expenses]);

  const savingsProjection = useMemo(() => projectionData.map((d, i) => ({
    year: i, age: d.age, cpf: d.total,
    cash: Math.max(0, Math.round(annualSavings * i)),
  })), [projectionData, annualSavings]);

  const fmtSGD = v => "S$" + Math.round(v).toLocaleString();
  const cardStyle  = { borderRadius: 12, padding: "14px 18px", background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)" };
  const inputStyle = { background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 10px", color: "var(--text)", fontSize: 13, width: "100%" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

      {/* CPF forced savings context */}
      {cpfMonthly && salary > 0 && (
        <div style={{ ...cardStyle, background: "rgba(110,231,183,0.05)", border: "1px solid rgba(110,231,183,0.2)" }}>
          <div style={{ fontSize: 11, color: "#6ee7b7", fontWeight: 600, marginBottom: 8 }}>
            CPF Forced Savings — salary S${salary.toLocaleString()}
          </div>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            {[
              { label: "OA",              val: cpfMonthly.oaAmount,        color: "#6ee7b7" },
              { label: "SA",              val: cpfMonthly.saAmount,         color: "#818cf8" },
              { label: "MA",              val: cpfMonthly.maAmount,         color: "#f472b6" },
              { label: "Employee total",  val: cpfMonthly.employeeContrib,  color: "var(--text)" },
              { label: "Employer total",  val: cpfMonthly.employerContrib,  color: "var(--muted)" },
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

      {/* Income */}
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
        </div>
      </div>

      {/* Expenses */}
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

      {/* ─── Results (only when income entered) ─── */}
      {totalIncome > 0 && (<>

        {/* Big savings rate */}
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

        {/* Summary cards */}
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

        {/* Income allocation bar */}
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
            {/* Expense breakdown */}
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

        {/* Wealth accumulation projection */}
        <div style={cardStyle}>
          <div style={{ fontSize: 12, color: "var(--label)", fontWeight: 600, marginBottom: 4 }}>Wealth Accumulation Projection</div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 16 }}>Cash savings (flat) stacked with CPF projection</div>
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
              <Area type="monotone" dataKey="cpf"  name="CPF"           stackId="1" stroke="#6ee7b7" fill="url(#savGradCpf)"  strokeWidth={1.5} dot={false} />
              <Area type="monotone" dataKey="cash" name="Cash Savings"  stackId="1" stroke={rateColor} fill="url(#savGradCash)" strokeWidth={1.5} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
          <div style={{ display: "flex", gap: 16, marginTop: 10, flexWrap: "wrap" }}>
            {[
              { color: "#6ee7b7", label: "CPF (projected)" },
              { color: rateColor, label: "Cash savings (flat monthly rate)" },
            ].map(({ color, label }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: color }} />
                <span style={{ fontSize: 11, color: "var(--muted)" }}>{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Goals realism */}
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
        <strong style={{ color: "var(--label)" }}>Note:</strong> Savings rate = (Income − Expenses) ÷ Income. The 20% benchmark is a widely-used personal finance guideline. Cash savings projection assumes a flat monthly rate with no investment returns. Goals check uses cash savings only; CPF is shown separately. FX for non-SGD goals uses the rates set in the Net Worth tab. For personal planning only — not financial advice.
      </div>
    </div>
  );
}

// ─── FIRE Tab ─────────────────────────────────────────────────────────

function FireTab({ projectionData, yearsToProject }) {
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

  const stocksCost    = stockHoldings.reduce((s, h)  => s + h.shares * h.avgCost + (h.totalFees || 0), 0);
  const cryptoCost    = cryptoHoldings.reduce((s, h) => s + h.amount * h.buyPrice + (h.totalFees || 0), 0);
  const myStockCost   = myStocks.reduce((s, h)       => s + h.shares * h.avgCost + (h.totalFees || 0), 0);
  const fdPrincipal   = fdList.reduce((s, fd)        => s + (parseFloat(fd.principal) || 0), 0);
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
    const cpf         = d.total;
    const epfMYR      = i === 0 ? epfStart : (epfProjection[i - 1]?.total ?? epfStart);
    const epf         = includeEpf ? Math.round(epfMYR * myrToSgd) : 0;
    const staticAssets = Math.round((housingEquity + myStockCost + fdPrincipal) * myrToSgd + (stocksCost + cryptoCost) * usdToSgd);
    const cash        = includeCash ? Math.round(monthlySavings * 12 * i) : 0;
    return { year: i, age: d.age, cpf, epf, staticAssets, cash, total: cpf + epf + staticAssets + cash, fireTarget: fireNumber };
  }), [projectionData, epfProjection, epfStart, myrToSgd, usdToSgd, housingEquity, myStockCost, fdPrincipal, stocksCost, cryptoCost, monthlySavings, includeEpf, includeCash, fireNumber]);

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

      {/* Settings */}
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
          <PresetBtn label="Lean FIRE (5%)"        rate={5}   />
          <PresetBtn label="4% Rule"               rate={4}   />
          <PresetBtn label="Conservative (3.5%)"   rate={3.5} />
          <PresetBtn label="Fat FIRE (3%)"         rate={3}   />
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <ToggleChip label="Include EPF"           value={includeEpf}  onChange={setIncludeEpf}  />
          <ToggleChip label="Include cash savings"  value={includeCash} onChange={setIncludeCash} />
        </div>
      </div>

      {/* FIRE number hero */}
      <div style={{ ...cardStyle, background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.25)", textAlign: "center", padding: "28px 20px" }}>
        <div style={{ fontSize: 11, color: FIRE_COLOR, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Your FIRE Number</div>
        <div style={{ fontSize: 52, fontWeight: 800, fontFamily: "'DM Mono', monospace", color: FIRE_COLOR, lineHeight: 1 }}>{fmtSGDM(fireNumber)}</div>
        <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 8 }}>
          S${annualExpenses.toLocaleString()}/yr annual expenses × {(100 / withdrawalRate).toFixed(0)}× multiplier
        </div>
      </div>

      {/* Progress bar */}
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

      {/* Crossover callout */}
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

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
        {[
          { label: "Annual expenses",              value: fmtSGD(annualExpenses),   color: "var(--muted)" },
          { label: "FIRE number",                  value: fmtSGDM(fireNumber),      color: FIRE_COLOR     },
          { label: "Monthly passive income @ FIRE", value: fmtSGD(monthlyExpenses), color: "#6ee7b7"      },
          { label: "Withdrawal rate",              value: `${withdrawalRate}%`,      color: "#818cf8"      },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ ...cardStyle, textAlign: "center" }}>
            <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Trajectory chart */}
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
            <Area type="monotone" dataKey="cpf"          name="CPF"           stackId="1" stroke="#6ee7b7"   fill="url(#fireGradCpf)"    strokeWidth={1.5} dot={false} />
            {includeEpf  && <Area type="monotone" dataKey="epf"          name="EPF (SGD)"     stackId="1" stroke="#6366f1"   fill="url(#fireGradEpf)"    strokeWidth={1.5} dot={false} />}
            <Area type="monotone" dataKey="staticAssets" name="Other Assets"  stackId="1" stroke="#38bdf8"   fill="url(#fireGradStatic)" strokeWidth={1.5} dot={false} />
            {includeCash && <Area type="monotone" dataKey="cash"         name="Cash Savings"  stackId="1" stroke={FIRE_COLOR} fill="url(#fireGradCash)"  strokeWidth={1.5} dot={false} />}
            <Area type="monotone" dataKey="fireTarget" name="FIRE Target" stackId={undefined}
              stroke={FIRE_COLOR} fill="none" strokeWidth={2} strokeDasharray="8 4" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Sensitivity table */}
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
        <strong style={{ color: "var(--label)" }}>Note:</strong> FIRE number = Annual expenses ÷ Safe withdrawal rate. The 4% rule originates from the Trinity Study (US equities, 30-year horizon). Actual safe withdrawal rates vary by asset allocation, country, and retirement length. CPF and EPF are projected using their respective tab settings. Other assets are at current cost basis (no future growth assumed). Cash savings are projected at a flat monthly rate. For planning purposes only — not financial advice.
      </div>
    </div>
  );
}

// ─── Net Worth Tab ────────────────────────────────────────────────────

function NetWorthTab({ projectionData, yearsToProject }) {
  const [usdToSgd, setUsdToSgd] = useState(() => parseFloat(localStorage.getItem("fx_usd_sgd") || "1.35"));
  const [myrToSgd, setMyrToSgd] = useState(() => parseFloat(localStorage.getItem("fx_myr_sgd") || "0.30"));

  useEffect(() => { localStorage.setItem("fx_usd_sgd", usdToSgd); }, [usdToSgd]);
  useEffect(() => { localStorage.setItem("fx_myr_sgd", myrToSgd); }, [myrToSgd]);

  const stockHoldings  = useMemo(() => { try { const s = localStorage.getItem("stocks_v1");   return s ? JSON.parse(s) : []; } catch { return []; } }, []);
  const cryptoHoldings = useMemo(() => { try { const s = localStorage.getItem("crypto_v1");   return s ? JSON.parse(s) : []; } catch { return []; } }, []);
  const myStocks       = useMemo(() => { try { const s = localStorage.getItem("mystocks_v1"); return s ? JSON.parse(s) : []; } catch { return []; } }, []);
  const properties     = useMemo(() => { try { const s = localStorage.getItem("hl_props_v1"); return s ? JSON.parse(s) : []; } catch { return []; } }, []);
  const fdList         = useMemo(() => { try { const s = localStorage.getItem("fd_v1");       return s ? JSON.parse(s) : []; } catch { return []; } }, []);

  const epfSettings = useMemo(() => ({
    wage:      parseFloat(localStorage.getItem("epf_wage")        || "0"),
    age:       parseInt(localStorage.getItem("epf_age")           || "30"),
    increment: parseFloat(localStorage.getItem("epf_increment")   || "3"),
    dividend:  parseFloat(localStorage.getItem("epf_dividend")    || "5.5"),
    startPer:  parseFloat(localStorage.getItem("epf_per_start")   || "0"),
    startSej:  parseFloat(localStorage.getItem("epf_sej_start")   || "0"),
    startFlek: parseFloat(localStorage.getItem("epf_flek_start")  || "0"),
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

  // Static cost-basis snapshots (today's values, unchanged across years)
  const stocksCost  = stockHoldings.reduce((s, h)  => s + h.shares * h.avgCost + (h.totalFees || 0), 0);
  const cryptoCost  = cryptoHoldings.reduce((s, h) => s + h.amount * h.buyPrice + (h.totalFees || 0), 0);
  const myStockCost = myStocks.reduce((s, h)       => s + h.shares * h.avgCost + (h.totalFees || 0), 0);
  const fdPrincipal = fdList.reduce((s, fd)         => s + (parseFloat(fd.principal) || 0), 0);
  const housingEquity = properties.reduce((s, p) => {
    const paid = (p.downpaymentRecords || []).reduce((a, r) => a + (r.amount || 0), 0);
    return s + paid;
  }, 0);

  const epfStart = epfSettings.startPer + epfSettings.startSej + epfSettings.startFlek;

  const chartData = useMemo(() => {
    const n = projectionData.length;
    return Array.from({ length: n }, (_, i) => {
      const cpf      = projectionData[i]?.total || 0;
      const epfMYR   = i === 0 ? epfStart : (epfProjection[i - 1]?.total ?? epfStart);
      const epf      = Math.round(epfMYR * myrToSgd);
      const housing  = Math.round(housingEquity * myrToSgd);
      const myStk    = Math.round(myStockCost * myrToSgd);
      const usAssets = Math.round((stocksCost + cryptoCost) * usdToSgd);
      const fds      = Math.round(fdPrincipal * myrToSgd);
      return {
        year: i,
        age: projectionData[i]?.age ?? i,
        cpf, epf, housing, myStk, usAssets, fds,
        total: cpf + epf + housing + myStk + usAssets + fds,
      };
    });
  }, [projectionData, epfProjection, epfStart, myrToSgd, usdToSgd, housingEquity, myStockCost, stocksCost, cryptoCost, fdPrincipal]);

  const today  = chartData[0] || {};
  const finale = chartData[chartData.length - 1] || {};

  const fmtSGD = v => "S$" + Math.round(v).toLocaleString();
  const inputStyle = { background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 10px", color: "var(--text)", fontSize: 13, width: "100%", maxWidth: 140 };
  const cardStyle  = { borderRadius: 12, padding: "14px 18px", background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)" };

  const SERIES = [
    { key: "cpf",      label: "CPF (SGD)",           color: "#6ee7b7", note: "projected" },
    { key: "epf",      label: "EPF (MYR→SGD)",        color: "#6366f1", note: epfSettings.wage ? "projected" : "snapshot" },
    { key: "housing",  label: "Housing Equity (MYR)", color: "#f472b6", note: "snapshot" },
    { key: "myStk",    label: "MY Stocks (MYR)",      color: "#38bdf8", note: "snapshot" },
    { key: "usAssets", label: "US Stocks+Crypto (USD)",color: "#fbbf24", note: "snapshot" },
    { key: "fds",      label: "Fixed Deposits (MYR)", color: "#34d399", note: "snapshot" },
  ].filter(s => (today[s.key] || 0) > 0 || s.key === "cpf");

  const gradId = k => `nwGrad_${k}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

      {/* FX rates */}
      <div style={{ ...cardStyle }}>
        <div style={{ fontSize: 12, color: "var(--label)", fontWeight: 600, marginBottom: 12 }}>FX Rates (to SGD)</div>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>1 USD =</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input type="number" min={0} step={0.01} value={usdToSgd} onChange={e => setUsdToSgd(parseFloat(e.target.value) || 0)} style={inputStyle} />
              <span style={{ fontSize: 13, color: "var(--muted)" }}>SGD</span>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>1 MYR =</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input type="number" min={0} step={0.001} value={myrToSgd} onChange={e => setMyrToSgd(parseFloat(e.target.value) || 0)} style={inputStyle} />
              <span style={{ fontSize: 13, color: "var(--muted)" }}>SGD</span>
            </div>
          </div>
          <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.6 }}>
            ≈ 1 SGD = {myrToSgd > 0 ? (1 / myrToSgd).toFixed(2) : "—"} MYR<br />
            ≈ 1 SGD = {usdToSgd > 0 ? (1 / usdToSgd).toFixed(4) : "—"} USD
          </div>
        </div>
      </div>

      {/* Today's snapshot */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
        {SERIES.map(({ key, label, color }) => (
          <div key={key} style={{ ...cardStyle, borderLeft: `3px solid ${color}` }}>
            <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color }}>{fmtSGD(today[key] || 0)}</div>
          </div>
        ))}
        <div style={{ ...cardStyle, borderLeft: "3px solid #fff" }}>
          <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 4 }}>Total Today</div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{fmtSGD(today.total || 0)}</div>
        </div>
      </div>

      {/* Final value */}
      <div style={{ ...cardStyle, background: "rgba(110,231,183,0.06)", border: "1px solid rgba(110,231,183,0.2)", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 11, color: "var(--muted)" }}>Projected Net Worth in {yearsToProject} years (Age {finale.age})</div>
          <div style={{ fontSize: 28, fontWeight: 800, fontFamily: "'DM Mono', monospace", color: "#6ee7b7", marginTop: 4 }}>{fmtSGD(finale.total || 0)}</div>
        </div>
        <div style={{ fontSize: 13, color: "var(--muted)" }}>
          {today.total > 0 && finale.total > today.total && (
            <span style={{ color: "#6ee7b7", fontWeight: 600 }}>+{fmtSGD(finale.total - today.total)}</span>
          )}
          {today.total > 0 && <span style={{ marginLeft: 6 }}>({today.total > 0 ? ((finale.total / today.total - 1) * 100).toFixed(0) : 0}% growth)</span>}
        </div>
      </div>

      {/* Stacked area chart */}
      <div style={cardStyle}>
        <div style={{ fontSize: 12, color: "var(--label)", fontWeight: 600, marginBottom: 16 }}>Net Worth Trajectory (SGD)</div>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <defs>
              {SERIES.map(({ key, color }) => (
                <linearGradient key={key} id={gradId(key)} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={color} stopOpacity={0.45} />
                  <stop offset="95%" stopColor={color} stopOpacity={0.05} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey="age"
              tick={{ fontSize: 11, fill: "var(--muted)" }}
              label={{ value: "Age", position: "insideBottomRight", offset: -5, fontSize: 11, fill: "var(--muted)" }}
            />
            <YAxis
              tickFormatter={v => v >= 1000000 ? "S$" + (v / 1000000).toFixed(1) + "M" : v >= 1000 ? "S$" + (v / 1000).toFixed(0) + "k" : "S$" + v}
              tick={{ fontSize: 10, fill: "var(--muted)" }}
            />
            <Tooltip
              formatter={(v, name) => [fmtSGD(v), name]}
              contentStyle={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
              labelFormatter={l => `Age ${l}`}
            />
            {SERIES.map(({ key, label, color }) => (
              <Area key={key} type="monotone" dataKey={key} name={label} stackId="1"
                stroke={color} fill={`url(#${gradId(key)})`} strokeWidth={1.5} dot={false} />
            ))}
          </AreaChart>
        </ResponsiveContainer>
        {/* Legend */}
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 12 }}>
          {SERIES.map(({ key, label, color, note }) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: "var(--muted)" }}>{label}</span>
              {note === "snapshot" && <span style={{ fontSize: 10, color: "var(--muted)", fontStyle: "italic" }}>(flat)</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Year-by-year breakdown table */}
      <div style={cardStyle}>
        <div style={{ fontSize: 12, color: "var(--label)", fontWeight: 600, marginBottom: 10 }}>Year-by-Year (SGD)</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ color: "var(--muted)", borderBottom: "1px solid var(--border)" }}>
                {["Yr", "Age", ...SERIES.map(s => s.label), "Total"].map(h => (
                  <th key={h} style={{ padding: "6px 8px", textAlign: "right", fontWeight: 500, whiteSpace: "nowrap", fontSize: 11 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {chartData.map((row, i) => (
                <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)" }}>
                  <td style={{ padding: "5px 8px", textAlign: "right", color: "var(--muted)" }}>{row.year}</td>
                  <td style={{ padding: "5px 8px", textAlign: "right", color: "var(--muted)" }}>{row.age}</td>
                  {SERIES.map(({ key, color }) => (
                    <td key={key} style={{ padding: "5px 8px", textAlign: "right", color, fontFamily: "'DM Mono', monospace" }}>
                      {fmtSGD(row[key] || 0)}
                    </td>
                  ))}
                  <td style={{ padding: "5px 8px", textAlign: "right", fontWeight: 700, fontFamily: "'DM Mono', monospace" }}>
                    {fmtSGD(row.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ padding: "12px 16px", borderRadius: 10, background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", fontSize: 11, color: "var(--muted)", lineHeight: 1.7 }}>
        <strong style={{ color: "var(--label)" }}>Note:</strong> CPF and EPF are projected year-by-year using their respective contribution and return settings. Housing equity, MY/US Stocks, Crypto, and Fixed Deposits are shown at their current cost basis (flat — no future appreciation assumed). FX rates are user-defined and not auto-fetched. For personal planning only — not financial advice.
      </div>
    </div>
  );
}

// ─── Summary Tab ──────────────────────────────────────────────────────

function SummaryTab({ cpfData, yearsToProject, projectionData }) {
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

  // MY Stocks (MYR)
  const myStocksCost = myStockHoldings.reduce((s, h) => s + h.shares * h.avgCost + (h.totalFees || 0), 0);

  // Investments (USD)
  const stocksCost = stockHoldings.reduce((s, h) => s + h.shares * h.avgCost + (h.totalFees || 0), 0);
  const cryptoCost = cryptoHoldings.reduce((s, h) => s + h.amount * h.buyPrice + (h.totalFees || 0), 0);
  const totalUSD = stocksCost + cryptoCost;

  // Goals
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

  // Current asset totals per currency
  const currentByCurrency = { SGD: cpfTotal, MYR: totalEquity + myStocksCost, USD: stocksCost + cryptoCost };
  const fmtByCurrency = { SGD, MYR: RM, USD };
  const labelByCurrency = {
    SGD: "CPF projected balance",
    MYR: "Property equity + MY Stocks",
    USD: "US Stocks + Crypto (cost basis)",
  };

  // For SGD goals: find the age at which CPF projection first hits the target
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
      {/* Multi-currency notice */}
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
        {/* MY Stocks mini-card */}
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

      {/* ── Retirement Goals ─────────────────────────────────────────── */}
      <div style={{ background: "var(--card-bg)", borderRadius: 16, padding: 24, border: "1px solid var(--border)", marginBottom: 16 }}>
        <SectionHeader title="🎯 Retirement Goals" sub="Track how close you are to each financial milestone" />

        {/* Add Goal Form */}
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

        {/* Goal Cards */}
        {goals.length === 0 ? (
          <div style={{ textAlign: "center", color: "var(--muted)", fontSize: 13, padding: "20px 0" }}>
            No goals yet. Add a milestone above to start tracking your progress.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {goals.map(g => {
              const current = currentByCurrency[g.currency] || 0;
              const pct = g.target > 0 ? Math.min(100, (current / g.target) * 100) : 0;
              const remaining = Math.max(0, g.target - current);
              const achieved = current >= g.target;
              const fmtFn = fmtByCurrency[g.currency] || (n => n.toLocaleString());
              const projAge = g.currency === "SGD" ? cpfAgeForTarget(g.target) : null;
              const barColor = achieved ? "#34d399" : pct > 60 ? "var(--accent)" : pct > 30 ? "#fbbf24" : "#f87171";

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

                  {/* CPF projection hint */}
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
  const [oaStart, setOaStart] = useState(() => { try { return parseFloat(localStorage.getItem("cpf_oa_start") || "0") || 0; } catch { return 0; } });
  const [saStart, setSaStart] = useState(() => { try { return parseFloat(localStorage.getItem("cpf_sa_start") || "0") || 0; } catch { return 0; } });
  const [maStart, setMaStart] = useState(() => { try { return parseFloat(localStorage.getItem("cpf_ma_start") || "0") || 0; } catch { return 0; } });
  const [activeTab, setActiveTab] = useState("summary");

  useEffect(() => { try { localStorage.setItem("cpf_oa_start", oaStart); } catch {} }, [oaStart]);
  useEffect(() => { try { localStorage.setItem("cpf_sa_start", saStart); } catch {} }, [saStart]);
  useEffect(() => { try { localStorage.setItem("cpf_ma_start", maStart); } catch {} }, [maStart]);

  const monthly = useMemo(() => computeMonthly(salary, age, prYear), [salary, age, prYear]);
  const projectionData = useMemo(() => projectYears({
    salary, age, prYear, annualIncrement, yearsToProject, oaReturn, saReturn, maReturn, oaStart, saStart, maStart
  }), [salary, age, prYear, annualIncrement, yearsToProject, oaReturn, saReturn, maReturn, oaStart, saStart, maStart]);

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
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
            <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>Data Backup</div>
            <BackupBar />
          </div>
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
          <div style={{ display: "flex", flexDirection: "column", gap: 16, flex: "1 1 280px" }}>
            <div style={{ background: "var(--card-bg)", borderRadius: 16, padding: 24, border: "1px solid var(--border)" }}>
              <div className="section-title">Projection Settings</div>
              <SliderInput label="Annual Salary Increment" value={annualIncrement} onChange={setAnnualIncrement} min={0} max={15} step={0.5} suffix="%" />
              <SliderInput label="Project Over" value={yearsToProject} onChange={setYearsToProject} min={1} max={40} step={1} suffix=" years" />
              <SliderInput label="OA Return Rate" value={oaReturn} onChange={setOaReturn} min={0} max={8} step={0.5} suffix="%" />
              <SliderInput label="SA Return Rate" value={saReturn} onChange={setSaReturn} min={0} max={8} step={0.5} suffix="%" />
              <SliderInput label="MA Return Rate" value={maReturn} onChange={setMaReturn} min={0} max={8} step={0.5} suffix="%" />
            </div>
            <div style={{ background: "var(--card-bg)", borderRadius: 16, padding: 24, border: "1px solid var(--border)" }}>
              <div className="section-title">Current CPF Balances (optional)</div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 14, lineHeight: 1.6 }}>
                Enter your actual balances from the CPF portal. The projection will start from these figures instead of $0.
              </div>
              {[
                { label: "OA Balance (S$)", value: oaStart, set: setOaStart, color: "#4ade80" },
                { label: "SA Balance (S$)", value: saStart, set: setSaStart, color: "#818cf8" },
                { label: "MA Balance (S$)", value: maStart, set: setMaStart, color: "#f472b6" },
              ].map(({ label, value, set, color }) => (
                <div key={label} style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 13, color: "var(--label)", fontWeight: 500, display: "block", marginBottom: 6 }}>{label}</label>
                  <input
                    type="number"
                    min="0"
                    value={value || ""}
                    placeholder="0"
                    onChange={e => set(parseFloat(e.target.value) || 0)}
                    style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${color}30`, background: `${color}08`, color: "var(--text)", fontSize: 14, fontFamily: "'DM Mono', monospace", outline: "none" }}
                  />
                </div>
              ))}
              {(oaStart > 0 || saStart > 0 || maStart > 0) && (
                <div style={{ fontSize: 12, color: "var(--accent)", marginTop: 4 }}>
                  Starting balance: {fmtD(oaStart + saStart + maStart)}
                </div>
              )}
            </div>
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
          <button className={`tab-btn ${activeTab === "mystocks" ? "active" : ""}`} onClick={() => setActiveTab("mystocks")}>
            🇲🇾 MY Stocks
          </button>
          <button className={`tab-btn ${activeTab === "stocks" ? "active" : ""}`} onClick={() => setActiveTab("stocks")}>
            📊 US Stocks
          </button>
          <button className={`tab-btn ${activeTab === "crypto" ? "active" : ""}`} onClick={() => setActiveTab("crypto")}>
            🪙 Crypto
          </button>
          <button className={`tab-btn ${activeTab === "epf" ? "active" : ""}`} onClick={() => setActiveTab("epf")}>
            🇲🇾 EPF
          </button>
          <button className={`tab-btn ${activeTab === "fd" ? "active" : ""}`} onClick={() => setActiveTab("fd")}>
            🏦 Fixed Deposits
          </button>
          <button className={`tab-btn ${activeTab === "savings" ? "active" : ""}`} onClick={() => setActiveTab("savings")}>
            💵 Savings Rate
          </button>
          <button className={`tab-btn ${activeTab === "fire" ? "active" : ""}`} onClick={() => setActiveTab("fire")}>
            🔥 FIRE
          </button>
          <button className={`tab-btn ${activeTab === "networth" ? "active" : ""}`} onClick={() => setActiveTab("networth")}>
            💰 Net Worth
          </button>
        </div>

        {/* Summary Tab */}
        {activeTab === "summary" && (
          <div style={{ marginBottom: 28 }}>
            <SummaryTab cpfData={finalData} yearsToProject={yearsToProject} projectionData={projectionData} />
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

        {/* MY Stocks Tab */}
        {activeTab === "mystocks" && (
          <div style={{ marginBottom: 28 }}>
            <MYStocksTab />
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

        {/* EPF Tab */}
        {activeTab === "epf" && (
          <div style={{ marginBottom: 28 }}>
            <EPFTab />
          </div>
        )}

        {/* Fixed Deposits Tab */}
        {activeTab === "fd" && (
          <div style={{ marginBottom: 28 }}>
            <FixedDepositsTab />
          </div>
        )}

        {/* Savings Rate Tab */}
        {activeTab === "savings" && (
          <div style={{ marginBottom: 28 }}>
            <SavingsTab projectionData={projectionData} yearsToProject={yearsToProject} cpfMonthly={monthly} salary={salary} />
          </div>
        )}

        {/* FIRE Tab */}
        {activeTab === "fire" && (
          <div style={{ marginBottom: 28 }}>
            <FireTab projectionData={projectionData} yearsToProject={yearsToProject} />
          </div>
        )}

        {/* Net Worth Tab */}
        {activeTab === "networth" && (
          <div style={{ marginBottom: 28 }}>
            <NetWorthTab projectionData={projectionData} yearsToProject={yearsToProject} />
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
          annual salary ceiling ($102,000), and rounding rules. Interest uses simplified annual compounding and includes
          the extra 1% on the first $60K of combined balances (OA capped at $20K), and for age 55+ the extra 2% on
          first $30K and extra 1% on next $30K. Extra interest is credited to SA.
          Always refer to <span style={{ color: "var(--accent)" }}>cpf.gov.sg</span> for official calculations.
        </div>
      </div>
    </div>
  );
}
