import { useState, useMemo, useCallback, lazy, Suspense } from "react";

import { CPF_FRS_2026, CPF_BHS_2026, computeMonthly, projectYears, estimateCpfLifePayout, fmtD } from "./lib/cpf.js";
import { useCloudSync } from "./lib/useCloudSync.js";
import { usePersistedState } from "./lib/usePersistedState.js";
import { THEMES, GLOBAL_CSS } from "./theme.js";

import { Header }  from "./components/layout/Header.jsx";
import { Sidebar } from "./components/layout/Sidebar.jsx";
import { TabBar }  from "./components/layout/TabBar.jsx";

import { ErrorBoundary }   from "./components/shared/ErrorBoundary.jsx";
import { CpfSummaryCards } from "./components/shared/CpfSummaryCards.jsx";
import { AuthModal }       from "./components/shared/AuthModal.jsx";
import { QuickStart }      from "./components/shared/QuickStart.jsx";

// Tabs are lazy so Recharts/heavy tab code loads on demand instead of
// blocking first paint. (exportPdf — and jsPDF with it — is dynamically
// imported inside handleExportPdf for the same reason.)
const ProjectionTab      = lazy(() => import("./components/tabs/ProjectionTab.jsx"));
const ProjectionTableTab = lazy(() => import("./components/tabs/ProjectionTableTab.jsx"));
const HousingLoanTab     = lazy(() => import("./components/tabs/HousingLoanTab.jsx"));
const StocksTab          = lazy(() => import("./components/tabs/StocksTab.jsx"));
const CryptoTab          = lazy(() => import("./components/tabs/CryptoTab.jsx"));
const MYStocksTab        = lazy(() => import("./components/tabs/MYStocksTab.jsx"));
const EPFTab             = lazy(() => import("./components/tabs/EPFTab.jsx"));
const FixedDepositsTab   = lazy(() => import("./components/tabs/FixedDepositsTab.jsx"));
const SavingsTab         = lazy(() => import("./components/tabs/SavingsTab.jsx"));
const FireTab            = lazy(() => import("./components/tabs/FireTab.jsx"));
const NetWorthTab        = lazy(() => import("./components/tabs/NetWorthTab.jsx"));
const SummaryTab         = lazy(() => import("./components/tabs/SummaryTab.jsx"));

function TabLoading() {
  return (
    <div style={{ padding: "48px 0", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
      Loading…
    </div>
  );
}

export default function CPFCalculator() {
  // ─── Theme ──────────────────────────────────────────────────────────────
  const [theme, setTheme] = usePersistedState("theme", "dark", "string");
  const tv = THEMES[theme] || THEMES.dark;

  // ─── Core inputs (all persisted to localStorage) ────────────────────────
  const [salary, setSalary]                   = usePersistedState("cpf_salary",    5000);
  const [age, setAge]                         = usePersistedState("cpf_age",         30);
  const [prYear, setPrYear]                   = usePersistedState("cpf_pr_year",      1);
  const [annualIncrement, setAnnualIncrement] = usePersistedState("cpf_increment",    3);
  const [yearsToProject, setYearsToProject]   = usePersistedState("cpf_years",       20);
  const [oaReturn, setOaReturn]               = usePersistedState("cpf_oa_return",  2.5);
  const [saReturn, setSaReturn]               = usePersistedState("cpf_sa_return",  4.0);
  const [maReturn, setMaReturn]               = usePersistedState("cpf_ma_return",  4.0);
  const [oaStart, setOaStart]                 = usePersistedState("cpf_oa_start",     0);
  const [saStart, setSaStart]                 = usePersistedState("cpf_sa_start",     0);
  const [maStart, setMaStart]                 = usePersistedState("cpf_ma_start",     0);
  const [ceilingGrowth, setCeilingGrowth]     = usePersistedState("cpf_ceiling_growth", 3.5);
  const [saShield, setSaShield]               = usePersistedState("cpf_sa_shield",    0);
  const [saShieldOn, setSaShieldOn] = usePersistedState(
    "cpf_sa_shield_on",
    // Legacy migration: users from before the dedicated boolean key existed
    // had "shield on" implied by a positive cpf_sa_shield amount.
    () => { try { return parseFloat(localStorage.getItem("cpf_sa_shield")) > 0; } catch { return false; } },
    "bool",
  );
  const [activeTab, setActiveTab] = usePersistedState("active_tab", "summary", "string");
  const [pdfBusy, setPdfBusy]       = useState(false);
  const [pdfError, setPdfError]     = useState(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  // First run = the salary key has never been written. Show the quick-start
  // modal; the lighter welcome banner only appears if it's skipped.
  const [firstRun] = useState(() => !localStorage.getItem("cpf_salary"));
  const [showQuickStart, setShowQuickStart] = useState(firstRun);
  const [showWelcome, setShowWelcome] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [backupNudgeDismissed, setBackupNudgeDismissed] =
    useState(() => localStorage.getItem("backup_nudge_dismissed") === "true");

  // ─── Cloud sync ─────────────────────────────────────────────────────────
  // Outbound pushes are driven by the persist event that usePersistedState
  // dispatches on every localStorage write — edits in any tab sync.
  const { user, syncing, syncError, signOut } = useCloudSync();

  // Nudge un-signed-in users to protect data once they've entered real
  // records — everything lives in this browser until they back up / sign in.
  const hasPortfolioData = useMemo(() => {
    const collections = ["hl_props_v1", "stocks_v1", "mystocks_v1", "crypto_v1", "fd_v1", "goals_v1", "sav_expenses_v1"];
    return collections.some(k => {
      try { const v = JSON.parse(localStorage.getItem(k) || "[]"); return Array.isArray(v) && v.length > 0; }
      catch { return false; }
    });
  }, [activeTab]); // re-check on tab switch (tabs write these keys)
  const showBackupNudge = !user && !backupNudgeDismissed && hasPortfolioData;
  const dismissBackupNudge = () => {
    setBackupNudgeDismissed(true);
    try { localStorage.setItem("backup_nudge_dismissed", "true"); } catch {}
  };

  // ─── Derived data ────────────────────────────────────────────────────────
  const effectiveSaShield = age < 55 && saShieldOn ? saShield : 0;

  const monthly = useMemo(
    () => computeMonthly(salary, age, prYear),
    [salary, age, prYear],
  );

  // Also handed to ScenarioCompare so "what if?" variants re-run the exact
  // same projection with overrides.
  const baseInputs = useMemo(() => ({
    salary, age, prYear, annualIncrement, yearsToProject,
    oaReturn, saReturn, maReturn, oaStart, saStart, maStart,
    frsGrowthRate: ceilingGrowth, bhsGrowthRate: ceilingGrowth,
    saShield: effectiveSaShield,
  }), [salary, age, prYear, annualIncrement, yearsToProject,
       oaReturn, saReturn, maReturn, oaStart, saStart, maStart,
       ceilingGrowth, effectiveSaShield]);

  const projectionData = useMemo(() => projectYears(baseInputs), [baseInputs]);

  const finalData     = projectionData[projectionData.length - 1];
  const cpfLifePayout = useMemo(
    () => estimateCpfLifePayout(projectionData, saReturn),
    [projectionData, saReturn],
  );

  const handleExportPdf = useCallback(async () => {
    if (pdfBusy) return;
    setPdfBusy(true);
    setPdfError(null);
    try {
      const { exportCpfPdf } = await import("./lib/exportPdf.js");
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
      <style>{GLOBAL_CSS}</style>

      <Header
        theme={theme} setTheme={setTheme}
        user={user} syncing={syncing} syncError={syncError} signOut={signOut}
        onSignIn={() => setShowAuthModal(true)}
        pdfBusy={pdfBusy} pdfError={pdfError} onExportPdf={handleExportPdf}
      />

      {/* ── Two-column layout ───────────────────────────────────────────── */}
      <div className="layout-grid mobile-inner" style={{
        maxWidth: 1140, margin: "0 auto", padding: "0 20px",
        display: "grid", gridTemplateColumns: "340px 1fr",
        gap: 28, alignItems: "start",
      }}>

        <Sidebar
          salary={salary} setSalary={setSalary}
          age={age} setAge={setAge}
          prYear={prYear} setPrYear={setPrYear}
          annualIncrement={annualIncrement} setAnnualIncrement={setAnnualIncrement}
          yearsToProject={yearsToProject} setYearsToProject={setYearsToProject}
          oaReturn={oaReturn} setOaReturn={setOaReturn}
          saReturn={saReturn} setSaReturn={setSaReturn}
          maReturn={maReturn} setMaReturn={setMaReturn}
          ceilingGrowth={ceilingGrowth} setCeilingGrowth={setCeilingGrowth}
          oaStart={oaStart} setOaStart={setOaStart}
          saStart={saStart} setSaStart={setSaStart}
          maStart={maStart} setMaStart={setMaStart}
          saShield={saShield} setSaShield={setSaShield}
          saShieldOn={saShieldOn} setSaShieldOn={setSaShieldOn}
          advancedOpen={advancedOpen} setAdvancedOpen={setAdvancedOpen}
          setShowWelcome={setShowWelcome}
          monthly={monthly} projectionData={projectionData}
        />

        {/* ════ RIGHT MAIN ════════════════════════════════════════════════════ */}
        <div style={{ minWidth: 0 }}>

          {/* ── Sticky nav: result strip + tab bar ────────────────────────── */}
          <div style={{ position: "sticky", top: 0, zIndex: 10, background: "var(--bg)", paddingBottom: 14 }}>

            {/* First-run welcome banner */}
            {showWelcome && (
              <div style={{
                display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12,
                marginBottom: 10, padding: "12px 16px", borderRadius: 10,
                background: "var(--accent-subtle)", border: "1px solid var(--accent-border-c)",
                fontSize: 12, color: "var(--label)", lineHeight: 1.6,
              }}>
                <span>
                  <strong style={{ color: "var(--text)" }}>👋 Welcome!</strong> These are example figures.
                  <strong style={{ color: "var(--accent)" }}> Step 1:</strong> enter your salary &amp; age in the sidebar to see your personal CPF projection.
                  <strong style={{ color: "var(--accent)" }}> Step 2 (optional):</strong> the tabs above track extra assets — stocks, property, EPF, FIRE — add only what you want.
                </span>
                <button onClick={() => setShowWelcome(false)}
                  style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 18, lineHeight: 1, padding: 0, flexShrink: 0 }}
                  aria-label="Dismiss">×</button>
              </div>
            )}

            {/* Data-safety nudge — data lives only in this browser until saved */}
            {showBackupNudge && (
              <div style={{
                display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
                marginBottom: 10, padding: "10px 16px", borderRadius: 10,
                background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.3)",
                fontSize: 12, color: "var(--label)", lineHeight: 1.5,
              }}>
                <span style={{ flex: "1 1 300px" }}>
                  💾 Your data is saved only in this browser. <strong style={{ color: "var(--text)" }}>Sign in</strong> to sync it to the cloud, or export a backup — clearing your browser would otherwise erase it.
                </span>
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <button onClick={() => setShowAuthModal(true)}
                    style={{ background: "var(--accent-chip)", border: "1px solid var(--accent-border-c)", borderRadius: 8, padding: "5px 12px", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "var(--accent)", fontFamily: "inherit" }}>
                    ☁ Sign in
                  </button>
                  <button onClick={dismissBackupNudge}
                    style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 18, lineHeight: 1, padding: 0 }}
                    aria-label="Dismiss">×</button>
                </div>
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

            <TabBar activeTab={activeTab} setActiveTab={setActiveTab} />
          </div>{/* end sticky nav wrapper */}

          {/* ── Tab content ───────────────────────────────────────────────── */}
          <Suspense fallback={<TabLoading />}>
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
                  baseInputs={baseInputs}
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
          </Suspense>

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

      {/* ── First-run quick start ───────────────────────────────────────── */}
      {showQuickStart && (
        <QuickStart
          initialSalary={salary} initialAge={age} initialPrYear={prYear}
          monthlyContrib={monthly.totalContrib}
          onComplete={({ salary: s, age: a, prYear: p }) => { setSalary(s); setAge(a); setPrYear(p); }}
          onClose={(completed) => { setShowQuickStart(false); if (!completed) setShowWelcome(true); }}
        />
      )}

      {/* ── Auth modal ──────────────────────────────────────────────────── */}
      {showAuthModal && (
        <AuthModal onClose={() => setShowAuthModal(false)} />
      )}
    </div>
  );
}
