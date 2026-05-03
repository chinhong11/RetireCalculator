import { useState, useMemo, useEffect, useCallback } from "react";

import { OW_CEILING, CPF_FRS_2026, CPF_BHS_2026, computeMonthly, projectYears, estimateCpfLifePayout, fmt, fmtD } from "./lib/cpf.js";
import { exportCpfPdf } from "./lib/exportPdf.js";

import { SliderInput }       from "./components/shared/SliderInput.jsx";
import { BackupBar }         from "./components/shared/BackupBar.jsx";
import { ErrorBoundary }     from "./components/shared/ErrorBoundary.jsx";
import { MonthlyBreakdown }  from "./components/shared/MonthlyBreakdown.jsx";
import { CpfSummaryCards }   from "./components/shared/CpfSummaryCards.jsx";
import { Hint }              from "./components/shared/Hint.jsx";

import ProjectionTab        from "./components/tabs/ProjectionTab.jsx";
import ProjectionTableTab   from "./components/tabs/ProjectionTableTab.jsx";
import HousingLoanTab       from "./components/tabs/HousingLoanTab.jsx";
import StocksTab            from "./components/tabs/StocksTab.jsx";
import CryptoTab            from "./components/tabs/CryptoTab.jsx";
import MYStocksTab          from "./components/tabs/MYStocksTab.jsx";
import EPFTab               from "./components/tabs/EPFTab.jsx";
import FixedDepositsTab     from "./components/tabs/FixedDepositsTab.jsx";
import SavingsTab           from "./components/tabs/SavingsTab.jsx";
import FireTab              from "./components/tabs/FireTab.jsx";
import NetWorthTab          from "./components/tabs/NetWorthTab.jsx";
import SummaryTab           from "./components/tabs/SummaryTab.jsx";

// ─── Theme definitions ────────────────────────────────────────────────────────
const THEMES = {
  dark: {
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
    "--input-bg": "rgba(255,255,255,0.04)",
    "--hover-bg": "rgba(255,255,255,0.04)",
    "--option-bg": "#0a0e17",
    "--option-color": "#e8eaf0",
    "--accent-subtle": "rgba(110,231,183,0.1)",
    "--accent-border-c": "rgba(110,231,183,0.2)",
    "--accent-chip": "rgba(110,231,183,0.12)",
    "--accent-shadow": "rgba(110,231,183,0.15)",
    "--row-alt": "rgba(255,255,255,0.01)",
    "--header-tint": "rgba(110,231,183,0.06)",
    "--grid-line": "rgba(255,255,255,0.04)",
  },
  light: {
    "--bg": "#f0f4f8",
    "--card-bg": "#ffffff",
    "--border": "rgba(0,0,0,0.09)",
    "--text": "#111827",
    "--label": "#374151",
    "--muted": "#6b7280",
    "--accent": "#059669",
    "--accent2": "#4f46e5",
    "--track": "rgba(0,0,0,0.1)",
    "--tooltip-bg": "rgba(255,255,255,0.97)",
    "--input-bg": "rgba(0,0,0,0.03)",
    "--hover-bg": "rgba(0,0,0,0.04)",
    "--option-bg": "#ffffff",
    "--option-color": "#111827",
    "--accent-subtle": "rgba(5,150,105,0.08)",
    "--accent-border-c": "rgba(5,150,105,0.2)",
    "--accent-chip": "rgba(5,150,105,0.1)",
    "--accent-shadow": "rgba(5,150,105,0.15)",
    "--row-alt": "rgba(0,0,0,0.015)",
    "--header-tint": "rgba(5,150,105,0.04)",
    "--grid-line": "rgba(0,0,0,0.06)",
  },
};

const TABS = [
  ["summary",    "🌐 Summary"],
  ["projection", "📈 Growth Chart"],
  ["table",      "📋 Year-by-Year"],
  ["housing",    "🏠 Housing Loan"],
  ["mystocks",   "🇲🇾 MY Stocks"],
  ["stocks",     "📊 US Stocks"],
  ["crypto",     "🪙 Crypto"],
  ["epf",        "🇲🇾 EPF"],
  ["fd",         "🏦 Fixed Deposits"],
  ["savings",    "💵 Savings Rate"],
  ["fire",       "🔥 FIRE"],
  ["networth",   "💰 Net Worth"],
];

const CPF_TABS   = TABS.slice(0, 3);
const ASSET_TABS = TABS.slice(3);

const GLOSSARY = {
  OA:         "Ordinary Account — for housing, education, investment.",
  SA:         "Special Account — retirement savings, earns higher interest.",
  RA:         "Retirement Account — formed at 55 from OA + SA, funds CPF LIFE.",
  MA:         "MediSave Account — for approved medical expenses.",
  FRS:        "Full Retirement Sum — CPF Board's annual RA target amount.",
  BHS:        "Basic Healthcare Sum — MediSave cap; excess overflows to SA/RA.",
  "CPFIS-SA": "CPF Investment Scheme (SA) — shields SA from RA transfer at 55.",
};

// ─── Local components ─────────────────────────────────────────────────────────
function StepLabel({ n, title, optional }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
      <span style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 20, height: 20, borderRadius: "50%",
        background: "var(--accent-chip)", border: "1px solid var(--accent-border-c)",
        fontSize: 11, fontWeight: 700, color: "var(--accent)", flexShrink: 0,
      }}>{n}</span>
      <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--muted)", fontWeight: 600 }}>
        {title}
        {optional && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optional)</span>}
      </span>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
/** @param {string} key @param {number} fallback @returns {number} */
function lsFloat(key, fallback) {
  try { return parseFloat(localStorage.getItem(key) || String(fallback)) || fallback; } catch { return fallback; }
}

export default function CPFCalculator() {
  // ─── Theme ──────────────────────────────────────────────────────────────
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "dark");
  useEffect(() => { localStorage.setItem("theme", theme); }, [theme]);
  const tv = THEMES[theme];

  // ─── Core inputs ────────────────────────────────────────────────────────
  const [salary, setSalary]                     = useState(5000);
  const [age, setAge]                           = useState(30);
  const [prYear, setPrYear]                     = useState(1);
  const [annualIncrement, setAnnualIncrement]   = useState(3);
  const [yearsToProject, setYearsToProject]     = useState(20);
  const [oaReturn, setOaReturn]                 = useState(2.5);
  const [saReturn, setSaReturn]                 = useState(4.0);
  const [maReturn, setMaReturn]                 = useState(4.0);
  const [oaStart, setOaStart]   = useState(() => lsFloat("cpf_oa_start",       0));
  const [saStart, setSaStart]   = useState(() => lsFloat("cpf_sa_start",       0));
  const [maStart, setMaStart]   = useState(() => lsFloat("cpf_ma_start",       0));
  const [ceilingGrowth, setCeilingGrowth] = useState(() => lsFloat("cpf_ceiling_growth", 3.5));
  const [saShield, setSaShield]     = useState(() => lsFloat("cpf_sa_shield", 0));
  const [saShieldOn, setSaShieldOn] = useState(() => lsFloat("cpf_sa_shield", 0) > 0);
  const [activeTab, setActiveTab]   = useState(() => localStorage.getItem("active_tab") || "summary");
  const [pdfBusy, setPdfBusy]       = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // ─── Persistence ────────────────────────────────────────────────────────
  useEffect(() => { try { localStorage.setItem("active_tab",        activeTab);                  } catch {} }, [activeTab]);
  useEffect(() => { try { localStorage.setItem("cpf_oa_start",       oaStart);                   } catch {} }, [oaStart]);
  useEffect(() => { try { localStorage.setItem("cpf_sa_start",       saStart);                   } catch {} }, [saStart]);
  useEffect(() => { try { localStorage.setItem("cpf_ma_start",       maStart);                   } catch {} }, [maStart]);
  useEffect(() => { try { localStorage.setItem("cpf_ceiling_growth", ceilingGrowth);             } catch {} }, [ceilingGrowth]);
  useEffect(() => { try { localStorage.setItem("cpf_sa_shield", saShieldOn ? saShield : 0);      } catch {} }, [saShield, saShieldOn]);

  // ─── Derived data ────────────────────────────────────────────────────────
  const effectiveSaShield = age < 55 && saShieldOn ? saShield : 0;

  const monthly = useMemo(
    () => computeMonthly(salary, age, prYear),
    [salary, age, prYear],
  );

  const projectionData = useMemo(
    () => projectYears({
      salary, age, prYear, annualIncrement, yearsToProject,
      oaReturn, saReturn, maReturn, oaStart, saStart, maStart,
      frsGrowthRate: ceilingGrowth, bhsGrowthRate: ceilingGrowth,
      saShield: effectiveSaShield,
    }),
    [salary, age, prYear, annualIncrement, yearsToProject,
     oaReturn, saReturn, maReturn, oaStart, saStart, maStart,
     ceilingGrowth, effectiveSaShield],
  );

  const finalData     = projectionData[projectionData.length - 1];
  const cpfLifePayout = useMemo(
    () => estimateCpfLifePayout(projectionData, saReturn),
    [projectionData, saReturn],
  );

  const advancedSummary = `${yearsToProject} yrs · OA ${oaReturn}% · SA ${saReturn}%`;

  const handleExportPdf = useCallback(async () => {
    if (pdfBusy) return;
    setPdfBusy(true);
    try {
      await exportCpfPdf({
        projectionData, salary, age, prYear, annualIncrement, yearsToProject,
        oaReturn, saReturn, maReturn, ceilingGrowth,
        saShield: effectiveSaShield, cpfLifePayout,
      });
    } finally {
      setPdfBusy(false);
    }
  }, [projectionData, salary, age, prYear, annualIncrement, yearsToProject,
      oaReturn, saReturn, maReturn, ceilingGrowth, effectiveSaShield, cpfLifePayout, pdfBusy]);

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div style={{
      ...tv,
      fontFamily: "'Instrument Sans', 'SF Pro Display', system-ui, sans-serif",
      background: "var(--bg)",
      color: "var(--text)",
      minHeight: "100vh",
      padding: "0 0 40px 0",
      transition: "background 0.2s, color 0.2s",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        input[type=range] { -webkit-appearance: none; height: 6px; border-radius: 4px; background: var(--track); outline: none; }
        input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 18px; height: 18px; border-radius: 50%; background: var(--accent); cursor: pointer; border: 2px solid var(--bg); box-shadow: 0 0 10px var(--accent-shadow); }
        input[type=range]::-moz-range-thumb { width: 18px; height: 18px; border-radius: 50%; background: var(--accent); cursor: pointer; border: 2px solid var(--bg); }
        .tab-btn { padding: 10px 20px; border-radius: 10px; border: 1px solid transparent; background: transparent; color: var(--muted); font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; font-family: inherit; }
        .tab-btn:hover { color: var(--text); background: var(--hover-bg); }
        .tab-btn.active { background: var(--accent-subtle); color: var(--accent); border-color: var(--accent-border-c); }
        .input-field { width: 100%; padding: 10px 14px; border-radius: 10px; border: 1px solid var(--border); background: var(--input-bg); color: var(--text); font-size: 15px; font-family: 'DM Mono', monospace; font-weight: 500; outline: none; transition: border 0.2s; }
        .input-field:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-shadow); }
        .pr-chip { display: inline-flex; align-items: center; padding: 6px 14px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; border: 1px solid var(--border); background: transparent; color: var(--muted); font-family: inherit; }
        .pr-chip.selected { background: var(--accent-chip); color: var(--accent); border-color: var(--accent-border-c); }
        .section-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--muted); font-weight: 600; margin-bottom: 16px; }
        .hl-in { width: 100%; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border); background: var(--input-bg); color: var(--text); font-size: 13px; font-family: inherit; outline: none; transition: border 0.2s; -webkit-appearance: none; appearance: none; }
        .hl-in:focus { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-shadow); }
        .hl-in option { background: var(--option-bg); color: var(--option-color); }
        .sidebar-scroll::-webkit-scrollbar { width: 4px; }
        .sidebar-scroll::-webkit-scrollbar-track { background: transparent; }
        .sidebar-scroll::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
        .adv-toggle { display: flex; align-items: center; justify-content: space-between; width: 100%; background: transparent; border: none; cursor: pointer; padding: 0; font-family: inherit; }
        .adv-toggle:focus-visible { outline: 2px solid var(--accent); border-radius: 4px; }
        @media (max-width: 800px) {
          .layout-grid { grid-template-columns: 1fr !important; }
          .sidebar-sticky { position: static !important; }
          .sidebar-scroll { max-height: none !important; overflow-y: visible !important; }
        }
        @media (max-width: 480px) {
          .tab-btn { padding: 7px 12px; font-size: 12px; }
          .mobile-h1 { font-size: 22px !important; }
          .mobile-pad { padding: 20px 16px 16px !important; }
          .mobile-inner { padding: 0 12px !important; }
        }
      `}</style>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="mobile-pad" style={{
        padding: "32px 24px 24px",
        background: `linear-gradient(180deg, ${tv["--header-tint"]} 0%, transparent 100%)`,
        borderBottom: "1px solid var(--border)",
        marginBottom: 24,
      }}>
        <div style={{ maxWidth: 1140, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent)" }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                Singapore 2026
              </span>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                onClick={() => setTheme(t => t === "dark" ? "light" : "dark")}
                title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                style={{ background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 10px", cursor: "pointer", fontSize: 15, lineHeight: 1, color: "var(--text)" }}
              >{theme === "dark" ? "☀️" : "🌙"}</button>
              <button
                onClick={handleExportPdf} disabled={pdfBusy}
                title="Export projection as PDF"
                style={{ background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 12px", cursor: pdfBusy ? "default" : "pointer", fontSize: 12, fontWeight: 600, color: pdfBusy ? "var(--muted)" : "var(--accent)", opacity: pdfBusy ? 0.6 : 1, display: "flex", alignItems: "center", gap: 5 }}
              >{pdfBusy ? "⏳ Generating…" : "⬇ PDF"}</button>
            </div>
          </div>
          <h1 className="mobile-h1" style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.2 }}>
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

      {/* ── Two-column layout ───────────────────────────────────────────── */}
      <div className="layout-grid mobile-inner" style={{
        maxWidth: 1140, margin: "0 auto", padding: "0 20px",
        display: "grid", gridTemplateColumns: "340px 1fr",
        gap: 28, alignItems: "start",
      }}>

        {/* ════ LEFT SIDEBAR (sticky) ════════════════════════════════════════ */}
        <div className="sidebar-sticky" style={{ position: "sticky", top: 24 }}>
          <div className="sidebar-scroll" style={{ maxHeight: "calc(100vh - 48px)", overflowY: "auto", display: "flex", flexDirection: "column", gap: 16, paddingBottom: 8 }}>

            {/* ① Profile */}
            <div style={{ background: "var(--card-bg)", borderRadius: 16, padding: 24, border: "1px solid var(--border)" }}>
              <StepLabel n={1} title="Profile" />
              <div style={{ marginBottom: 18 }}>
                <label style={{ fontSize: 13, color: "var(--label)", fontWeight: 500, display: "block", marginBottom: 6 }}>Monthly Salary (SGD)</label>
                <input
                  type="number" className="input-field" value={salary} min={0} step={100}
                  onChange={e => setSalary(Math.max(0, parseInt(e.target.value) || 0))}
                />
                {salary > OW_CEILING && (
                  <div style={{ fontSize: 11, color: "#fbbf24", marginTop: 6 }}>
                    ⚠ Capped at ${fmt(OW_CEILING)} OW ceiling for CPF
                  </div>
                )}
              </div>
              <SliderInput label="Age" value={age} onChange={setAge} min={21} max={70} step={1} suffix=" yrs" />
              <div style={{ marginBottom: 18 }}>
                <label style={{ fontSize: 13, color: "var(--label)", fontWeight: 500, display: "block", marginBottom: 8 }}>PR Status Year</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {[1, 2, 3].map(y => (
                    <button key={y} className={`pr-chip ${prYear === y ? "selected" : ""}`} onClick={() => setPrYear(y)}>
                      {y === 3 ? "3rd yr+" : y === 1 ? "1st yr" : "2nd yr"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* ② Assumptions (collapsible) */}
            <div style={{ background: "var(--card-bg)", borderRadius: 16, padding: 24, border: "1px solid var(--border)" }}>
              <StepLabel n={2} title="Assumptions" />
              <button
                className="adv-toggle"
                onClick={() => setAdvancedOpen(o => !o)}
                aria-expanded={advancedOpen}
              >
                <span style={{ fontSize: 12, color: "var(--muted)", fontFamily: "'DM Mono', monospace" }}>
                  {advancedSummary}
                </span>
                <span style={{
                  fontSize: 10, color: "var(--accent)", fontWeight: 600,
                  border: "1px solid var(--accent-border-c)", borderRadius: 6,
                  padding: "2px 8px", marginLeft: 8, whiteSpace: "nowrap",
                }}>
                  {advancedOpen ? "▲ Less" : "▼ More"}
                </span>
              </button>
              <div style={{
                overflow: "hidden",
                maxHeight: advancedOpen ? "600px" : "0px",
                transition: "max-height 0.3s ease",
                marginTop: advancedOpen ? 16 : 0,
              }}>
                <SliderInput label="Annual Salary Increment" value={annualIncrement} onChange={setAnnualIncrement} min={0} max={15} step={0.5} suffix="%" />
                <SliderInput label="Project Over"            value={yearsToProject}  onChange={setYearsToProject}  min={1} max={40} step={1}   suffix=" years" />
                <SliderInput label={<>OA Return Rate <Hint text={GLOSSARY.OA} /></>}          value={oaReturn}      onChange={setOaReturn}      min={0} max={8} step={0.5} suffix="%" />
                <SliderInput label={<>SA / RA Return Rate <Hint text={GLOSSARY.SA} /></>}     value={saReturn}      onChange={setSaReturn}      min={0} max={8} step={0.5} suffix="%" />
                <SliderInput label="MA Return Rate"          value={maReturn}        onChange={setMaReturn}        min={0} max={8}  step={0.5} suffix="%" />
                <SliderInput label={<>FRS / BHS Growth <Hint text={GLOSSARY.FRS} /><Hint text={GLOSSARY.BHS} /></>} value={ceilingGrowth} onChange={setCeilingGrowth} min={0} max={6} step={0.5} suffix="%" />
              </div>
            </div>

            {/* ③ Starting Balances (optional) */}
            <div style={{ background: "var(--card-bg)", borderRadius: 16, padding: 24, border: "1px solid var(--border)" }}>
              <StepLabel n={3} title="Starting Balances" optional />
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 14, lineHeight: 1.6 }}>
                Enter your actual balances from the CPF portal. The projection will start from these figures instead of $0.
              </div>
              {[
                { key: "OA", label: "OA Balance (S$)",                                  value: oaStart, set: setOaStart, color: "#4ade80" },
                { key: age >= 55 ? "RA" : "SA", label: age >= 55 ? "RA Balance (S$)" : "SA Balance (S$)", value: saStart, set: setSaStart, color: age >= 55 ? "#a78bfa" : "#818cf8" },
                { key: "MA", label: "MA Balance (S$)",                                  value: maStart, set: setMaStart, color: "#f472b6" },
              ].map(({ key, label, value, set, color }) => (
                <div key={label} style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 13, color: "var(--label)", fontWeight: 500, display: "flex", alignItems: "center", marginBottom: 6 }}>
                    {label} <Hint text={GLOSSARY[key]} />
                  </label>
                  <input
                    type="number" min="0" value={value || ""} placeholder="0"
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

              {/* SA Shielding */}
              {age < 55 && (
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: saShieldOn ? 10 : 0 }}>
                    <input type="checkbox" checked={saShieldOn} onChange={e => setSaShieldOn(e.target.checked)}
                      style={{ width: 15, height: 15, accentColor: "var(--accent)", cursor: "pointer" }} />
                    <span style={{ fontSize: 13, color: "var(--label)", fontWeight: 600, display: "flex", alignItems: "center" }}>
                      SA Shielding (CPFIS-SA) <Hint text={GLOSSARY["CPFIS-SA"]} />
                    </span>
                  </label>
                  {saShieldOn && (
                    <>
                      <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 8, lineHeight: 1.6 }}>
                        Invest this amount of SA into CPFIS before age 55. Only uninvested SA cash forms RA — the shield stays in CPFIS (growing at SA rate) and returns to your OA after 55.
                      </div>
                      <input
                        type="number" min="0" max={saStart} placeholder="e.g. 40000" value={saShield || ""}
                        onChange={e => setSaShield(Math.max(0, parseFloat(e.target.value) || 0))}
                        style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid rgba(129,140,248,0.3)", background: "rgba(129,140,248,0.06)", color: "var(--text)", fontSize: 14, fontFamily: "'DM Mono', monospace", outline: "none" }}
                      />
                      {saShield > 0 && saStart > 0 && saShield > saStart && (
                        <div style={{ fontSize: 11, color: "#fbbf24", marginTop: 4 }}>⚠ Shield exceeds SA balance — capped at {fmtD(saStart)}</div>
                      )}
                      {saShield > 0 && (() => {
                        const raRow = projectionData.find(d => d.raFormed);
                        return raRow ? (
                          <div style={{ fontSize: 11, color: "#818cf8", marginTop: 6, lineHeight: 1.6 }}>
                            At age 55: RA = {fmtD(raRow.ra)} · OA = {fmtD(raRow.oa)} (includes CPFIS proceeds)
                          </div>
                        ) : null;
                      })()}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Monthly Breakdown */}
            <MonthlyBreakdown monthly={monthly} prYear={prYear} age={age} />

          </div>
        </div>

        {/* ════ RIGHT MAIN ════════════════════════════════════════════════════ */}
        <div style={{ minWidth: 0 }}>

          {/* ── Live result strip ─────────────────────────────────────────── */}
          <div style={{
            display: "flex", gap: 12, marginBottom: 16,
            padding: "12px 18px",
            background: "var(--card-bg)",
            border: "1px solid var(--border)",
            borderRadius: 14,
            flexWrap: "wrap",
            position: "sticky", top: 0, zIndex: 10,
          }}>
            {[
              { label: `Total CPF · ${yearsToProject} yr`, value: fmtD(finalData.total),     color: "var(--accent)"  },
              { label: "Monthly Take-Home",                 value: fmtD(monthly.takeHome),     color: "var(--text)"    },
              { label: "Total CPF Contrib/mo",              value: fmtD(monthly.totalContrib), color: "var(--accent2)" },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ flex: "1 1 160px", minWidth: 0 }}>
                <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, marginBottom: 3 }}>
                  {label}
                </div>
                <div style={{ fontSize: 18, fontWeight: 800, color, fontFamily: "'DM Mono', monospace", lineHeight: 1.2 }}>
                  {value}
                </div>
              </div>
            ))}
          </div>

          {/* ── Tab bar ───────────────────────────────────────────────────── */}
          <div
            role="tablist"
            aria-label="Calculator sections"
            style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}
            onKeyDown={(e) => {
              const ids = TABS.map(([id]) => id);
              const cur = ids.indexOf(activeTab);
              if (e.key === "ArrowRight") { e.preventDefault(); setActiveTab(ids[(cur + 1) % ids.length]); }
              if (e.key === "ArrowLeft")  { e.preventDefault(); setActiveTab(ids[(cur - 1 + ids.length) % ids.length]); }
              if (e.key === "Home")       { e.preventDefault(); setActiveTab(ids[0]); }
              if (e.key === "End")        { e.preventDefault(); setActiveTab(ids[ids.length - 1]); }
            }}
          >
            {CPF_TABS.map(([id, label]) => (
              <button
                key={id}
                role="tab"
                aria-selected={activeTab === id}
                aria-controls={`tabpanel-${id}`}
                id={`tab-${id}`}
                tabIndex={activeTab === id ? 0 : -1}
                className={`tab-btn ${activeTab === id ? "active" : ""}`}
                onClick={() => setActiveTab(id)}
              >{label}</button>
            ))}

            {/* Full-width break + section label before asset tabs */}
            <div aria-hidden="true" style={{ flexBasis: "100%", height: 4 }} />
            <div aria-hidden="true" style={{
              flexBasis: "100%", display: "flex", alignItems: "center", gap: 8, marginBottom: 2,
            }}>
              <div style={{ height: 1, flex: 1, background: "var(--border)" }} />
              <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--muted)", whiteSpace: "nowrap" }}>
                Assets &amp; Planning
              </span>
              <div style={{ height: 1, flex: 1, background: "var(--border)" }} />
            </div>

            {ASSET_TABS.map(([id, label]) => (
              <button
                key={id}
                role="tab"
                aria-selected={activeTab === id}
                aria-controls={`tabpanel-${id}`}
                id={`tab-${id}`}
                tabIndex={activeTab === id ? 0 : -1}
                className={`tab-btn ${activeTab === id ? "active" : ""}`}
                onClick={() => setActiveTab(id)}
              >{label}</button>
            ))}
          </div>

          {/* ── Tab content ───────────────────────────────────────────────── */}
          {activeTab === "summary" && (
            <div role="tabpanel" id="tabpanel-summary" aria-labelledby="tab-summary" style={{ marginBottom: 28 }}>
              <ErrorBoundary key="summary">
                <SummaryTab cpfData={finalData} yearsToProject={yearsToProject} projectionData={projectionData} />
              </ErrorBoundary>
            </div>
          )}

          {activeTab === "projection" && (
            <div role="tabpanel" id="tabpanel-projection" aria-labelledby="tab-projection">
              <ErrorBoundary key="projection">
                <ProjectionTab
                  projectionData={projectionData} finalData={finalData}
                  yearsToProject={yearsToProject} ceilingGrowth={ceilingGrowth}
                  saReturn={saReturn} cpfLifePayout={cpfLifePayout}
                  gridLineColor={tv["--grid-line"]}
                />
              </ErrorBoundary>
            </div>
          )}

          {activeTab === "table" && (
            <div role="tabpanel" id="tabpanel-table" aria-labelledby="tab-table">
              <ErrorBoundary key="table">
                <ProjectionTableTab
                  projectionData={projectionData}
                  effectiveSaShield={effectiveSaShield}
                  rowAltColor={tv["--row-alt"]}
                />
              </ErrorBoundary>
            </div>
          )}

          {activeTab === "housing"  && <div role="tabpanel" id="tabpanel-housing"  aria-labelledby="tab-housing"  style={{ marginBottom: 28 }}><ErrorBoundary key="housing"><HousingLoanTab /></ErrorBoundary></div>}
          {activeTab === "mystocks" && <div role="tabpanel" id="tabpanel-mystocks" aria-labelledby="tab-mystocks" style={{ marginBottom: 28 }}><ErrorBoundary key="mystocks"><MYStocksTab /></ErrorBoundary></div>}
          {activeTab === "stocks"   && <div role="tabpanel" id="tabpanel-stocks"   aria-labelledby="tab-stocks"   style={{ marginBottom: 28 }}><ErrorBoundary key="stocks"><StocksTab /></ErrorBoundary></div>}
          {activeTab === "crypto"   && <div role="tabpanel" id="tabpanel-crypto"   aria-labelledby="tab-crypto"   style={{ marginBottom: 28 }}><ErrorBoundary key="crypto"><CryptoTab /></ErrorBoundary></div>}
          {activeTab === "epf"      && <div role="tabpanel" id="tabpanel-epf"      aria-labelledby="tab-epf"      style={{ marginBottom: 28 }}><ErrorBoundary key="epf"><EPFTab /></ErrorBoundary></div>}
          {activeTab === "fd"       && <div role="tabpanel" id="tabpanel-fd"       aria-labelledby="tab-fd"       style={{ marginBottom: 28 }}><ErrorBoundary key="fd"><FixedDepositsTab /></ErrorBoundary></div>}
          {activeTab === "savings"  && <div role="tabpanel" id="tabpanel-savings"  aria-labelledby="tab-savings"  style={{ marginBottom: 28 }}><ErrorBoundary key="savings"><SavingsTab projectionData={projectionData} yearsToProject={yearsToProject} cpfMonthly={monthly} salary={salary} /></ErrorBoundary></div>}
          {activeTab === "fire"     && <div role="tabpanel" id="tabpanel-fire"     aria-labelledby="tab-fire"     style={{ marginBottom: 28 }}><ErrorBoundary key="fire"><FireTab projectionData={projectionData} yearsToProject={yearsToProject} /></ErrorBoundary></div>}
          {activeTab === "networth" && <div role="tabpanel" id="tabpanel-networth" aria-labelledby="tab-networth" style={{ marginBottom: 28 }}><ErrorBoundary key="networth"><NetWorthTab projectionData={projectionData} yearsToProject={yearsToProject} /></ErrorBoundary></div>}

          {/* ── Summary cards ─────────────────────────────────────────────── */}
          <CpfSummaryCards
            finalData={finalData} yearsToProject={yearsToProject}
            oaReturn={oaReturn} saReturn={saReturn} maReturn={maReturn}
            cpfLifePayout={cpfLifePayout}
          />

          {/* ── Footer ────────────────────────────────────────────────────── */}
          <div style={{ padding: "16px 20px", borderRadius: 12, background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", fontSize: 11, color: "var(--muted)", lineHeight: 1.7 }}>
            <strong style={{ color: "var(--label)" }}>Disclaimer:</strong> This calculator is for estimation purposes only.
            Rates are based on CPF Board's official tables effective 1 Jan 2026. OW ceiling $8,000/month.
            MA is capped at the Basic Healthcare Sum (BHS, {fmtD(CPF_BHS_2026)} in 2026); excess overflows to SA/RA.
            At 55, SA + OA top-up are transferred to RA up to the Full Retirement Sum (FRS, {fmtD(CPF_FRS_2026)} in 2026).
            Both ceilings are projected forward using the FRS/BHS Growth Rate slider.
            CPF LIFE payout is a rough estimate for the Standard Plan at ~6.3%/yr of RA at 65.
            Always verify at <span style={{ color: "var(--accent)" }}>cpf.gov.sg</span>.
          </div>
        </div>

      </div>
    </div>
  );
}
