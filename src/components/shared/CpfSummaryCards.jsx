import { fmtD } from "../../lib/cpf.js";
import { StatCard } from "./StatCard.jsx";
import { SEM } from "../../theme.js";

/**
 * @param {{
 *   finalData: import("../../lib/cpf.js").ProjectionRow,
 *   yearsToProject: number,
 *   oaReturn: number,
 *   saReturn: number,
 *   maReturn: number,
 *   cpfLifePayout: import("../../lib/cpf.js").CpfLifePayout | null,
 * }} props
 */
export function CpfSummaryCards({ finalData, yearsToProject, oaReturn, saReturn, maReturn, cpfLifePayout }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 28 }}>
      <StatCard
        label={`OA Balance (Yr ${yearsToProject})`}
        value={fmtD(finalData.oa)}
        color={SEM.oa}
        sub={`at ${oaReturn}% return`}
      />
      {finalData.raFormed
        ? <StatCard label={`RA Balance (Yr ${yearsToProject})`} value={fmtD(finalData.ra)} color={SEM.ra} sub={`at ${saReturn}% return`} />
        : <StatCard label={`SA Balance (Yr ${yearsToProject})`} value={fmtD(finalData.sa)} color={SEM.sa} sub={`at ${saReturn}% return`} />
      }
      <StatCard
        label={`MA Balance (Yr ${yearsToProject})`}
        value={fmtD(finalData.ma)}
        color={SEM.ma}
        sub={finalData.ma >= finalData.bhs ? `BHS cap: ${fmtD(finalData.bhs)}` : `at ${maReturn}% return`}
      />
      {cpfLifePayout && (
        <StatCard
          label="Est. CPF LIFE payout"
          value={`~${fmtD(cpfLifePayout.monthlyPayout)}/mo`}
          color="var(--accent)"
          sub={`Standard Plan · age ${cpfLifePayout.payoutAge}`}
        />
      )}
    </div>
  );
}
