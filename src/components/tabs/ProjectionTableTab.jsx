import { fmtD } from "../../lib/cpf.js";

/**
 * @param {{
 *   projectionData: import("../../lib/cpf.js").ProjectionRow[],
 *   effectiveSaShield: number,
 *   rowAltColor: string,
 * }} props
 */
export default function ProjectionTableTab({ projectionData, effectiveSaShield, rowAltColor }) {
  const showCpfis = effectiveSaShield > 0;
  const headers = ["Year", "Age", "PR Yr", "Salary", "Monthly", "OA", "SA", "RA", "MA",
    ...(showCpfis ? ["CPFIS-SA"] : []), "Total CPF"];

  return (
    <div style={{ background: "var(--card-bg)", borderRadius: 16, border: "1px solid var(--border)", marginBottom: 28, overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              {headers.map(h => (
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
              const isRaYear = d.raFormed && (i === 0 || !projectionData[i - 1].raFormed);
              return (
                <tr key={i} style={{
                  borderBottom: "1px solid var(--border)",
                  background: isRaYear ? "rgba(167,139,250,0.06)" : i % 2 === 0 ? "transparent" : rowAltColor,
                }}>
                  <td style={{ padding: "12px", textAlign: "right", fontWeight: 600 }}>
                    {d.year}
                    {isRaYear && (
                      <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, color: "#a78bfa", background: "rgba(167,139,250,0.15)", padding: "2px 5px", borderRadius: 4, verticalAlign: "middle" }}>
                        RA
                      </span>
                    )}
                  </td>
                  <td style={{ padding: "12px", textAlign: "right", color: "var(--label)" }}>{d.age}</td>
                  <td style={{ padding: "12px", textAlign: "right", color: "var(--label)" }}>{d.prYear >= 3 ? "3+" : d.prYear}</td>
                  <td style={{ padding: "12px", textAlign: "right", fontFamily: "'DM Mono', monospace" }}>{fmtD(d.salary)}</td>
                  <td style={{ padding: "12px", textAlign: "right", fontFamily: "'DM Mono', monospace" }}>{fmtD(d.monthlyContrib)}</td>
                  <td style={{ padding: "12px", textAlign: "right", fontFamily: "'DM Mono', monospace", color: "#4ade80" }}>{fmtD(d.oa)}</td>
                  <td style={{ padding: "12px", textAlign: "right", fontFamily: "'DM Mono', monospace", color: "#818cf8" }}>
                    {d.raFormed ? <span style={{ color: "var(--muted)" }}>—</span> : fmtD(d.sa)}
                  </td>
                  <td style={{ padding: "12px", textAlign: "right", fontFamily: "'DM Mono', monospace", color: "#a78bfa" }}>
                    {d.raFormed ? fmtD(d.ra) : <span style={{ color: "var(--muted)" }}>—</span>}
                  </td>
                  <td style={{ padding: "12px", textAlign: "right", fontFamily: "'DM Mono', monospace", color: "#f472b6" }}>{fmtD(d.ma)}</td>
                  {showCpfis && (
                    <td style={{ padding: "12px", textAlign: "right", fontFamily: "'DM Mono', monospace", color: "#818cf8" }}>
                      {d.cpfis > 0 ? fmtD(d.cpfis) : <span style={{ color: "var(--muted)" }}>—</span>}
                    </td>
                  )}
                  <td style={{ padding: "12px", textAlign: "right", fontFamily: "'DM Mono', monospace", fontWeight: 700, color: "var(--accent)" }}>{fmtD(d.total)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
