import { useState, useMemo, useEffect } from "react";
import { RM, RM2, calcInstallment, uid, newProperty } from "../../lib/finance.js";
import { toCsv, downloadBlob, printTable } from "../../lib/backup.js";
import { StatCard } from "../shared/StatCard.jsx";
import { LabelField } from "../shared/LabelField.jsx";

export default function HousingLoanTab() {
  const [properties, setProperties] = useState(() => {
    try {
      const s = localStorage.getItem("hl_props_v1");
      if (s) { const p = JSON.parse(s); if (Array.isArray(p) && p.length) return p; }
    } catch {}
    return [newProperty()];
  });

  const [selId, setSelId] = useState(() => {
    try { return localStorage.getItem("hl_selid_v1") || null; } catch { return null; }
  });

  const [dpForm, setDpForm] = useState({ date: "", amount: "", note: "" });
  const [prForm, setPrForm] = useState({ month: "", claimAmount: "", stage: "", note: "" });
  const [showAmort, setShowAmort] = useState(false);
  const [amortYear, setAmortYear] = useState(1);

  useEffect(() => {
    try { localStorage.setItem("hl_props_v1", JSON.stringify(properties)); } catch {}
  }, [properties]);

  useEffect(() => {
    if (selId) try { localStorage.setItem("hl_selid_v1", selId); } catch {}
  }, [selId]);

  const effectiveId = (properties.find(p => p.id === selId) ? selId : properties[0]?.id) || null;
  const prop = properties.find(p => p.id === effectiveId) || null;

  const upd = (updates) => setProperties(ps => ps.map(p => p.id === effectiveId ? { ...p, ...updates } : p));

  const addProp = () => {
    const np = newProperty();
    setProperties(ps => [...ps, np]);
    setSelId(np.id);
  };

  const delProp = () => {
    if (!window.confirm(`Delete "${prop?.name}"? This cannot be undone.`)) return;
    setProperties(ps => {
      const next = ps.filter(p => p.id !== effectiveId);
      const fallback = next.length ? next : [newProperty()];
      setSelId(fallback[0].id);
      return fallback;
    });
  };

  const addDP = () => {
    if (!prop || !dpForm.date || !dpForm.amount) return;
    const rec = { id: uid(), date: dpForm.date, amount: parseFloat(dpForm.amount) || 0, note: dpForm.note.trim() };
    upd({ downpaymentRecords: [...(prop.downpaymentRecords || []), rec].sort((a, b) => a.date.localeCompare(b.date)) });
    setDpForm({ date: "", amount: "", note: "" });
  };

  const delDP = (recId) => prop && upd({ downpaymentRecords: prop.downpaymentRecords.filter(r => r.id !== recId) });

  const addPR = () => {
    if (!prop || !prForm.month || !prForm.claimAmount) return;
    const rec = { id: uid(), month: prForm.month, claimAmount: parseFloat(prForm.claimAmount) || 0, stage: prForm.stage.trim(), note: prForm.note.trim() };
    upd({ progressiveRecords: [...(prop.progressiveRecords || []), rec].sort((a, b) => a.month.localeCompare(b.month)) });
    setPrForm({ month: "", claimAmount: "", stage: "", note: "" });
  };

  const delPR = (recId) => prop && upd({ progressiveRecords: prop.progressiveRecords.filter(r => r.id !== recId) });

  const totalDownpaid = useMemo(() =>
    (prop?.downpaymentRecords || []).reduce((s, r) => s + (r.amount || 0), 0), [prop]);

  const loanAmount = Math.max(0, (prop?.purchasePrice || 0) - totalDownpaid);
  const monthlyInstallment = calcInstallment(loanAmount, prop?.interestRate || 0, prop?.tenure || 0);
  const totalPayable = monthlyInstallment * (prop?.tenure || 0) * 12;
  const totalInterest = Math.max(0, totalPayable - loanAmount);

  const progressiveTimeline = useMemo(() => {
    if (!prop) return [];
    const r = (prop.interestRate || 0) / 100 / 12;
    let cum = 0;
    return (prop.progressiveRecords || []).map(rec => {
      cum += rec.claimAmount || 0;
      return { ...rec, cumulative: cum, monthlyInterest: cum * r };
    });
  }, [prop]);

  const totalProgInterest = progressiveTimeline.reduce((s, r) => s + r.monthlyInterest, 0);

  const amortSchedule = useMemo(() => {
    if (!loanAmount || !prop?.interestRate || !prop?.tenure || !monthlyInstallment) return [];
    const r = prop.interestRate / 100 / 12;
    const n = prop.tenure * 12;
    let balance = loanAmount;

    // Derive the first repayment month from property dates
    const refStr = prop.type === "under_construction" ? prop.vpDate : prop.spaDate;
    let startDate = refStr ? new Date(refStr + "-01") : null;
    if (startDate && prop.type !== "under_construction") {
      // Completed/subsale: loan starts ~1 month after SPA
      startDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 1);
    }

    return Array.from({ length: n }, (_, idx) => {
      const i = idx + 1;
      const interest = balance * r;
      const principal = Math.min(monthlyInstallment - interest, balance);
      const closing = Math.max(0, balance - principal);
      let dateStr = "";
      if (startDate) {
        const d = new Date(startDate.getFullYear(), startDate.getMonth() + idx, 1);
        dateStr = d.toLocaleDateString("en-MY", { month: "short", year: "numeric" });
      }
      const row = { month: i, year: Math.ceil(i / 12), date: dateStr, opening: balance, principal, interest, closing };
      balance = closing;
      return row;
    });
  }, [loanAmount, prop?.interestRate, prop?.tenure, monthlyInstallment, prop?.vpDate, prop?.spaDate, prop?.type]);

  const amortTotalInterest = amortSchedule.reduce((s, r) => s + r.interest, 0);
  const amortTotalPrincipal = amortSchedule.reduce((s, r) => s + r.principal, 0);
  const amortHasDate = amortSchedule.length > 0 && !!amortSchedule[0].date;
  const amortYearRows = amortSchedule.filter(r => r.year === amortYear);
  const amortYearInterest = amortYearRows.reduce((s, r) => s + r.interest, 0);
  const amortYearPrincipal = amortYearRows.reduce((s, r) => s + r.principal, 0);

  if (!prop) return null;

  const exportHousingCsv = () => {
    const summaryRows = properties.map(p => {
      const dp = (p.downpaymentRecords || []).reduce((s, r) => s + (r.amount || 0), 0);
      const loan = Math.max(0, p.purchasePrice - dp);
      const inst = calcInstallment(loan, p.interestRate || 0, p.tenure || 0);
      return {
        Property: p.name, Developer: p.developer, Address: p.address,
        Type: p.type, "Purchase Price (MYR)": p.purchasePrice,
        "Interest Rate (%)": p.interestRate, "Tenure (yrs)": p.tenure,
        "SPA Date": p.spaDate, "VP Date": p.vpDate,
        "Total Downpaid (MYR)": dp.toFixed(2),
        "Loan Amount (MYR)": loan.toFixed(2),
        "Monthly Installment (MYR)": inst.toFixed(2),
      };
    });
    const dpRows = properties.flatMap(p =>
      (p.downpaymentRecords || []).map(r => ({
        Property: p.name, Date: r.date, "Amount (MYR)": r.amount.toFixed(2), Note: r.note,
      }))
    );
    const prRows = properties.flatMap(p =>
      (p.progressiveRecords || []).map(r => ({
        Property: p.name, Month: r.month, "Claim Amount (MYR)": r.claimAmount.toFixed(2),
        Stage: r.stage, Note: r.note,
      }))
    );
    let csv = "=== Property Summary ===\n" + toCsv(summaryRows);
    if (dpRows.length) csv += "\n\n=== Downpayment Records ===\n" + toCsv(dpRows);
    if (prRows.length) csv += "\n\n=== Progressive Disbursement Records ===\n" + toCsv(prRows);
    downloadBlob(`housing-records-${new Date().toISOString().slice(0, 10)}.csv`, csv, "text/csv");
  };

  const exportHousingPdf = () => {
    const sections = [
      {
        heading: "Property Summary",
        headers: ["Property", "Purchase Price (MYR)", "Downpaid (MYR)", "Loan (MYR)", "Rate", "Tenure", "Monthly Installment"],
        rows: properties.map(p => {
          const dp = (p.downpaymentRecords || []).reduce((s, r) => s + (r.amount || 0), 0);
          const loan = Math.max(0, p.purchasePrice - dp);
          const inst = calcInstallment(loan, p.interestRate || 0, p.tenure || 0);
          return [p.name, RM(p.purchasePrice), RM(dp), RM(loan), `${p.interestRate}%`, `${p.tenure} yrs`, RM2(inst)];
        }),
      },
    ];
    properties.forEach(p => {
      if ((p.downpaymentRecords || []).length) {
        sections.push({
          heading: `${p.name} — Downpayment Records`,
          headers: ["Date", "Amount (MYR)", "Note"],
          rows: p.downpaymentRecords.map(r => [r.date, RM2(r.amount), r.note]),
        });
      }
      if ((p.progressiveRecords || []).length) {
        sections.push({
          heading: `${p.name} — Progressive Disbursement`,
          headers: ["Month", "Claim (MYR)", "Stage", "Note"],
          rows: p.progressiveRecords.map(r => [r.month, RM2(r.claimAmount), r.stage, r.note]),
        });
      }
    });
    printTable("Housing Records", sections);
  };

  const addBtnStyle = {
    padding: "8px 18px", borderRadius: 8, background: "rgba(110,231,183,0.12)",
    color: "var(--accent)", border: "1px solid rgba(110,231,183,0.25)",
    cursor: "pointer", fontWeight: 600, fontSize: 13, fontFamily: "inherit", whiteSpace: "nowrap",
  };

  const exportAmortCsv = () => {
    const rows = amortSchedule.map(r => ({
      Month: r.month, ...(amortHasDate ? { Date: r.date } : {}),
      "Opening Balance (MYR)": r.opening.toFixed(2),
      "Principal (MYR)": r.principal.toFixed(2),
      "Interest (MYR)": r.interest.toFixed(2),
      "Closing Balance (MYR)": r.closing.toFixed(2),
    }));
    downloadBlob(
      `amortization-${prop.name.replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(rows), "text/csv"
    );
  };

  const exportBtnStyle = {
    padding: "6px 12px", borderRadius: 7, border: "1px solid var(--border)",
    background: "rgba(255,255,255,0.04)", color: "var(--label)", fontSize: 11,
    fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
  };

  return (
    <div>
      {/* Property Selector */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 20 }}>
        {properties.map(p => (
          <button key={p.id} onClick={() => setSelId(p.id)} className={`pr-chip ${p.id === effectiveId ? "selected" : ""}`}>
            🏠 {p.name}
          </button>
        ))}
        <button onClick={addProp} className="pr-chip" style={{ color: "var(--accent)", borderColor: "rgba(110,231,183,0.3)" }}>
          + Add Property
        </button>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button style={exportBtnStyle} onClick={exportHousingCsv}>↓ CSV</button>
          <button style={exportBtnStyle} onClick={exportHousingPdf}>⎙ PDF</button>
        </div>
      </div>

      {/* Property Details Form */}
      <div style={{ background: "var(--card-bg)", borderRadius: 16, padding: 24, border: "1px solid var(--border)", marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div className="section-title" style={{ margin: 0 }}>Property Details</div>
          <button onClick={delProp} style={{ padding: "5px 14px", borderRadius: 8, background: "rgba(248,113,113,0.1)", color: "#f87171", border: "1px solid rgba(248,113,113,0.2)", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit" }}>
            Delete Property
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 14 }}>
          <LabelField label="Property Name">
            <input className="hl-in" value={prop.name} onChange={e => upd({ name: e.target.value })} placeholder="e.g. Residensi Tropika Unit A-12-3" />
          </LabelField>
          <LabelField label="Developer / Vendor">
            <input className="hl-in" value={prop.developer} onChange={e => upd({ developer: e.target.value })} placeholder="Developer or seller name" />
          </LabelField>
          <LabelField label="Address">
            <input className="hl-in" value={prop.address || ""} onChange={e => upd({ address: e.target.value })} placeholder="Property address" />
          </LabelField>
          <LabelField label="Property Type">
            <select className="hl-in" value={prop.type} onChange={e => upd({ type: e.target.value })}>
              <option value="under_construction">Under Construction (Dalam Pembinaan)</option>
              <option value="completed">Completed / Subsale</option>
            </select>
          </LabelField>
          <LabelField label="Purchase Price (RM)">
            <input className="hl-in" type="number" value={prop.purchasePrice} onChange={e => upd({ purchasePrice: parseFloat(e.target.value) || 0 })} min={0} step={1000} style={{ fontFamily: "'DM Mono', monospace" }} />
          </LabelField>
          <LabelField label="Interest Rate (% p.a.)">
            <input className="hl-in" type="number" value={prop.interestRate} onChange={e => upd({ interestRate: parseFloat(e.target.value) || 0 })} min={0} max={20} step={0.05} style={{ fontFamily: "'DM Mono', monospace" }} />
          </LabelField>
          <LabelField label="Loan Tenure (Years)">
            <input className="hl-in" type="number" value={prop.tenure} onChange={e => upd({ tenure: parseInt(e.target.value) || 0 })} min={1} max={35} step={1} style={{ fontFamily: "'DM Mono', monospace" }} />
          </LabelField>
          <LabelField label="SPA Date">
            <input className="hl-in" type="date" value={prop.spaDate} onChange={e => upd({ spaDate: e.target.value })} />
          </LabelField>
          <LabelField label={prop.type === "under_construction" ? "Expected VP / Handover Date" : "Completion / Key Date"}>
            <input className="hl-in" type="date" value={prop.vpDate} onChange={e => upd({ vpDate: e.target.value })} />
          </LabelField>
        </div>
      </div>

      {/* Loan Summary Cards */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
        <StatCard label="Purchase Price" value={RM(prop.purchasePrice)} color="#e8eaf0" />
        <StatCard label="Downpayment Paid" value={RM(totalDownpaid)} sub={prop.purchasePrice > 0 ? `${((totalDownpaid / prop.purchasePrice) * 100).toFixed(1)}% of price` : "—"} color="var(--accent)" />
        <StatCard label="Loan Amount" value={RM(loanAmount)} sub={prop.purchasePrice > 0 ? `${((loanAmount / prop.purchasePrice) * 100).toFixed(1)}% financing` : "—"} color="var(--accent2)" />
        <StatCard label="Monthly Installment" value={RM2(monthlyInstallment)} sub={`${prop.tenure}yr @ ${prop.interestRate}% p.a.`} color="#f472b6" />
        <StatCard label="Total Payable" value={RM(totalPayable)} sub="Over full tenure" color="#fbbf24" />
        <StatCard label="Total Interest" value={RM(totalInterest)} sub={loanAmount > 0 ? `${((totalInterest / loanAmount) * 100).toFixed(1)}% of loan` : "—"} color="#f87171" />
      </div>

      {/* Amortization Schedule */}
      {loanAmount > 0 && prop.tenure > 0 && (
        <div style={{ background: "var(--card-bg)", borderRadius: 16, border: "1px solid var(--border)", marginBottom: 20, overflow: "hidden" }}>
          {/* Header row */}
          <div style={{ padding: "20px 24px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div className="section-title" style={{ margin: 0, marginBottom: 4 }}>Amortization Schedule</div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                {prop.tenure * 12} monthly payments · {RM2(monthlyInstallment)}/month
                {amortHasDate && amortSchedule[0]?.date && ` · Starting ${amortSchedule[0].date}`}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {showAmort && (
                <button style={exportBtnStyle} onClick={exportAmortCsv}>↓ CSV</button>
              )}
              <button
                onClick={() => setShowAmort(s => !s)}
                style={{ ...exportBtnStyle, color: showAmort ? "var(--accent)" : "var(--label)", borderColor: showAmort ? "rgba(110,231,183,0.3)" : "var(--border)" }}
              >
                {showAmort ? "▲ Hide" : "▼ Show Schedule"}
              </button>
            </div>
          </div>

          {showAmort && (
            <>
              {/* Lifetime summary mini-cards */}
              <div style={{ display: "flex", gap: 12, padding: "0 24px 20px", flexWrap: "wrap" }}>
                {[
                  { label: "Total Principal", val: RM(amortTotalPrincipal), color: "var(--accent)" },
                  { label: "Total Interest", val: RM(amortTotalInterest), color: "#f87171" },
                  { label: "Interest / Loan", val: loanAmount > 0 ? `${((amortTotalInterest / loanAmount) * 100).toFixed(1)}%` : "—", color: "#fbbf24" },
                  { label: "Total Cost", val: RM(amortTotalPrincipal + amortTotalInterest), color: "#e8eaf0" },
                ].map(({ label, val, color }) => (
                  <div key={label} style={{ flex: "1 1 120px", padding: "12px 16px", borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)" }}>
                    <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600, marginBottom: 4 }}>{label}</div>
                    <div style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 15, color }}>{val}</div>
                  </div>
                ))}
              </div>

              {/* Year selector */}
              <div style={{ padding: "0 24px 16px", display: "flex", gap: 6, flexWrap: "wrap" }}>
                {Array.from({ length: prop.tenure }, (_, i) => i + 1).map(y => (
                  <button
                    key={y}
                    onClick={() => setAmortYear(y)}
                    style={{
                      padding: "4px 12px", borderRadius: 6, border: "1px solid",
                      borderColor: amortYear === y ? "rgba(110,231,183,0.35)" : "var(--border)",
                      background: amortYear === y ? "rgba(110,231,183,0.1)" : "transparent",
                      color: amortYear === y ? "var(--accent)" : "var(--muted)",
                      fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                    }}
                  >
                    Yr {y}
                  </button>
                ))}
              </div>

              {/* Table */}
              <div style={{ borderTop: "1px solid var(--border)", overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "rgba(255,255,255,0.02)" }}>
                      {[
                        ["Mo.", "center"],
                        ...(amortHasDate ? [["Date", "left"]] : []),
                        ["Opening Balance", "right"],
                        ["Principal", "right"],
                        ["Interest", "right"],
                        ["Closing Balance", "right"],
                      ].map(([h, align]) => (
                        <th key={h} style={{ padding: "10px 14px", textAlign: align, fontSize: 11, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap", borderBottom: "1px solid var(--border)" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {amortYearRows.map((r, i) => (
                      <tr key={r.month} style={{ borderBottom: "1px solid var(--border)", background: i % 2 ? "rgba(255,255,255,0.01)" : "transparent" }}>
                        <td style={{ padding: "9px 14px", textAlign: "center", color: "var(--muted)", fontFamily: "'DM Mono', monospace", fontSize: 12 }}>{r.month}</td>
                        {amortHasDate && <td style={{ padding: "9px 14px", color: "var(--label)", whiteSpace: "nowrap", fontSize: 12 }}>{r.date}</td>}
                        <td style={{ padding: "9px 14px", textAlign: "right", fontFamily: "'DM Mono', monospace", color: "var(--label)" }}>{RM2(r.opening)}</td>
                        <td style={{ padding: "9px 14px", textAlign: "right", fontFamily: "'DM Mono', monospace", fontWeight: 600, color: "var(--accent)" }}>{RM2(r.principal)}</td>
                        <td style={{ padding: "9px 14px", textAlign: "right", fontFamily: "'DM Mono', monospace", color: "#f87171" }}>{RM2(r.interest)}</td>
                        <td style={{ padding: "9px 14px", textAlign: "right", fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>{RM2(r.closing)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: "2px solid var(--border)", background: "rgba(255,255,255,0.02)" }}>
                      <td colSpan={amortHasDate ? 3 : 2} style={{ padding: "10px 14px", fontWeight: 700, color: "var(--label)", fontSize: 12 }}>Year {amortYear} Totals</td>
                      <td style={{ padding: "10px 14px", textAlign: "right", fontFamily: "'DM Mono', monospace", fontWeight: 800, color: "var(--accent)" }}>{RM2(amortYearPrincipal)}</td>
                      <td style={{ padding: "10px 14px", textAlign: "right", fontFamily: "'DM Mono', monospace", fontWeight: 800, color: "#f87171" }}>{RM2(amortYearInterest)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* Downpayment Records */}
      <div style={{ background: "var(--card-bg)", borderRadius: 16, padding: 24, border: "1px solid var(--border)", marginBottom: 20 }}>
        <div className="section-title">Downpayment Records</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16, alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 130px" }}>
            <label style={{ fontSize: 11, color: "var(--label)", display: "block", marginBottom: 4 }}>Date</label>
            <input className="hl-in" type="date" value={dpForm.date} onChange={e => setDpForm(f => ({ ...f, date: e.target.value }))} />
          </div>
          <div style={{ flex: "1 1 140px" }}>
            <label style={{ fontSize: 11, color: "var(--label)", display: "block", marginBottom: 4 }}>Amount (RM)</label>
            <input className="hl-in" type="number" placeholder="e.g. 50000" value={dpForm.amount} onChange={e => setDpForm(f => ({ ...f, amount: e.target.value }))} min={0} step={100} style={{ fontFamily: "'DM Mono', monospace" }} />
          </div>
          <div style={{ flex: "2 1 200px" }}>
            <label style={{ fontSize: 11, color: "var(--label)", display: "block", marginBottom: 4 }}>Note</label>
            <input className="hl-in" placeholder="e.g. Booking fee / 10% downpayment" value={dpForm.note} onChange={e => setDpForm(f => ({ ...f, note: e.target.value }))} />
          </div>
          <button onClick={addDP} style={addBtnStyle}>+ Add</button>
        </div>
        {prop.downpaymentRecords.length > 0 ? (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {["Date", "Amount (RM)", "Note", "Running Total", ""].map(h => (
                    <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(() => {
                  let running = 0;
                  return prop.downpaymentRecords.map((r, i) => {
                    running += r.amount || 0;
                    return (
                      <tr key={r.id} style={{ borderBottom: "1px solid var(--border)", background: i % 2 ? "rgba(255,255,255,0.01)" : "transparent" }}>
                        <td style={{ padding: "10px 12px", color: "var(--label)", whiteSpace: "nowrap" }}>{r.date}</td>
                        <td style={{ padding: "10px 12px", fontFamily: "'DM Mono', monospace", fontWeight: 600, color: "var(--accent)" }}>{RM(r.amount)}</td>
                        <td style={{ padding: "10px 12px", color: "var(--text)" }}>{r.note || "—"}</td>
                        <td style={{ padding: "10px 12px", fontFamily: "'DM Mono', monospace", color: "var(--label)" }}>{RM(running)}</td>
                        <td style={{ padding: "10px 12px" }}>
                          <button onClick={() => delDP(r.id)} style={{ color: "#f87171", background: "none", border: "none", cursor: "pointer", fontSize: 14, padding: "2px 8px" }}>✕</button>
                        </td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "2px solid var(--border)" }}>
                  <td style={{ padding: "12px", fontWeight: 700, color: "var(--label)" }}>Total Paid</td>
                  <td colSpan={4} style={{ padding: "12px", fontFamily: "'DM Mono', monospace", fontWeight: 800, color: "var(--accent)", fontSize: 15 }}>{RM(totalDownpaid)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <div style={{ textAlign: "center", padding: "28px", color: "var(--muted)", fontSize: 13 }}>
            No downpayment records yet. Add your first entry above.
          </div>
        )}
      </div>

      {/* Progressive Interest (Under Construction only) */}
      {prop.type === "under_construction" && (
        <div style={{ background: "var(--card-bg)", borderRadius: 16, padding: 24, border: "1px solid var(--border)", marginBottom: 20 }}>
          <div className="section-title">Progressive Interest Records</div>
          <div style={{ fontSize: 12, color: "var(--label)", marginBottom: 16, lineHeight: 1.7, padding: "10px 14px", background: "rgba(110,231,183,0.05)", borderRadius: 8, border: "1px solid rgba(110,231,183,0.1)" }}>
            💡 For under-construction properties, the bank disburses funds to the developer stage by stage. You pay interest-only on the cumulative amount released. Add a record for each progress claim to track your monthly interest payments before VP (Vacant Possession).
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16, alignItems: "flex-end" }}>
            <div style={{ flex: "1 1 130px" }}>
              <label style={{ fontSize: 11, color: "var(--label)", display: "block", marginBottom: 4 }}>Month</label>
              <input className="hl-in" type="month" value={prForm.month} onChange={e => setPrForm(f => ({ ...f, month: e.target.value }))} />
            </div>
            <div style={{ flex: "1 1 140px" }}>
              <label style={{ fontSize: 11, color: "var(--label)", display: "block", marginBottom: 4 }}>Claim Amount (RM)</label>
              <input className="hl-in" type="number" placeholder="Amount disbursed" value={prForm.claimAmount} onChange={e => setPrForm(f => ({ ...f, claimAmount: e.target.value }))} min={0} step={1000} style={{ fontFamily: "'DM Mono', monospace" }} />
            </div>
            <div style={{ flex: "2 1 180px" }}>
              <label style={{ fontSize: 11, color: "var(--label)", display: "block", marginBottom: 4 }}>Construction Stage</label>
              <input className="hl-in" placeholder="e.g. Foundation completed (10%)" value={prForm.stage} onChange={e => setPrForm(f => ({ ...f, stage: e.target.value }))} />
            </div>
            <div style={{ flex: "1 1 140px" }}>
              <label style={{ fontSize: 11, color: "var(--label)", display: "block", marginBottom: 4 }}>Note</label>
              <input className="hl-in" placeholder="Optional" value={prForm.note} onChange={e => setPrForm(f => ({ ...f, note: e.target.value }))} />
            </div>
            <button onClick={addPR} style={addBtnStyle}>+ Add</button>
          </div>
          {progressiveTimeline.length > 0 ? (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    {["Month", "Stage", "Claim (RM)", "Cumulative Disbursed", "Monthly Interest", "Note", ""].map(h => (
                      <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {progressiveTimeline.map((r, i) => (
                    <tr key={r.id} style={{ borderBottom: "1px solid var(--border)", background: i % 2 ? "rgba(255,255,255,0.01)" : "transparent" }}>
                      <td style={{ padding: "10px 12px", color: "var(--label)", whiteSpace: "nowrap" }}>{r.month}</td>
                      <td style={{ padding: "10px 12px", color: "var(--text)" }}>{r.stage || "—"}</td>
                      <td style={{ padding: "10px 12px", fontFamily: "'DM Mono', monospace", fontWeight: 600, color: "#818cf8" }}>{RM(r.claimAmount)}</td>
                      <td style={{ padding: "10px 12px", fontFamily: "'DM Mono', monospace", color: "var(--accent2)" }}>{RM(r.cumulative)}</td>
                      <td style={{ padding: "10px 12px", fontFamily: "'DM Mono', monospace", fontWeight: 700, color: "#f472b6" }}>{RM2(r.monthlyInterest)}</td>
                      <td style={{ padding: "10px 12px", color: "var(--muted)", fontSize: 12 }}>{r.note || "—"}</td>
                      <td style={{ padding: "10px 12px" }}>
                        <button onClick={() => delPR(r.id)} style={{ color: "#f87171", background: "none", border: "none", cursor: "pointer", fontSize: 14, padding: "2px 8px" }}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: "2px solid var(--border)" }}>
                    <td colSpan={4} style={{ padding: "12px", fontWeight: 700, color: "var(--label)" }}>Est. Total Interest During Construction</td>
                    <td style={{ padding: "12px", fontFamily: "'DM Mono', monospace", fontWeight: 800, color: "#f472b6", fontSize: 15 }}>{RM2(totalProgInterest)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "28px", color: "var(--muted)", fontSize: 13 }}>
              No progressive interest records yet. Add a claim when the developer bills for each construction stage.
            </div>
          )}
          {prop.vpDate && (
            <div style={{ marginTop: 16, padding: "12px 16px", borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)", fontSize: 12, color: "var(--label)", lineHeight: 1.6 }}>
              🔑 Expected VP: <strong style={{ color: "var(--accent)" }}>{prop.vpDate}</strong> — Full installments of <strong style={{ color: "var(--accent)" }}>{RM2(monthlyInstallment)}/month</strong> begin after key handover.
            </div>
          )}
        </div>
      )}

      <div style={{ padding: "14px 18px", borderRadius: 12, background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", fontSize: 11, color: "var(--muted)", lineHeight: 1.7 }}>
        <strong style={{ color: "var(--label)" }}>Note (Malaysia):</strong> Monthly installment uses the standard reducing balance (monthly rest) formula. Actual figures depend on your bank's Base Rate (BR), BLR-linked packages, lock-in periods, and rounding. Progressive interest is estimated at the entered rate on the cumulative disbursed amount. MRTA/MLTA premiums and legal fees are not included. Always refer to your loan agreement and bank for accurate figures.
      </div>
    </div>
  );
}
