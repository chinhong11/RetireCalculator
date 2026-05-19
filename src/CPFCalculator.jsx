import { useState, useMemo, useEffect, useCallback } from "react";

import { OW_CEILING, CPF_FRS_2026, CPF_BHS_2026, computeMonthly, projectYears, estimateCpfLifePayout, fmt, fmtD } from "./lib/cpf.js";
import { exportCpfPdf } from "./lib/exportPdf.js";
import { useCloudSync } from "./lib/useCloudSync.js";

import { SliderInput }       from "./components/shared/SliderInput.jsx";
import { BackupBar }         from "./components/shared/BackupBar.jsx";
import { ErrorBoundary }     from "./components/shared/ErrorBoundary.jsx";
import { MonthlyBreakdown }  from "./components/shared/MonthlyBreakdown.jsx";
import { CpfSummaryCards }   from "./components/shared/CpfSummaryCards.jsx";
import { Hint }              from "./components/shared/Hint.jsx";
import { AuthModal }         from "./components/shared/AuthModal.jsx";

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
    "--bg": "#080c14",
    "--card-bg": "rgba(255,255,255,0.035)",
    "--card-bg-hover": "rgba(255,255,255,0.055)",
    "--border": "rgba(255,255,255,0.09)",
    "--text": "#e8eaf0",
    "--label": "#a0a8c0",
    "--muted": "#556070",
    "--accent": "#6ee7b7",
    "--accent2": "#818cf8",
    "--track": "rgba(255,255,255,0.07)",
    "--tooltip-bg": "rgba(10,14,24,0.96)",
    "--input-bg": "rgba(255,255,255,0.05)",
    "--hover-bg": "rgba(255,255,255,0.05)",
    "--option-bg": "#080c14",
    "--option-color": "#e8eaf0",
    "--accent-subtle": "rgba(110,231,183,0.08)",
    "--accent-border-c": "rgba(110,231,183,0.22)",
    "--accent-chip": "rgba(110,231,183,0.11)",
    "--accent-shadow": "rgba(110,231,183,0.18)",
    "--row-alt": "rgba(255,255,255,0.018)",
    "--header-tint": "rgba(110,231,183,0.05)",
    "--grid-line": "rgba(255,255,255,0.04)",
    "--step-bg": "rgba(110,231,183,0.1)",
  },
  light: {
    "--bg": "#f0f4f8",
    "--card-bg": "#ffffff",
    "--card-bg-hover": "#fafbfd",
    "--border": "rgba(0,0,0,0.08)",
    "--text": "#111827",
    "--label": "#374151",
    "--muted": "#6b7280",
    "--accent": "#059669",
    "--accent2": "#4f46e5",
    "--track": "rgba(0,0,0,0.09)",
    "--tooltip-bg": "rgba(255,255,255,0.98)",
    "--input-bg": "rgba(0,0,0,0.025)",
    "--hover-bg": "rgba(0,0,0,0.035)",
    "--option-bg": "#ffffff",
    "--option-color": "#111827",
    "--accent-subtle": "rgba(5,150,105,0.07)",
    "--accent-border-c": "rgba(5,150,105,0.22)",
    "--accent-chip": "rgba(5,150,105,0.09)",
    "--accent-shadow": "rgba(5,150,105,0.18)",
    "--row-alt": "rgba(0,0,0,0.015)",
    "--header-tint": "rgba(5,150,105,0.04)",
    "--grid-line": "rgba(0,0,0,0.06)",
    "--step-bg": "rgba(5,150,105,0.09)",
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
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
      <span style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 22, height: 22, borderRadius: "50%",
        background: "var(--step-bg)", border: "1.5px solid var(--accent-border-c)",
        fontSize: 11, fontWeight: 800, color: "var(--accent)", flexShrink: 0,
        boxShadow: "0 0 8px var(--accent-shadow)",
      }}>{n}</span>
      <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.13em", color: "var(--muted)", fontWeight: 700 }}>
        {title}
        {optional && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 400, textTransform: "none", letterSpacing: 0, opacity: 0.7 }}>(optional)</span>}
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
  const [salary, setSalary]                     = useState(() => lsFloat("cpf_salary",    5000));
  const [age, setAge]                           = useState(() => lsFloat("cpf_age",        30));
  const [prYear, setPrYear]                     = useState(() => lsFloat("cpf_pr_year",     1));
  const [annualIncrement, setAnnualIncrement]   = useState(() => lsFloat("cpf_increment",   3));
  const [yearsToProject, setYearsToProject]     = useState(() => lsFloat("cpf_years",      20));
  const [oaReturn, setOaReturn]                 = useState(() => lsFloat("cpf_oa_return",  2.5));
  const [saReturn, setSaReturn]                 = useState(() => lsFloat("cpf_sa_return",  4.0));
  const [maReturn, setMaReturn]                 = useState(() => lsFloat("cpf_ma_return",  4.0));
  const [oaStart, setOaStart]   = useState(() => lsFloat("cpf_oa_start",       0));
  const [saStart, setSaStart]   = useState(() => lsFloat("cpf_sa_start",       0));
  const [maStart, setMaStart]   = useState(() => lsFloat("cpf_ma_start",       0));
  const [ceilingGrowth, setCeilingGrowth] = useState(() => lsFloat("cpf_ceiling_growth", 3.5));
  const [saShield, setSaShield]     = useState(() => lsFloat("cpf_sa_shield", 0));
  const [saShieldOn, setSaShieldOn] = useState(() => {
    // Prefer the dedicated boolean key; fall back to old behaviour for existing users
    const explicit = localStorage.getItem("cpf_sa_shield_on");
    return explicit !== null ? explicit === "true" : lsFloat("cpf_sa_shield", 0) > 0;
  });
  const [activeTab, setActiveTab]   = useState(() => localStorage.getItem("active_tab") || "summary");
  const [pdfBusy, setPdfBusy]       = useState(false);
  const [pdfError, setPdfError]     = useState(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  // Show a first-run banner until the user changes salary (key not in storage yet)
  const [showWelcome, setShowWelcome] = useState(() => !localStorage.getItem("cpf_salary"));
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [syncTrigger, setSyncTrigger] = useState(0);

  // ─── Cloud sync ─────────────────────────────────────────────────────────
  const { user, syncing, syncError, signOut } = useCloudSync(syncTrigger);

  // ─── Persistence ────────────────────────────────────────────────────────
  useEffect(() => { try { localStorage.setItem("active_tab",        activeTab);                  } catch {} }, [activeTab]);
  useEffect(() => { try { localStorage.setItem("cpf_salary",         salary);                    } catch {} }, [salary]);
  useEffect(() => { try { localStorage.setItem("cpf_age",            age);                       } catch {} }, [age]);
  useEffect(() => { try { localStorage.setItem("cpf_pr_year",        prYear);                    } catch {} }, [prYear]);
  useEffect(() => { try { localStorage.setItem("cpf_increment",      annualIncrement);            } catch {} }, [annualIncrement]);
  useEffect(() => { try { localStorage.setItem("cpf_years",          yearsToProject);             } catch {} }, [yearsToProject]);
  useEffect(() => { try { localStorage.setItem("cpf_oa_return",      oaReturn);                  } catch {} }, [oaReturn]);
  useEffect(() => { try { localStorage.setItem("cpf_sa_return",      saReturn);                  } catch {} }, [saReturn]);
  useEffect(() => { try { localStorage.setItem("cpf_ma_return",      maReturn);                  } catch {} }, [maReturn]);
  useEffect(() => { try { localStorage.setItem("cpf_oa_start",       oaStart);                   } catch {} }, [oaStart]);
  useEffect(() => { try { localStorage.setItem("cpf_sa_start",       saStart);                   } catch {} }, [saStart]);
  useEffect(() => { try { localStorage.setItem("cpf_ma_start",       maStart);                   } catch {} }, [maStart]);
  useEffect(() => { try { localStorage.setItem("cpf_ceiling_growth", ceilingGrowth);             } catch {} }, [ceilingGrowth]);
  useEffect(() => { try { localStorage.setItem("cpf_sa_shield",    saShield);    } catch {} }, [saShield]);
  useEffect(() => { try { localStorage.setItem("cpf_sa_shield_on", saShieldOn); } catch {} }, [saShieldOn]);

  // Increment syncTrigger whenever any persisted value changes so useCloudSync debounces an outbound write
  useEffect(() => { setSyncTrigger(n => n + 1); },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [salary, age, prYear, annualIncrement, yearsToProject, oaReturn, saReturn, maReturn,
     oaStart, saStart, maStart, ceilingGrowth, saShield, saShieldOn]);

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
    setPdfError(null);
    try {
      await exportCpfPdf({
        projectionData, salary, age, prYear, annualIncrement, yearsToProject,
        oaReturn, saReturn, maReturn, ceilingGrowth,
        saShield: effectiveSaShield, cpfLifePayout,
      });
    } catch (e) {
      setPdfError(e?.message || "PDF generation failed — try again");
      setTimeout(() => setPdfError(null), 5000);
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
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }

        /* Range sliders */
        input[type=range] { -webkit-appearance: none; height: 4px; border-radius: 4px; background: var(--track); outline: none; cursor: pointer; width: 100%; }
        input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 18px; height: 18px; border-radius: 50%; background: var(--accent); cursor: pointer; border: 2.5px solid var(--bg); box-shadow: 0 0 0 1.5px var(--accent), 0 2px 8px var(--accent-shadow); transition: transform 0.15s ease; }
        input[type=range]::-webkit-slider-thumb:hover { transform: scale(1.2); }
        input[type=range]::-moz-range-thumb { width: 18px; height: 18px; border-radius: 50%; background: var(--accent); cursor: pointer; border: 2.5px solid var(--bg); box-shadow: 0 0 0 1.5px var(--accent); }

        /* Tab buttons */
        .tab-btn { padding: 8px 16px; border-radius: 9px; border: none; background: transparent; color: var(--muted); font-size: 13px; font-weight: 600; cursor: pointer; transition: background 0.15s ease, color 0.15s ease, box-shadow 0.15s ease; font-family: inherit; white-space: nowrap; }
        .tab-btn:hover { color: var(--text); background: var(--hover-bg); }
        .tab-btn.active { background: var(--accent-chip); color: var(--accent); box-shadow: 0 0 0 1px var(--accent-border-c), 0 2px 12px var(--accent-shadow); }

        /* Main number inputs */
        .input-field { width: 100%; padding: 11px 14px; border-radius: 10px; border: 1.5px solid var(--border); background: var(--input-bg); color: var(--text); font-size: 15px; font-family: 'DM Mono', monospace; font-weight: 500; outline: none; transition: border-color 0.15s ease, box-shadow 0.15s ease; }
        .input-field:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-shadow); }
        .input-field::placeholder { color: var(--muted); opacity: 0.55; }

        /* PR year chips */
        .pr-chip { display: inline-flex; align-items: center; padding: 7px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.15s ease; border: 1.5px solid var(--border); background: transparent; color: var(--muted); font-family: inherit; }
        .pr-chip:hover { color: var(--text); border-color: var(--accent-border-c); }
        .pr-chip.selected { background: var(--accent-chip); color: var(--accent); border-color: var(--accent-border-c); box-shadow: 0 0 14px var(--accent-shadow); }

        /* Section titles */
        .section-title { font-size: 10px; text-transform: uppercase; letter-spacing: 0.12em; color: var(--muted); font-weight: 700; margin-bottom: 16px; }

        /* Housing loan / generic inputs */
        .hl-in { width: 100%; padding: 9px 12px; border-radius: 8px; border: 1.5px solid var(--border); background: var(--input-bg); color: var(--text); font-size: 13px; font-family: inherit; outline: none; transition: border-color 0.15s ease, box-shadow 0.15s ease; -webkit-appearance: none; appearance: none; }
        .hl-in:focus { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-shadow); }
        .hl-in::placeholder { color: var(--muted); opacity: 0.55; }
        .hl-in option { background: var(--option-bg); color: var(--option-color); }

        /* Sidebar scrollbar */
        .sidebar-scroll::-webkit-scrollbar { width: 3px; }
        .sidebar-scroll::-webkit-scrollbar-track { background: transparent; }
        .sidebar-scroll::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

        /* Advanced toggle */
        .adv-toggle { display: flex; align-items: center; justify-content: space-between; width: 100%; background: transparent; border: none; cursor: pointer; padding: 0; font-family: inherit; }
        .adv-toggle:focus-visible { outline: 2px solid var(--accent); border-radius: 4px; }

        /* Hide scrollbar for tab rows */
        .tab-row { scrollbar-width: none; -ms-overflow-style: none; }
        .tab-row::-webkit-scrollbar { display: none; }

        @media (max-width: 800px) {
          .layout-grid { grid-template-columns: 1fr !important; }
          .sidebar-sticky { position: static !important; }
          .sidebar-scroll { max-height: none !important; overflow-y: visible !important; }
        }
        @media (max-width: 480px) {
          .tab-btn { padding: 6px 12px; font-size: 12px; }
          .mobile-h1 { font-size: 22px !important; }
          .mobile-pad { padding: 20px 16px 16px !important; }
          .mobile-inner { padding: 0 12px !important; }
        }
      `}</style>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="mobile-pad" style={{
        padding: "28px 24px 22px",
        background: `linear-gradient(160deg, ${tv["--header-tint"]} 0%, transparent 60%)`,
        borderBottom: "1px solid var(--border)",
        marginBottom: 24,
      }}>
        <div style={{ maxWidth: 1140, margin: "0 auto" }}>

          {/* Top row: badge + actions */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
            {/* Brand badge */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "4px 12px", borderRadius: 20,
                background: "var(--accent-chip)", border: "1px solid var(--accent-border-c)",
                fontSize: 11, fontWeight: 700, color: "var(--accent)", letterSpacing: "0.07em", textTransform: "uppercase",
              }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", display: "inline-block" }} />
                Singapore 2026
              </span>
            </div>

            {/* Action buttons */}
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              {pdfError  && <span style={{ fontSize: 11, color: "#f87171",  fontWeight: 500 }}>⚠ {pdfError}</span>}
              {syncError && <span style={{ fontSize: 11, color: "#fbbf24",  fontWeight: 500 }}>⚠ {syncError}</span>}

              {user ? (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {syncing
                    ? <span style={{ fontSize: 11, color: "var(--accent)", fontWeight: 500 }}>☁ Syncing…</span>
                    : <span style={{ fontSize: 11, color: "var(--muted)" }} title={user.email}>
                        ☁ {user.email.length > 20 ? user.email.slice(0, 18) + "…" : user.email}
                      </span>
                  }
                  <button onClick={signOut} title="Sign out" style={{ background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontSize: 11, fontWeight: 600, color: "var(--muted)", fontFamily: "inherit" }}>
                    Sign out
                  </button>
                </div>
              ) : (
                <button onClick={() => setShowAuthModal(true)} title="Sign in to sync your data to the cloud"
                  style={{ background: "var(--accent-subtle)", border: "1px solid var(--accent-border-c)", borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "var(--accent)", display: "flex", alignItems: "center", gap: 5, fontFamily: "inherit" }}>
                  ☁ Sign in
                </button>
              )}

              <button onClick={() => setTheme(t => t === "dark" ? "light" : "dark")}
                title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                style={{ background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 10px", cursor: "pointer", fontSize: 15, lineHeight: 1, color: "var(--text)" }}>
                {theme === "dark" ? "☀️" : "🌙"}
              </button>

              <button onClick={handleExportPdf} disabled={pdfBusy} title="Export projection as PDF"
                style={{ background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 14px", cursor: pdfBusy ? "default" : "pointer", fontSize: 12, fontWeight: 600, color: pdfBusy ? "var(--muted)" : "var(--accent)", opacity: pdfBusy ? 0.6 : 1, display: "flex", alignItems: "center", gap: 5, fontFamily: "inherit" }}>
                {pdfBusy ? "⏳ Generating…" : "⬇ PDF"}
              </button>
            </div>
          </div>

          {/* Title + subtitle */}
          <h1 className="mobile-h1" style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.025em", lineHeight: 1.15, color: "var(--text)" }}>
            CPF Contribution Calculator
          </h1>
          <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 6, lineHeight: 1.6 }}>
            For Permanent Residents · OW ceiling $8,000 · Rates effective 1 Jan 2026
          </p>

          {/* Data backup strip */}
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700 }}>Backup</span>
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
                  type="number" className="input-field" value={salary || ""} min={0} step={100}
                  placeholder="e.g. 5000"
                  onChange={e => {
                    const v = Math.max(0, parseInt(e.target.value) || 0);
                    setSalary(v);
                    setShowWelcome(false);
                  }}
                />
                {salary === 0 && (
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>
                    Enter your monthly salary to see projections
                  </div>
                )}
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
                  fontSize: 10, color: "var(--accent)", fontWeight: 700,
                  background: "var(--accent-chip)", border: "1px solid var(--accent-border-c)",
                  borderRadius: 6, padding: "2px 10px", marginLeft: 8, whiteSpace: "nowrap",
                }}>
                  {advancedOpen ? "▲ Less" : "▼ Expand"}
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
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 16, lineHeight: 1.7 }}>
                Enter your actual CPF balances. The projection starts from these figures instead of $0.
              </div>
              {[
                { key: "OA", label: "OA Balance (S$)",                                   value: oaStart, set: setOaStart, color: "#4ade80" },
                { key: age >= 55 ? "RA" : "SA", label: age >= 55 ? "RA Balance (S$)" : "SA Balance (S$)", value: saStart, set: setSaStart, color: age >= 55 ? "#a78bfa" : "#818cf8" },
                { key: "MA", label: "MA Balance (S$)",                                   value: maStart, set: setMaStart, color: "#f472b6" },
              ].map(({ key, label, value, set, color }) => (
                <div key={label} style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 12, color: "var(--label)", fontWeight: 600, display: "flex", alignItems: "center", marginBottom: 6 }}>
                    {label} <Hint text={GLOSSARY[key]} />
                  </label>
                  <div style={{ position: "relative" }}>
                    <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, borderRadius: "8px 0 0 8px", background: color, opacity: 0.7 }} />
                    <input
                      type="number" min="0" value={value || ""} placeholder="0"
                      onChange={e => set(parseFloat(e.target.value) || 0)}
                      className="hl-in"
                      style={{ paddingLeft: 14, fontFamily: "'DM Mono', monospace", fontSize: 14 }}
                    />
                  </div>
                </div>
              ))}
              {(oaStart > 0 || saStart > 0 || maStart > 0) && (
                <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 8, background: "var(--accent-subtle)", border: "1px solid var(--accent-border-c)", fontSize: 12, color: "var(--accent)", fontWeight: 600, fontFamily: "'DM Mono', monospace" }}>
                  Total starting balance: {fmtD(oaStart + saStart + maStart)}
                </div>
              )}

              {/* SA Shielding */}
              {age < 55 && (
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer", marginBottom: saShieldOn ? 12 : 0 }}>
                    <input type="checkbox" checked={saShieldOn} onChange={e => setSaShieldOn(e.target.checked)}
                      style={{ width: 16, height: 16, accentColor: "var(--accent)", cursor: "pointer", flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: "var(--label)", fontWeight: 600, display: "flex", alignItems: "center" }}>
                      SA Shielding (CPFIS-SA) <Hint text={GLOSSARY["CPFIS-SA"]} />
                    </span>
                  </label>
                  {saShieldOn && (
                    <>
                      <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 10, lineHeight: 1.7 }}>
                        Invest this amount into CPFIS before age 55 to protect it from the RA transfer. Proceeds return to OA at 55.
                      </div>
                      <div style={{ position: "relative" }}>
                        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, borderRadius: "8px 0 0 8px", background: "#818cf8", opacity: 0.7 }} />
                        <input
                          type="number" min="0" max={saStart} placeholder="e.g. 40,000" value={saShield || ""}
                          onChange={e => setSaShield(Math.max(0, parseFloat(e.target.value) || 0))}
                          className="hl-in"
                          style={{ paddingLeft: 14, fontFamily: "'DM Mono', monospace", fontSize: 14 }}
                        />
                      </div>
                      {saShield > 0 && saStart > 0 && saShield > saStart && (
                        <div style={{ fontSize: 11, color: "#fbbf24", marginTop: 6, display: "flex", alignItems: "center", gap: 5 }}>
                          ⚠ Shield exceeds SA balance — capped at {fmtD(saStart)}
                        </div>
                      )}
                      {saShield > 0 && (() => {
                        const raRow = projectionData.find(d => d.raFormed);
                        return raRow ? (
                          <div style={{ fontSize: 11, color: "#818cf8", marginTop: 8, lineHeight: 1.7, padding: "8px 10px", borderRadius: 8, background: "rgba(129,140,248,0.07)", border: "1px solid rgba(129,140,248,0.15)" }}>
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

          {/* ── Sticky nav: result strip + tab bar ────────────────────────── */}
          <div style={{ position: "sticky", top: 0, zIndex: 10, background: "var(--bg)", paddingBottom: 14 }}>

            {/* First-run welcome banner */}
            {showWelcome && (
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                marginBottom: 10, padding: "10px 16px", borderRadius: 10,
                background: "var(--accent-subtle)", border: "1px solid var(--accent-border-c)",
                fontSize: 12, color: "var(--label)", lineHeight: 1.5,
              }}>
                <span>👆 These are example values — enter your salary and age in the sidebar to personalise your projection.</span>
                <button onClick={() => setShowWelcome(false)}
                  style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 18, lineHeight: 1, padding: 0, flexShrink: 0 }}
                  aria-label="Dismiss">×</button>
              </div>
            )}

            {/* Live result strip */}
            <div style={{
              display: "flex", gap: 0, marginBottom: 14,
              background: "var(--card-bg)", border: "1px solid var(--border)",
              borderRadius: 14, overflow: "hidden", flexWrap: "wrap",
            }}>
              {[
                { label: `Total CPF · ${yearsToProject} yr`, value: fmtD(finalData.total),     color: "var(--accent)",  border: false },
                { label: "Monthly Take-Home",                 value: fmtD(monthly.takeHome),     color: "var(--text)",    border: true  },
                { label: "CPF Contribution / mo",             value: fmtD(monthly.totalContrib), color: "var(--accent2)", border: true  },
              ].map(({ label, value, color, border }) => (
                <div key={label} style={{
                  flex: "1 1 160px", minWidth: 0,
                  padding: "14px 20px",
                  borderLeft: border ? "1px solid var(--border)" : "none",
                }}>
                  <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700, marginBottom: 4 }}>
                    {label}
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 800, color, fontFamily: "'DM Mono', monospace", lineHeight: 1.2 }}>
                    {value}
                  </div>
                </div>
              ))}
            </div>

            {/* Tab bar — two scrollable rows */}
            <div role="tablist" aria-label="Calculator sections"
              onKeyDown={(e) => {
                const ids = TABS.map(([id]) => id);
                const cur = ids.indexOf(activeTab);
                if (e.key === "ArrowRight") { e.preventDefault(); setActiveTab(ids[(cur + 1) % ids.length]); }
                if (e.key === "ArrowLeft")  { e.preventDefault(); setActiveTab(ids[(cur - 1 + ids.length) % ids.length]); }
                if (e.key === "Home")       { e.preventDefault(); setActiveTab(ids[0]); }
                if (e.key === "End")        { e.preventDefault(); setActiveTab(ids[ids.length - 1]); }
              }}
            >
              {/* Row 1: CPF tabs */}
              <div className="tab-row" style={{ display: "flex", gap: 4, overflowX: "auto", paddingBottom: 2 }}>
                {CPF_TABS.map(([id, label]) => (
                  <button key={id} role="tab" aria-selected={activeTab === id}
                    aria-controls={`tabpanel-${id}`} id={`tab-${id}`}
                    tabIndex={activeTab === id ? 0 : -1}
                    className={`tab-btn ${activeTab === id ? "active" : ""}`}
                    onClick={() => setActiveTab(id)}>{label}</button>
                ))}
              </div>

              {/* Divider */}
              <div aria-hidden="true" style={{ display: "flex", alignItems: "center", gap: 8, margin: "6px 2px" }}>
                <div style={{ height: 1, flex: 1, background: "var(--border)" }} />
                <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--muted)", whiteSpace: "nowrap" }}>
                  Assets &amp; Planning
                </span>
                <div style={{ height: 1, flex: 1, background: "var(--border)" }} />
              </div>

              {/* Row 2: Asset tabs */}
              <div className="tab-row" style={{ display: "flex", gap: 4, overflowX: "auto", paddingBottom: 2, marginBottom: 6 }}>
                {ASSET_TABS.map(([id, label]) => (
                  <button key={id} role="tab" aria-selected={activeTab === id}
                    aria-controls={`tabpanel-${id}`} id={`tab-${id}`}
                    tabIndex={activeTab === id ? 0 : -1}
                    className={`tab-btn ${activeTab === id ? "active" : ""}`}
                    onClick={() => setActiveTab(id)}>{label}</button>
                ))}
              </div>
            </div>
          </div>{/* end sticky nav wrapper */}

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
          <div style={{
            padding: "18px 20px", borderRadius: 12,
            background: "var(--card-bg)", border: "1px solid var(--border)",
            fontSize: 11, color: "var(--muted)", lineHeight: 1.8,
            position: "relative", overflow: "hidden",
          }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "linear-gradient(90deg, var(--accent)44, var(--accent2)44)", borderRadius: "12px 12px 0 0" }} />
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <span style={{ fontSize: 14, flexShrink: 0, opacity: 0.6 }}>⚖️</span>
              <div>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--label)", letterSpacing: "0.01em" }}>Disclaimer</span>
                <span style={{ marginLeft: 6 }}>
                  This calculator is for estimation purposes only. Rates are based on CPF Board's official tables effective 1 Jan 2026, OW ceiling $8,000/month.{" "}
                  MA is capped at the BHS ({fmtD(CPF_BHS_2026)} in 2026); excess overflows to SA/RA.{" "}
                  At 55, SA + OA top-up transfer to RA up to the FRS ({fmtD(CPF_FRS_2026)} in 2026).{" "}
                  CPF LIFE payout is a rough estimate for the Standard Plan (~6.3%/yr of RA at 65).{" "}
                  Always verify at{" "}
                  <span style={{ color: "var(--accent)", fontWeight: 600 }}>cpf.gov.sg</span>.
                </span>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* ── Auth modal ──────────────────────────────────────────────────── */}
      {showAuthModal && (
        <AuthModal onClose={() => setShowAuthModal(false)} />
      )}
    </div>
  );
}
