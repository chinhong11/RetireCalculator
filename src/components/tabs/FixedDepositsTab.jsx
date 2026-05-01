import { useState, useEffect, useMemo } from "react";
import { calcFd, FD_EMPTY } from "../../lib/finance.js";
import { downloadBlob, toCsv } from "../../lib/backup.js";

export default function FixedDepositsTab() {
  const [deposits, setDeposits] = useState(() => {
    try {
      const s = localStorage.getItem("fd_v1");
      if (s) { const d = JSON.parse(s); if (Array.isArray(d)) return d; }
    } catch {}
    return [];
  });
  const [form, setForm] = useState({ ...FD_EMPTY });
  const [editId, setEditId] = useState(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    try { localStorage.setItem("fd_v1", JSON.stringify(deposits)); } catch {}
  }, [deposits]);

  const fmtRM = v => "RM " + v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  const resetForm = () => { setForm({ ...FD_EMPTY }); setEditId(null); setShowForm(false); };

  const handleSave = () => {
    if (!form.bank || !form.principal || !form.rate || !form.tenureMonths) return;
    if (editId !== null) {
      setDeposits(d => d.map(x => x.id === editId ? { ...form, id: editId } : x));
    } else {
      setDeposits(d => [...d, { ...form, id: Date.now() }]);
    }
    resetForm();
  };

  const handleEdit = (dep) => { setForm({ ...dep }); setEditId(dep.id); setShowForm(true); };
  const handleDelete = (id) => setDeposits(d => d.filter(x => x.id !== id));

  const totals = useMemo(() => {
    let principal = 0, interest = 0, maturity = 0;
    deposits.forEach(fd => {
      const c = calcFd(fd);
      if (!c) return;
      principal += parseFloat(fd.principal) || 0;
      interest += c.interest;
      maturity += c.maturityValue;
    });
    return { principal, interest, maturity };
  }, [deposits]);

  const inputStyle = {
    background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 8,
    padding: "6px 10px", color: "var(--text)", fontSize: 13, width: "100%",
  };
  const cardStyle = { borderRadius: 12, padding: "14px 18px", background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)" };
  const FD_COLOR = "#34d399";
  const INT_COLOR = "#f59e0b";

  const exportCsv = () => {
    const rows = deposits.map(fd => {
      const c = calcFd(fd) || {};
      return {
        Bank: fd.bank,
        "Principal (RM)": parseFloat(fd.principal) || 0,
        "Rate (% p.a.)": parseFloat(fd.rate) || 0,
        "Tenure (months)": fd.tenureMonths,
        "Start Date": fd.startDate || "",
        "Maturity Date": c.maturityDate || "",
        "Interest Earned (RM)": (c.interest || 0).toFixed(2),
        "Maturity Value (RM)": (c.maturityValue || 0).toFixed(2),
        Notes: fd.notes || "",
      };
    });
    downloadBlob(
      `fixed-deposits-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(rows), "text/csv"
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

      {deposits.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
          {[
            { label: "Total Principal", value: totals.principal, color: FD_COLOR },
            { label: "Total Interest", value: totals.interest, color: INT_COLOR },
            { label: "Total at Maturity", value: totals.maturity, color: "#fff" },
            { label: "Avg Rate", value: null, extra: deposits.length > 0 ? (deposits.reduce((s, fd) => s + (parseFloat(fd.rate) || 0), 0) / deposits.length).toFixed(2) + "% p.a." : "—", color: "#818cf8" },
          ].map(({ label, value, extra, color }) => (
            <div key={label} style={{ ...cardStyle, textAlign: "center" }}>
              <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 6 }}>{label}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color }}>{extra ?? fmtRM(value)}</div>
            </div>
          ))}
        </div>
      )}

      <div style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: showForm ? 14 : 0 }}>
          <div style={{ fontSize: 12, color: "var(--label)", fontWeight: 600 }}>{editId !== null ? "Edit Deposit" : "Add Fixed Deposit"}</div>
          <button
            onClick={() => { if (showForm && editId === null) resetForm(); else setShowForm(v => !v); }}
            style={{ background: showForm ? "rgba(255,255,255,0.06)" : FD_COLOR, color: showForm ? "var(--muted)" : "#000", border: "none", borderRadius: 8, padding: "5px 14px", fontSize: 12, cursor: "pointer", fontWeight: 600 }}
          >{showForm ? "✕ Cancel" : "+ Add"}</button>
        </div>
        {showForm && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>Bank / Institution *</div>
              <input placeholder="e.g. Maybank" value={form.bank} onChange={e => setForm(f => ({ ...f, bank: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>Principal (RM) *</div>
              <input type="number" min={0} placeholder="50000" value={form.principal} onChange={e => setForm(f => ({ ...f, principal: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>Interest Rate (% p.a.) *</div>
              <input type="number" min={0} max={30} step={0.01} placeholder="3.85" value={form.rate} onChange={e => setForm(f => ({ ...f, rate: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>Tenure (months) *</div>
              <select value={form.tenureMonths} onChange={e => setForm(f => ({ ...f, tenureMonths: e.target.value }))} style={inputStyle}>
                {[1, 2, 3, 6, 9, 12, 18, 24, 36, 48, 60].map(m => (
                  <option key={m} value={m}>{m} month{m !== 1 ? "s" : ""}</option>
                ))}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>Start Date</div>
              <input type="month" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>Notes</div>
              <input placeholder="e.g. auto-renew" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={inputStyle} />
            </div>
            <div style={{ display: "flex", alignItems: "flex-end" }}>
              <button
                onClick={handleSave}
                disabled={!form.bank || !form.principal || !form.rate || !form.tenureMonths}
                style={{ width: "100%", padding: "8px 0", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13, background: FD_COLOR, color: "#000", opacity: (!form.bank || !form.principal || !form.rate) ? 0.4 : 1 }}
              >{editId !== null ? "Save Changes" : "Add Deposit"}</button>
            </div>
          </div>
        )}
      </div>

      {showForm && form.principal && form.rate && form.tenureMonths && (() => {
        const c = calcFd(form);
        if (!c) return null;
        return (
          <div style={{ ...cardStyle, background: "rgba(52,211,153,0.06)", border: "1px solid rgba(52,211,153,0.25)" }}>
            <div style={{ fontSize: 11, color: FD_COLOR, fontWeight: 600, marginBottom: 10 }}>Preview</div>
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
              <div><div style={{ fontSize: 10, color: "var(--muted)" }}>Interest Earned</div><div style={{ fontSize: 16, fontWeight: 700, color: INT_COLOR }}>{fmtRM(c.interest)}</div></div>
              <div><div style={{ fontSize: 10, color: "var(--muted)" }}>Maturity Value</div><div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>{fmtRM(c.maturityValue)}</div></div>
              {c.maturityDate && <div><div style={{ fontSize: 10, color: "var(--muted)" }}>Matures</div><div style={{ fontSize: 16, fontWeight: 700, color: FD_COLOR }}>{c.maturityDate}</div></div>}
            </div>
          </div>
        );
      })()}

      {deposits.length > 0 && (
        <div style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: "var(--label)", fontWeight: 600 }}>Your Fixed Deposits</div>
            <button onClick={exportCsv} style={{ background: "rgba(255,255,255,0.06)", color: "var(--muted)", border: "1px solid var(--border)", borderRadius: 8, padding: "4px 12px", fontSize: 11, cursor: "pointer" }}>⬇ CSV</button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {deposits.map(fd => {
              const c = calcFd(fd);
              const p = parseFloat(fd.principal) || 0;
              return (
                <div key={fd.id} style={{ borderRadius: 10, padding: "12px 14px", background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 700, fontSize: 14, color: FD_COLOR }}>{fd.bank}</span>
                        <span style={{ fontSize: 12, color: "var(--muted)" }}>{fd.tenureMonths}mo @ {fd.rate}% p.a.</span>
                        {fd.notes && <span style={{ fontSize: 11, color: "var(--muted)", fontStyle: "italic" }}>{fd.notes}</span>}
                      </div>
                      <div style={{ display: "flex", gap: 18, marginTop: 8, flexWrap: "wrap" }}>
                        <div>
                          <div style={{ fontSize: 10, color: "var(--muted)" }}>Principal</div>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{fmtRM(p)}</div>
                        </div>
                        {c && <>
                          <div>
                            <div style={{ fontSize: 10, color: "var(--muted)" }}>Interest</div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: INT_COLOR }}>+{fmtRM(c.interest)}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: 10, color: "var(--muted)" }}>Maturity Value</div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>{fmtRM(c.maturityValue)}</div>
                          </div>
                          {c.maturityDate && (
                            <div>
                              <div style={{ fontSize: 10, color: "var(--muted)" }}>Matures</div>
                              <div style={{ fontSize: 13, fontWeight: 600, color: FD_COLOR }}>{c.maturityDate}</div>
                            </div>
                          )}
                        </>}
                      </div>
                      {c && p > 0 && (
                        <div style={{ marginTop: 10 }}>
                          <div style={{ height: 6, borderRadius: 4, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                            <div style={{ height: "100%", borderRadius: 4, background: INT_COLOR, width: `${Math.min(100, (c.interest / c.maturityValue) * 100 * 3)}%`, transition: "width 0.3s" }} />
                          </div>
                          <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 3 }}>
                            {((c.interest / p) * 100).toFixed(2)}% total return over {fd.tenureMonths} months
                          </div>
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <button onClick={() => handleEdit(fd)} style={{ background: "rgba(255,255,255,0.06)", color: "var(--muted)", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 10px", fontSize: 11, cursor: "pointer" }}>✎</button>
                      <button onClick={() => handleDelete(fd.id)} style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 6, padding: "4px 10px", fontSize: 11, cursor: "pointer" }}>✕</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {deposits.length === 0 && !showForm && (
        <div style={{ textAlign: "center", color: "var(--muted)", fontSize: 13, padding: "40px 0" }}>
          No fixed deposits yet. Click <strong style={{ color: FD_COLOR }}>+ Add</strong> to get started.
        </div>
      )}

      <div style={{ padding: "12px 16px", borderRadius: 10, background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", fontSize: 11, color: "var(--muted)", lineHeight: 1.7 }}>
        <strong style={{ color: "var(--label)" }}>Note:</strong> Interest calculated using simple interest: <em>Principal × Rate × (Tenure / 12)</em>. This matches how most Malaysian banks calculate FD interest. All values in MYR. For personal record-keeping only — not financial advice.
      </div>
    </div>
  );
}
