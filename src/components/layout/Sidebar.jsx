import { OW_CEILING, fmt, fmtD } from "../../lib/cpf.js";
import { SEM } from "../../theme.js";
import { SliderInput }      from "../shared/SliderInput.jsx";
import { Hint }             from "../shared/Hint.jsx";
import { MoneyInput }       from "../shared/MoneyInput.jsx";
import { MonthlyBreakdown } from "../shared/MonthlyBreakdown.jsx";

const GLOSSARY = {
  OA:         "Ordinary Account — for housing, education, investment.",
  SA:         "Special Account — retirement savings, earns higher interest.",
  RA:         "Retirement Account — formed at 55 from OA + SA, funds CPF LIFE.",
  MA:         "MediSave Account — for approved medical expenses.",
  FRS:        "Full Retirement Sum — CPF Board's annual RA target amount.",
  BHS:        "Basic Healthcare Sum — MediSave cap; excess overflows to SA/RA.",
  "CPFIS-SA": "CPF Investment Scheme (SA) — shields SA from RA transfer at 55.",
};

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

/**
 * Sticky left sidebar: profile inputs, assumptions, starting balances
 * (incl. SA shielding), and the monthly contribution breakdown.
 */
export function Sidebar({
  salary, setSalary, age, setAge, prYear, setPrYear,
  annualIncrement, setAnnualIncrement, yearsToProject, setYearsToProject,
  oaReturn, setOaReturn, saReturn, setSaReturn, maReturn, setMaReturn,
  ceilingGrowth, setCeilingGrowth,
  oaStart, setOaStart, saStart, setSaStart, maStart, setMaStart,
  saShield, setSaShield, saShieldOn, setSaShieldOn,
  advancedOpen, setAdvancedOpen, setShowWelcome,
  monthly, projectionData,
}) {
  const advancedSummary = `${yearsToProject} yrs · OA ${oaReturn}% · SA ${saReturn}%`;

  return (
    <div className="sidebar-sticky" style={{ position: "sticky", top: 24 }}>
      <div className="sidebar-scroll" style={{ maxHeight: "calc(100vh - 48px)", overflowY: "auto", display: "flex", flexDirection: "column", gap: 16, paddingBottom: 8 }}>

        {/* ① Profile */}
        <div style={{ background: "var(--card-bg)", borderRadius: 16, padding: 24, border: "1px solid var(--border)" }}>
          <StepLabel n={1} title="Profile" />
          <div style={{ marginBottom: 18 }}>
            <label style={{ fontSize: 13, color: "var(--label)", fontWeight: 500, display: "block", marginBottom: 6 }}>Monthly Salary (SGD)</label>
            <MoneyInput
              className="input-field" value={salary} max={1_000_000}
              placeholder="e.g. 5,000"
              onChange={v => { setSalary(v); setShowWelcome(false); }}
            />
            {salary === 0 && (
              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>
                Enter your monthly salary to see projections
              </div>
            )}
            {salary > OW_CEILING && (
              <div style={{ fontSize: 11, color: SEM.warn, marginTop: 6 }}>
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
            { key: "OA", label: "OA Balance (S$)",                                   value: oaStart, set: setOaStart, color: SEM.oa },
            { key: age >= 55 ? "RA" : "SA", label: age >= 55 ? "RA Balance (S$)" : "SA Balance (S$)", value: saStart, set: setSaStart, color: age >= 55 ? SEM.ra : SEM.sa },
            { key: "MA", label: "MA Balance (S$)",                                   value: maStart, set: setMaStart, color: SEM.ma },
          ].map(({ key, label, value, set, color }) => (
            <div key={label} style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: "var(--label)", fontWeight: 600, display: "flex", alignItems: "center", marginBottom: 6 }}>
                {label} <Hint text={GLOSSARY[key]} />
              </label>
              <div style={{ position: "relative" }}>
                <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, borderRadius: "8px 0 0 8px", background: color, opacity: 0.7 }} />
                <MoneyInput
                  value={value} placeholder="0" max={10_000_000}
                  onChange={set}
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
                    <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, borderRadius: "8px 0 0 8px", background: SEM.sa, opacity: 0.7 }} />
                    <MoneyInput
                      value={saShield} placeholder="e.g. 40,000" max={10_000_000}
                      onChange={setSaShield}
                      className="hl-in"
                      style={{ paddingLeft: 14, fontFamily: "'DM Mono', monospace", fontSize: 14 }}
                    />
                  </div>
                  {saShield > 0 && saStart > 0 && saShield > saStart && (
                    <div style={{ fontSize: 11, color: SEM.warn, marginTop: 6, display: "flex", alignItems: "center", gap: 5 }}>
                      ⚠ Shield exceeds SA balance — capped at {fmtD(saStart)}
                    </div>
                  )}
                  {saShield > 0 && (() => {
                    const raRow = projectionData.find(d => d.raFormed);
                    return raRow ? (
                      <div style={{ fontSize: 11, color: SEM.sa, marginTop: 8, lineHeight: 1.7, padding: "8px 10px", borderRadius: 8, background: "rgba(129,140,248,0.07)", border: "1px solid rgba(129,140,248,0.15)" }}>
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
  );
}
