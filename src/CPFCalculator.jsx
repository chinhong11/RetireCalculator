import { useState, useMemo, useEffect, useCallback } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

import { OW_CEILING, CPF_FRS_2026, CPF_BHS_2026, computeMonthly, projectYears, estimateCpfLifePayout, fmt, fmtD } from "./lib/cpf.js";
import { exportCpfPdf } from "./lib/exportPdf.js";

import { SliderInput }    from "./components/shared/SliderInput.jsx";
import { StatCard }       from "./components/shared/StatCard.jsx";
import { AccountBar }     from "./components/shared/AccountBar.jsx";
import { CustomTooltip }  from "./components/shared/CustomTooltip.jsx";
import { BackupBar }      from "./components/shared/BackupBar.jsx";

import HousingLoanTab    from "./components/tabs/HousingLoanTab.jsx";
import StocksTab         from "./components/tabs/StocksTab.jsx";
import CryptoTab         from "./components/tabs/CryptoTab.jsx";
import MYStocksTab       from "./components/tabs/MYStocksTab.jsx";
import EPFTab            from "./components/tabs/EPFTab.jsx";
import FixedDepositsTab  from "./components/tabs/FixedDepositsTab.jsx";
import SavingsTab        from "./components/tabs/SavingsTab.jsx";
import FireTab           from "./components/tabs/FireTab.jsx";
import NetWorthTab       from "./components/tabs/NetWorthTab.jsx";
import SummaryTab        from "./components/tabs/SummaryTab.jsx";

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

export default function CPFCalculator() {
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "dark");
  useEffect(() => { localStorage.setItem("theme", theme); }, [theme]);
  const isDark = theme === "dark";
  const tv = THEMES[theme]; // theme variable values for use in JSX

  const [salary, setSalary]               = useState(5000);
  const [age, setAge]                     = useState(30);
  const [prYear, setPrYear]               = useState(1);
  const [annualIncrement, setAnnualIncrement] = useState(3);
  const [yearsToProject, setYearsToProject]   = useState(20);
  const [oaReturn, setOaReturn]           = useState(2.5);
  const [saReturn, setSaReturn]           = useState(4.0);
  const [maReturn, setMaReturn]           = useState(4.0);
  const [oaStart, setOaStart] = useState(() => { try { return parseFloat(localStorage.getItem("cpf_oa_start") || "0") || 0; } catch { return 0; } });
  const [saStart, setSaStart] = useState(() => { try { return parseFloat(localStorage.getItem("cpf_sa_start") || "0") || 0; } catch { return 0; } });
  const [maStart, setMaStart] = useState(() => { try { return parseFloat(localStorage.getItem("cpf_ma_start") || "0") || 0; } catch { return 0; } });
  const [ceilingGrowth, setCeilingGrowth] = useState(() => { try { return parseFloat(localStorage.getItem("cpf_ceiling_growth") || "3.5") || 3.5; } catch { return 3.5; } });
  const [saShield, setSaShield]   = useState(() => { try { return parseFloat(localStorage.getItem("cpf_sa_shield") || "0") || 0; } catch { return 0; } });
  const [saShieldOn, setSaShieldOn] = useState(() => !!parseFloat(localStorage.getItem("cpf_sa_shield") || "0"));
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem("active_tab") || "summary");
  const [pdfBusy, setPdfBusy] = useState(false);
  useEffect(() => { try { localStorage.setItem("active_tab", activeTab); } catch {} }, [activeTab]);

  useEffect(() => { try { localStorage.setItem("cpf_oa_start",       oaStart);       } catch {} }, [oaStart]);
  useEffect(() => { try { localStorage.setItem("cpf_sa_start",       saStart);       } catch {} }, [saStart]);
  useEffect(() => { try { localStorage.setItem("cpf_ma_start",       maStart);       } catch {} }, [maStart]);
  useEffect(() => { try { localStorage.setItem("cpf_ceiling_growth", ceilingGrowth); } catch {} }, [ceilingGrowth]);
  useEffect(() => { try { localStorage.setItem("cpf_sa_shield", saShieldOn ? saShield : 0); } catch {} }, [saShield, saShieldOn]);

  const effectiveSaShield = (!age || age >= 55 || !saShieldOn) ? 0 : saShield;

  const monthly = useMemo(() => computeMonthly(salary, age, prYear), [salary, age, prYear]);
  const projectionData = useMemo(() => projectYears({
    salary, age, prYear, annualIncrement, yearsToProject, oaReturn, saReturn, maReturn, oaStart, saStart, maStart,
    frsGrowthRate: ceilingGrowth, bhsGrowthRate: ceilingGrowth, saShield: effectiveSaShield,
  }), [salary, age, prYear, annualIncrement, yearsToProject, oaReturn, saReturn, maReturn, oaStart, saStart, maStart, ceilingGrowth, effectiveSaShield]);

  const finalData      = projectionData[projectionData.length - 1];
  const cpfLifePayout  = useMemo(() => estimateCpfLifePayout(projectionData, saReturn), [projectionData, saReturn]);

  const handleExportPdf = useCallback(async () => {
    if (pdfBusy) return;
    setPdfBusy(true);
    try {
      await exportCpfPdf({ projectionData, salary, age, prYear, annualIncrement, yearsToProject, oaReturn, saReturn, maReturn, ceilingGrowth, saShield: effectiveSaShield, cpfLifePayout });
    } finally {
      setPdfBusy(false);
    }
  }, [projectionData, salary, age, prYear, annualIncrement, yearsToProject, oaReturn, saReturn, maReturn, ceilingGrowth, effectiveSaShield, cpfLifePayout, pdfBusy]);

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
        @media (max-width: 480px) {
          .tab-btn { padding: 7px 12px; font-size: 12px; }
          .mobile-h1 { font-size: 22px !important; }
          .mobile-pad { padding: 20px 16px 16px !important; }
          .mobile-inner { padding: 0 12px !important; }
        }
      `}</style>

      {/* Header */}
      <div className="mobile-pad" style={{
        padding: "32px 24px 24px",
        background: `linear-gradient(180deg, ${tv["--header-tint"]} 0%, transparent 100%)`,
        borderBottom: "1px solid var(--border)",
        marginBottom: 24,
      }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent)" }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Singapore 2026</span>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {/* Theme toggle */}
              <button
                onClick={() => setTheme(t => t === "dark" ? "light" : "dark")}
                title={isDark ? "Switch to light mode" : "Switch to dark mode"}
                style={{ background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 10px", cursor: "pointer", fontSize: 15, lineHeight: 1, color: "var(--text)" }}
              >{isDark ? "☀️" : "🌙"}</button>
              {/* PDF export */}
              <button
                onClick={handleExportPdf}
                disabled={pdfBusy}
                title="Export projection as PDF"
                style={{ background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 12px", cursor: pdfBusy ? "default" : "pointer", fontSize: 12, fontWeight: 600, color: pdfBusy ? "var(--muted)" : "var(--accent)", opacity: pdfBusy ? 0.6 : 1, display: "flex", alignItems: "center", gap: 5 }}
              >
                {pdfBusy ? "⏳ Generating…" : "⬇ PDF"}
              </button>
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

      <div className="mobile-inner" style={{ maxWidth: 800, margin: "0 auto", padding: "0 20px" }}>
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
              <SliderInput label="Project Over"            value={yearsToProject}  onChange={setYearsToProject}  min={1} max={40} step={1}   suffix=" years" />
              <SliderInput label="OA Return Rate"          value={oaReturn}        onChange={setOaReturn}        min={0} max={8}  step={0.5} suffix="%" />
              <SliderInput label="SA / RA Return Rate"      value={saReturn}        onChange={setSaReturn}        min={0} max={8}  step={0.5} suffix="%" />
              <SliderInput label="MA Return Rate"          value={maReturn}        onChange={setMaReturn}        min={0} max={8}  step={0.5} suffix="%" />
              <SliderInput label="FRS / BHS Annual Growth" value={ceilingGrowth}   onChange={setCeilingGrowth}   min={0} max={6}  step={0.5} suffix="%" />
            </div>
            <div style={{ background: "var(--card-bg)", borderRadius: 16, padding: 24, border: "1px solid var(--border)" }}>
              <div className="section-title">Current CPF Balances (optional)</div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 14, lineHeight: 1.6 }}>
                Enter your actual balances from the CPF portal. The projection will start from these figures instead of $0.
              </div>
              {[
                { label: "OA Balance (S$)", value: oaStart, set: setOaStart, color: "#4ade80" },
                { label: age >= 55 ? "RA Balance (S$)" : "SA Balance (S$)", value: saStart, set: setSaStart, color: age >= 55 ? "#a78bfa" : "#818cf8" },
                { label: "MA Balance (S$)", value: maStart, set: setMaStart, color: "#f472b6" },
              ].map(({ label, value, set, color }) => (
                <div key={label} style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 13, color: "var(--label)", fontWeight: 500, display: "block", marginBottom: 6 }}>{label}</label>
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
                    <span style={{ fontSize: 13, color: "var(--label)", fontWeight: 600 }}>SA Shielding (CPFIS-SA)</span>
                  </label>
                  {saShieldOn && (
                    <>
                      <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 8, lineHeight: 1.6 }}>
                        Invest this amount of SA into CPFIS before age 55. Only uninvested SA cash forms RA — the
                        shield stays in CPFIS (growing at SA rate) and returns to your OA after 55, preserving
                        more flexible funds.
                      </div>
                      <input
                        type="number" min="0" max={saStart} placeholder="e.g. 40000" value={saShield || ""}
                        onChange={e => setSaShield(Math.max(0, parseFloat(e.target.value) || 0))}
                        style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid rgba(129,140,248,0.3)", background: "rgba(129,140,248,0.06)", color: "var(--text)", fontSize: 14, fontFamily: "'DM Mono', monospace", outline: "none" }}
                      />
                      {saShield > 0 && saStart > 0 && saShield > saStart && (
                        <div style={{ fontSize: 11, color: "#fbbf24", marginTop: 4 }}>
                          ⚠ Shield exceeds SA balance — capped at {fmtD(saStart)}
                        </div>
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
          </div>
        </div>

        {/* Monthly Breakdown */}
        <div style={{
          background: "var(--card-bg)", borderRadius: 16, padding: 24,
          border: "1px solid var(--border)", marginBottom: 28,
        }}>
          <div className="section-title">Monthly Contribution Breakdown</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 24 }}>
            <StatCard label="Take-Home Pay"     value={fmtD(monthly.takeHome)}        sub="After employee CPF"                            color="#e8eaf0" />
            <StatCard label="Your Contribution" value={fmtD(monthly.employeeContrib)} sub={`${(monthly.rates.employee * 100).toFixed(0)}% of capped wage`} color="#f472b6" />
            <StatCard label="Employer Pays"     value={fmtD(monthly.employerContrib)} sub={`${(monthly.rates.employer * 100).toFixed(0)}% of capped wage`} color="var(--accent2)" />
            <StatCard label="Total to CPF"      value={fmtD(monthly.totalContrib)}    sub={`${(monthly.rates.total * 100).toFixed(0)}% combined`}          color="var(--accent)" />
          </div>
          <div className="section-title" style={{ marginTop: 8 }}>Account Allocation</div>
          <AccountBar label="Ordinary Account (OA)" amount={monthly.oaAmount}  total={monthly.totalContrib} color="#4ade80" />
          <AccountBar label={age >= 55 ? "Retirement Account (RA)" : "Special Account (SA)"} amount={monthly.saAmount} total={monthly.totalContrib} color={age >= 55 ? "#a78bfa" : "#818cf8"} />
          <AccountBar label="MediSave Account (MA)" amount={monthly.maAmount}  total={monthly.totalContrib} color="#f472b6" />
          <div style={{
            marginTop: 16, padding: "12px 16px", borderRadius: 10,
            background: "var(--accent-subtle)", border: "1px solid var(--accent-border-c)",
            fontSize: 12, color: "var(--label)", lineHeight: 1.6,
          }}>
            {prYear === 1 && "💡 As a 1st-year PR, your combined CPF rate is 9% — much lower than the full 37%. Rates increase in Year 2 (24%) and reach full citizen rates from Year 3 onwards."}
            {prYear === 2 && "💡 As a 2nd-year PR, your combined CPF rate is 24%. From next year, you'll contribute at the full citizen rate of 37%."}
            {prYear >= 3 && "💡 You're contributing at the full citizen rate of 37% (employee 20% + employer 17%)."}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
          {[
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
          ].map(([id, label]) => (
            <button key={id} className={`tab-btn ${activeTab === id ? "active" : ""}`} onClick={() => setActiveTab(id)}>
              {label}
            </button>
          ))}
        </div>

        {activeTab === "summary" && (
          <div style={{ marginBottom: 28 }}>
            <SummaryTab cpfData={finalData} yearsToProject={yearsToProject} projectionData={projectionData} />
          </div>
        )}

        {activeTab === "projection" && (
          <div style={{ background: "var(--card-bg)", borderRadius: 16, padding: 24, border: "1px solid var(--border)", marginBottom: 28 }}>
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
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, fontSize: 12 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: "#4ade80" }}></span> OA</span>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: "#818cf8" }}></span> SA</span>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: "#a78bfa" }}></span> RA <span style={{ color: "var(--muted)", fontSize: 10 }}>(at 55)</span></span>
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
                  <linearGradient id="gRA" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#a78bfa" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="gMA" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f472b6" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#f472b6" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={tv["--grid-line"]} />
                <XAxis dataKey="year" tick={{ fill: "#5a6380", fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fill: "#5a6380", fontSize: 11 }} axisLine={false} tickLine={false}
                  tickFormatter={v => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : v}
                  width={55}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="oa" stackId="1" stroke="#4ade80" fill="url(#gOA)" strokeWidth={2} />
                <Area type="monotone" dataKey="sa" stackId="1" stroke="#818cf8" fill="url(#gSA)" strokeWidth={2} />
                <Area type="monotone" dataKey="ra" stackId="1" stroke="#a78bfa" fill="url(#gRA)" strokeWidth={2} />
                <Area type="monotone" dataKey="ma" stackId="1" stroke="#f472b6" fill="url(#gMA)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
            {projectionData.some(d => d.raFormed) && (() => {
              const raYear = projectionData.find(d => d.raFormed);
              const effectiveFrs = raYear ? fmtD(Math.round(CPF_FRS_2026 * Math.pow(1 + ceilingGrowth / 100, raYear.year))) : fmtD(CPF_FRS_2026);
              return (
                <div style={{ marginTop: 14, padding: "10px 14px", borderRadius: 8, background: "rgba(167,139,250,0.06)", border: "1px solid rgba(167,139,250,0.2)", fontSize: 12, color: "var(--muted)", lineHeight: 1.6 }}>
                  <span style={{ color: "#a78bfa", fontWeight: 600 }}>RA formed at age 55</span>
                  {" "}— SA transferred to Retirement Account; OA topped up to projected FRS of {effectiveFrs} ({ceilingGrowth}%/yr growth from {fmtD(CPF_FRS_2026)}). Future SA-allocation contributions go to RA.
                </div>
              );
            })()}
            {projectionData.some(d => d.ma >= d.bhs) && (
              <div style={{ marginTop: 10, padding: "10px 14px", borderRadius: 8, background: "rgba(244,114,182,0.05)", border: "1px solid rgba(244,114,182,0.15)", fontSize: 12, color: "var(--muted)", lineHeight: 1.6 }}>
                <span style={{ color: "#f472b6", fontWeight: 600 }}>MA reaches BHS cap</span>
                {" "}— excess contributions and interest redirect to SA / RA. BHS starts at {fmtD(CPF_BHS_2026)} and grows at {ceilingGrowth}%/yr in this projection.
              </div>
            )}
            {cpfLifePayout && (
              <div style={{ marginTop: 10, padding: "12px 16px", borderRadius: 8, background: "rgba(110,231,183,0.06)", border: "1px solid rgba(110,231,183,0.2)", fontSize: 12, color: "var(--muted)", lineHeight: 1.6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                  <span>
                    <span style={{ color: "var(--accent)", fontWeight: 600 }}>Est. CPF LIFE payout at age {cpfLifePayout.payoutAge}</span>
                    {" "}(Standard Plan{cpfLifePayout.extrapolated ? `, RA extrapolated from age ${cpfLifePayout.fromAge} at ${saReturn}% — no further contributions assumed` : ""})
                  </span>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 800, color: "var(--accent)", fontSize: 15 }}>~{fmtD(cpfLifePayout.monthlyPayout)}/mo</span>
                </div>
                <div style={{ marginTop: 4, fontSize: 11 }}>Based on projected RA of {fmtD(cpfLifePayout.raAtPayout)} · ~6.3% annual rate · verify at cpf.gov.sg/cpflife</div>
              </div>
            )}
          </div>
        )}

        {activeTab === "table" && (
          <div style={{ background: "var(--card-bg)", borderRadius: 16, border: "1px solid var(--border)", marginBottom: 28, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    {["Year", "Age", "PR Yr", "Salary", "Monthly", "OA", "SA", "RA", "MA", ...(effectiveSaShield > 0 ? ["CPFIS-SA"] : []), "Total CPF"].map(h => (
                      <th key={h} style={{
                        padding: "14px 12px", textAlign: "right", fontSize: 11, fontWeight: 600,
                        color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em",
                        position: "sticky", top: 0, background: "var(--bg)",
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {projectionData.map((d, i) => {
                    const isRaYear = d.raFormed && (i === 0 ? true : !projectionData[i - 1].raFormed);
                    return (
                      <tr key={i} style={{ borderBottom: "1px solid var(--border)", background: isRaYear ? "rgba(167,139,250,0.06)" : i % 2 === 0 ? "transparent" : tv["--row-alt"] }}>
                        <td style={{ padding: "12px", textAlign: "right", fontWeight: 600 }}>
                          {d.year}
                          {isRaYear && <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, color: "#a78bfa", background: "rgba(167,139,250,0.15)", padding: "2px 5px", borderRadius: 4, verticalAlign: "middle" }}>RA</span>}
                        </td>
                        <td style={{ padding: "12px", textAlign: "right", color: "var(--label)" }}>{d.age}</td>
                        <td style={{ padding: "12px", textAlign: "right", color: "var(--label)" }}>{d.prYear >= 3 ? "3+" : d.prYear}</td>
                        <td style={{ padding: "12px", textAlign: "right", fontFamily: "'DM Mono', monospace" }}>{fmtD(d.salary)}</td>
                        <td style={{ padding: "12px", textAlign: "right", fontFamily: "'DM Mono', monospace" }}>{fmtD(d.monthlyContrib)}</td>
                        <td style={{ padding: "12px", textAlign: "right", fontFamily: "'DM Mono', monospace", color: "#4ade80" }}>{fmtD(d.oa)}</td>
                        <td style={{ padding: "12px", textAlign: "right", fontFamily: "'DM Mono', monospace", color: "#818cf8" }}>{d.raFormed ? <span style={{ color: "var(--muted)" }}>—</span> : fmtD(d.sa)}</td>
                        <td style={{ padding: "12px", textAlign: "right", fontFamily: "'DM Mono', monospace", color: "#a78bfa" }}>{d.raFormed ? fmtD(d.ra) : <span style={{ color: "var(--muted)" }}>—</span>}</td>
                        <td style={{ padding: "12px", textAlign: "right", fontFamily: "'DM Mono', monospace", color: "#f472b6" }}>{fmtD(d.ma)}</td>
                        {effectiveSaShield > 0 && (
                          <td style={{ padding: "12px", textAlign: "right", fontFamily: "'DM Mono', monospace", color: "#818cf8" }}>{d.cpfis > 0 ? fmtD(d.cpfis) : <span style={{ color: "var(--muted)" }}>—</span>}</td>
                        )}
                        <td style={{ padding: "12px", textAlign: "right", fontFamily: "'DM Mono', monospace", fontWeight: 700, color: "var(--accent)" }}>{fmtD(d.total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "housing"  && <div style={{ marginBottom: 28 }}><HousingLoanTab /></div>}
        {activeTab === "mystocks" && <div style={{ marginBottom: 28 }}><MYStocksTab /></div>}
        {activeTab === "stocks"   && <div style={{ marginBottom: 28 }}><StocksTab /></div>}
        {activeTab === "crypto"   && <div style={{ marginBottom: 28 }}><CryptoTab /></div>}
        {activeTab === "epf"      && <div style={{ marginBottom: 28 }}><EPFTab /></div>}
        {activeTab === "fd"       && <div style={{ marginBottom: 28 }}><FixedDepositsTab /></div>}
        {activeTab === "savings"  && <div style={{ marginBottom: 28 }}><SavingsTab projectionData={projectionData} yearsToProject={yearsToProject} cpfMonthly={monthly} salary={salary} /></div>}
        {activeTab === "fire"     && <div style={{ marginBottom: 28 }}><FireTab projectionData={projectionData} yearsToProject={yearsToProject} /></div>}
        {activeTab === "networth" && <div style={{ marginBottom: 28 }}><NetWorthTab projectionData={projectionData} yearsToProject={yearsToProject} /></div>}

        {/* Summary Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 28 }}>
          <StatCard label={`OA Balance (Yr ${yearsToProject})`} value={fmtD(finalData.oa)} color="#4ade80" sub={`at ${oaReturn}% return`} />
          {finalData.raFormed
            ? <StatCard label={`RA Balance (Yr ${yearsToProject})`} value={fmtD(finalData.ra)} color="#a78bfa" sub={`at ${saReturn}% return`} />
            : <StatCard label={`SA Balance (Yr ${yearsToProject})`} value={fmtD(finalData.sa)} color="#818cf8" sub={`at ${saReturn}% return`} />
          }
          <StatCard label={`MA Balance (Yr ${yearsToProject})`} value={fmtD(finalData.ma)} color="#f472b6" sub={finalData.ma >= finalData.bhs ? `BHS cap: ${fmtD(finalData.bhs)}` : `at ${maReturn}% return`} />
          {cpfLifePayout && <StatCard label="Est. CPF LIFE payout" value={`~${fmtD(cpfLifePayout.monthlyPayout)}/mo`} color="var(--accent)" sub={`Standard Plan · age ${cpfLifePayout.payoutAge}`} />}
        </div>

        {/* Footer */}
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
  );
}
