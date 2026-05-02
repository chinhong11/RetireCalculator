import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { CPF_FRS_2026, CPF_BHS_2026, fmtD } from "../../lib/cpf.js";
import { CustomTooltip } from "../shared/CustomTooltip.jsx";

/**
 * @param {{
 *   projectionData: import("../../lib/cpf.js").ProjectionRow[],
 *   finalData: import("../../lib/cpf.js").ProjectionRow,
 *   yearsToProject: number,
 *   ceilingGrowth: number,
 *   saReturn: number,
 *   cpfLifePayout: import("../../lib/cpf.js").CpfLifePayout | null,
 *   gridLineColor: string,
 * }} props
 */
export default function ProjectionTab({
  projectionData, finalData, yearsToProject,
  ceilingGrowth, saReturn, cpfLifePayout,
  gridLineColor,
}) {
  return (
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
          {[
            { color: "#4ade80", label: "OA" },
            { color: "#818cf8", label: "SA" },
            { color: "#a78bfa", label: "RA", note: "(at 55)" },
            { color: "#f472b6", label: "MA" },
          ].map(({ color, label, note }) => (
            <span key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: color, display: "inline-block" }} />
              {label}
              {note && <span style={{ color: "var(--muted)", fontSize: 10 }}>{note}</span>}
            </span>
          ))}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={320}>
        <AreaChart data={projectionData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <defs>
            {[
              { id: "gOA", color: "#4ade80" },
              { id: "gSA", color: "#818cf8" },
              { id: "gRA", color: "#a78bfa" },
              { id: "gMA", color: "#f472b6" },
            ].map(({ id, color }) => (
              <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor={color} stopOpacity={0.4} />
                <stop offset="100%" stopColor={color} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={gridLineColor} />
          <XAxis dataKey="year" tick={{ fill: "var(--muted)", fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis
            tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false}
            tickFormatter={v => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v}
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
        const effectiveFrs = raYear
          ? fmtD(Math.round(CPF_FRS_2026 * Math.pow(1 + ceilingGrowth / 100, raYear.year)))
          : fmtD(CPF_FRS_2026);
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
              <span style={{ color: "var(--accent)", fontWeight: 600 }}>
                Est. CPF LIFE payout at age {cpfLifePayout.payoutAge}
              </span>
              {" "}(Standard Plan{cpfLifePayout.extrapolated
                ? `, RA extrapolated from age ${cpfLifePayout.fromAge} at ${saReturn}% — no further contributions assumed`
                : ""})
            </span>
            <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 800, color: "var(--accent)", fontSize: 15 }}>
              ~{fmtD(cpfLifePayout.monthlyPayout)}/mo
            </span>
          </div>
          <div style={{ marginTop: 4, fontSize: 11 }}>
            Based on projected RA of {fmtD(cpfLifePayout.raAtPayout)} · ~6.3% annual rate · verify at cpf.gov.sg/cpflife
          </div>
        </div>
      )}
    </div>
  );
}
