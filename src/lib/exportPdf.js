// Lazy-loaded PDF export — jsPDF + jspdf-autotable are only imported on first call.
export async function exportCpfPdf({
  projectionData,
  salary, age, prYear, annualIncrement, yearsToProject,
  oaReturn, saReturn, maReturn, ceilingGrowth,
  saShield, cpfLifePayout,
}) {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.width;
  const M = 14;
  let y = 18;

  const fmt  = n => n?.toLocaleString("en-SG", { maximumFractionDigits: 0 }) ?? "—";
  const fmtD = n => (n != null ? `S$${fmt(n)}` : "—");

  // ─── Header ─────────────────────────────────────────────────────────────
  doc.setFillColor(10, 14, 23);
  doc.rect(0, 0, W, 28, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("CPF Projection Report", M, y);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(110, 231, 183);
  doc.text(`Generated ${new Date().toLocaleDateString("en-SG", { year: "numeric", month: "long", day: "numeric" })}`, M, y + 7);
  y = 36;

  // ─── Inputs ─────────────────────────────────────────────────────────────
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0);
  doc.text("Projection Inputs", M, y);
  y += 3;

  const inputRows = [
    ["Monthly Salary", fmtD(salary)],
    ["Current Age", `${age} years`],
    ["PR Status Year", prYear >= 3 ? "3rd year+ / SC rates" : `${prYear}${prYear === 1 ? "st" : "nd"} year PR`],
    ["Projection Period", `${yearsToProject} years  →  age ${age + yearsToProject}`],
    ["Annual Salary Increment", `${annualIncrement}%`],
    ["OA Return Rate", `${oaReturn}%`],
    ["SA / RA Return Rate", `${saReturn}%`],
    ["MA Return Rate", `${maReturn}%`],
    ["FRS / BHS Annual Growth", `${ceilingGrowth}%`],
    ...(saShield > 0 ? [["SA Shielding (CPFIS-SA)", fmtD(saShield)]] : []),
  ];

  autoTable(doc, {
    startY: y,
    body: inputRows,
    theme: "plain",
    styles: { fontSize: 9.5, cellPadding: 2.5 },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 68 },
      1: { halign: "right" },
    },
    margin: { left: M, right: M },
  });
  y = doc.lastAutoTable.finalY + 8;

  // ─── CPF LIFE ────────────────────────────────────────────────────────────
  if (cpfLifePayout) {
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0);
    doc.text("Estimated CPF LIFE Payout (Standard Plan)", M, y);
    y += 3;

    autoTable(doc, {
      startY: y,
      body: [
        ["RA at payout age", fmtD(cpfLifePayout.raAtPayout)],
        ["Payout age", String(cpfLifePayout.payoutAge)],
        ["Est. monthly payout", `~${fmtD(cpfLifePayout.monthlyPayout)} / month`],
        cpfLifePayout.extrapolated
          ? ["Note", `RA extrapolated from age ${cpfLifePayout.fromAge} at ${saReturn}% (no contributions assumed)`]
          : null,
      ].filter(Boolean),
      theme: "plain",
      styles: { fontSize: 9.5, cellPadding: 2.5 },
      columnStyles: {
        0: { fontStyle: "bold", cellWidth: 68 },
        1: { halign: "right" },
      },
      margin: { left: M, right: M },
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  // ─── Year-by-year table ──────────────────────────────────────────────────
  // Keep one row per year but truncate very long projections (max 41 rows = yr 0..40)
  const tableRows = projectionData.map(d => [
    d.year,
    d.age,
    d.prYear >= 3 ? "3+" : String(d.prYear),
    fmtD(d.salary),
    fmtD(d.oa),
    d.raFormed ? "—" : fmtD(d.sa),
    d.raFormed ? fmtD(d.ra) : "—",
    fmtD(d.ma),
    fmtD(d.total),
  ]);

  // Check if we need a new page
  if (y > 220) { doc.addPage(); y = 14; }

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0);
  doc.text("Year-by-Year CPF Projection", M, y);
  y += 3;

  autoTable(doc, {
    startY: y,
    head: [["Yr", "Age", "PR", "Salary", "OA", "SA", "RA", "MA", "Total CPF"]],
    body: tableRows,
    theme: "striped",
    headStyles: {
      fillColor: [10, 14, 23],
      textColor: [110, 231, 183],
      fontStyle: "bold",
      fontSize: 8.5,
    },
    styles: { fontSize: 8.5, cellPadding: 2 },
    columnStyles: {
      0: { halign: "right", cellWidth: 10 },
      1: { halign: "right", cellWidth: 11 },
      2: { halign: "right", cellWidth: 10 },
      3: { halign: "right" },
      4: { halign: "right" },
      5: { halign: "right" },
      6: { halign: "right" },
      7: { halign: "right" },
      8: { halign: "right", fontStyle: "bold" },
    },
    didParseCell(data) {
      if (data.section !== "body") return;
      const row = projectionData[data.row.index];
      const prev = projectionData[data.row.index - 1];
      if (row?.raFormed && !prev?.raFormed) {
        // Highlight the RA-formation row in soft violet
        data.cell.styles.fillColor = [237, 233, 254];
        data.cell.styles.textColor = [79, 40, 180];
      }
    },
    margin: { left: M, right: M },
  });

  // ─── Footer on every page ────────────────────────────────────────────────
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(150);
    doc.text(
      "RetireCalculator · Estimates only — verify at cpf.gov.sg · Not financial advice",
      M,
      doc.internal.pageSize.height - 7,
    );
    doc.text(`${i} / ${totalPages}`, W - M, doc.internal.pageSize.height - 7, { align: "right" });
  }

  const filename = `cpf-projection-age${age}-${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}
