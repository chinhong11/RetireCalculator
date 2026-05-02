import { fmtD } from "../../lib/cpf.js";
import { StatCard }  from "./StatCard.jsx";
import { AccountBar } from "./AccountBar.jsx";

/**
 * @param {{
 *   monthly: import("../../lib/cpf.js").MonthlyResult,
 *   prYear: number,
 *   age: number,
 * }} props
 */
export function MonthlyBreakdown({ monthly, prYear, age }) {
  return (
    <div style={{ background: "var(--card-bg)", borderRadius: 16, padding: 24, border: "1px solid var(--border)", marginBottom: 28 }}>
      <div className="section-title">Monthly Contribution Breakdown</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 24 }}>
        <StatCard label="Take-Home Pay"     value={fmtD(monthly.takeHome)}        sub="After employee CPF"                                       color="#e8eaf0" />
        <StatCard label="Your Contribution" value={fmtD(monthly.employeeContrib)} sub={`${(monthly.rates.employee * 100).toFixed(0)}% of capped wage`} color="#f472b6" />
        <StatCard label="Employer Pays"     value={fmtD(monthly.employerContrib)} sub={`${(monthly.rates.employer * 100).toFixed(0)}% of capped wage`} color="var(--accent2)" />
        <StatCard label="Total to CPF"      value={fmtD(monthly.totalContrib)}    sub={`${(monthly.rates.total * 100).toFixed(0)}% combined`}        color="var(--accent)" />
      </div>
      <div className="section-title" style={{ marginTop: 8 }}>Account Allocation</div>
      <AccountBar label="Ordinary Account (OA)"  amount={monthly.oaAmount} total={monthly.totalContrib} color="#4ade80" />
      <AccountBar
        label={age >= 55 ? "Retirement Account (RA)" : "Special Account (SA)"}
        amount={monthly.saAmount} total={monthly.totalContrib}
        color={age >= 55 ? "#a78bfa" : "#818cf8"}
      />
      <AccountBar label="MediSave Account (MA)"  amount={monthly.maAmount} total={monthly.totalContrib} color="#f472b6" />
      <div style={{ marginTop: 16, padding: "12px 16px", borderRadius: 10, background: "var(--accent-subtle)", border: "1px solid var(--accent-border-c)", fontSize: 12, color: "var(--label)", lineHeight: 1.6 }}>
        {prYear === 1 && "💡 As a 1st-year PR, your combined CPF rate is 9% — much lower than the full 37%. Rates increase in Year 2 (24%) and reach full citizen rates from Year 3 onwards."}
        {prYear === 2 && "💡 As a 2nd-year PR, your combined CPF rate is 24%. From next year, you'll contribute at the full citizen rate of 37%."}
        {prYear >= 3 && "💡 You're contributing at the full citizen rate of 37% (employee 20% + employer 17%)."}
      </div>
    </div>
  );
}
