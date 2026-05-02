import { useState, useMemo, useEffect } from "react";
import { RM, RM2, uid } from "../../lib/finance.js";
import { toCsv, downloadBlob, printTable } from "../../lib/backup.js";
import { StatCard } from "../shared/StatCard.jsx";
import { fetchYahooChart } from "../../lib/fetchPrice.js";

export default function MYStocksTab() {
  const [holdings, setHoldings] = useState(() => {
    try {
      const s = localStorage.getItem("mystocks_v1");
      if (s) { const h = JSON.parse(s); if (Array.isArray(h)) return h; }
    } catch {}
    return [];
  });

  const [prices, setPrices] = useState({});
  const [fetching, setFetching] = useState(new Set());
  const [fetchErrors, setFetchErrors] = useState({});
  const [form, setForm] = useState({ code: "", shares: "", avgCost: "", fees: "0", buyDate: "", notes: "" });
  const [refreshedAt, setRefreshedAt] = useState(null);
  const [editingPrice, setEditingPrice] = useState(new Set());
  const [manualInput, setManualInput] = useState({});

  useEffect(() => {
    try { localStorage.setItem("mystocks_v1", JSON.stringify(holdings)); } catch {}
  }, [holdings]);

  useEffect(() => {
    if (Object.keys(prices).length === 0) return;
    try { localStorage.setItem("mystocks_prices_v1", JSON.stringify(prices)); } catch {}
  }, [prices]);

  const toYahooTicker = (code) => {
    const c = code.toUpperCase().trim();
    return c.endsWith(".KL") ? c : c + ".KL";
  };

  const fetchPrice = async (code) => {
    const ticker = toYahooTicker(code);
    setFetching(s => new Set([...s, code]));
    setFetchErrors(e => { const n = { ...e }; delete n[code]; return n; });
    try {
      const { price, prevClose } = await fetchYahooChart(ticker);
      setPrices(p => ({ ...p, [code]: { price, prevClose, at: Date.now() } }));
    } catch (err) {
      setFetchErrors(e => ({ ...e, [code]: err.message || "Failed" }));
    }
    setFetching(s => { const n = new Set(s); n.delete(code); return n; });
  };

  const refreshAll = () => {
    const codes = [...new Set(holdings.map(h => h.code))];
    codes.forEach(fetchPrice);
    setRefreshedAt(Date.now());
  };

  const commitManual = (code) => {
    const val = parseFloat(manualInput[code]);
    if (!isNaN(val) && val > 0) {
      setPrices(p => ({ ...p, [code]: { price: val, prevClose: null, manual: true, at: Date.now() } }));
      setFetchErrors(e => { const n = { ...e }; delete n[code]; return n; });
    }
    setEditingPrice(s => { const n = new Set(s); n.delete(code); return n; });
    setManualInput(m => { const n = { ...m }; delete n[code]; return n; });
  };

  const startEditing = (code) => setEditingPrice(s => new Set([...s, code]));
  const cancelEditing = (code) => setEditingPrice(s => { const n = new Set(s); n.delete(code); return n; });

  const addHolding = () => {
    const code = form.code.toUpperCase().trim();
    if (!code || !form.shares || !form.avgCost) return;
    setHoldings(hs => [...hs, {
      id: uid(), code,
      shares: parseFloat(form.shares) || 0,
      avgCost: parseFloat(form.avgCost) || 0,
      totalFees: parseFloat(form.fees) || 0,
      buyDate: form.buyDate, notes: form.notes.trim(),
    }]);
    setForm({ code: "", shares: "", avgCost: "", fees: "0", buyDate: "", notes: "" });
  };

  const delHolding = (id) => setHoldings(hs => hs.filter(h => h.id !== id));

  const enriched = useMemo(() => holdings.map(h => {
    const cost = h.shares * h.avgCost + (h.totalFees || 0);
    const p = prices[h.code];
    const value = p ? h.shares * p.price : null;
    const pnl = value !== null ? value - cost : null;
    const pnlPct = cost > 0 && pnl !== null ? (pnl / cost) * 100 : null;
    return { ...h, cost, value, pnl, pnlPct, pd: p || null };
  }), [holdings, prices]);

  const totalCost = enriched.reduce((s, h) => s + h.cost, 0);
  const priced = enriched.filter(h => h.value !== null);
  const totalValue = priced.reduce((s, h) => s + h.value, 0);
  const totalPnl = priced.reduce((s, h) => s + h.pnl, 0);
  const totalPnlPct = totalCost > 0 && priced.length ? (totalPnl / totalCost) * 100 : null;
  const anyFetching = fetching.size > 0;

  const exportMyStocksCsv = () => {
    const rows = enriched.map(h => ({
      Code: h.code, Shares: h.shares, "Buy Price (MYR)": h.avgCost.toFixed(4),
      "Fees (MYR)": (h.totalFees || 0).toFixed(2), "Total Cost (MYR)": h.cost.toFixed(2),
      "Current Price (MYR)": h.pd ? h.pd.price.toFixed(4) : "",
      "Market Value (MYR)": h.value != null ? h.value.toFixed(2) : "",
      "P&L (MYR)": h.pnl != null ? h.pnl.toFixed(2) : "",
      "P&L (%)": h.pnlPct != null ? h.pnlPct.toFixed(2) : "",
      "Buy Date": h.buyDate, Notes: h.notes,
    }));
    downloadBlob(`bursa-stocks-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows), "text/csv");
  };

  const exportMyStocksPdf = () => printTable("Bursa Malaysia Stock Portfolio", [{
    headers: ["Code", "Shares", "Buy Price (MYR)", "Fees", "Total Cost", "Current Price", "Value", "P&L (MYR)", "P&L %", "Buy Date"],
    rows: enriched.map(h => [
      h.code, h.shares, RM2(h.avgCost), RM2(h.totalFees || 0), RM(h.cost),
      h.pd ? RM2(h.pd.price) : "—", h.value != null ? RM(h.value) : "—",
      h.pnl != null ? (h.pnl >= 0 ? "+" : "") + RM2(h.pnl) : "—",
      h.pnlPct != null ? (h.pnlPct >= 0 ? "+" : "") + h.pnlPct.toFixed(2) + "%" : "—",
      h.buyDate,
    ]),
  }]);

  const BLUE = "#38bdf8";
  const addBtnStyle = { padding: "8px 18px", borderRadius: 8, background: "rgba(56,189,248,0.12)", color: BLUE, border: "1px solid rgba(56,189,248,0.25)", cursor: "pointer", fontWeight: 600, fontSize: 13, fontFamily: "inherit", whiteSpace: "nowrap" };
  const exportBtnStyle = { padding: "6px 12px", borderRadius: 7, border: "1px solid var(--border)", background: "rgba(255,255,255,0.04)", color: "var(--label)", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };
  const thS = (align) => ({ padding: "12px 14px", textAlign: align, fontSize: 11, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" });
  const cols = [
    ["Stock", "left"], ["Shares", "right"], ["Buy Price", "right"], ["Fees", "right"],
    ["Total Cost", "right"], ["Current Price", "right"], ["Value", "right"],
    ["P&L (RM)", "right"], ["P&L %", "right"], ["", "right"],
  ];

  return (
    <div>
      {/* Summary */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
        <StatCard label="Total Invested" value={RM(totalCost)} sub="Cost basis incl. fees" color="#e8eaf0" />
        <StatCard
          label="Portfolio Value"
          value={priced.length ? RM(totalValue) : "—"}
          sub={priced.length < enriched.length && enriched.length > 0 ? `${priced.length}/${enriched.length} positions priced` : "Live prices"}
          color={BLUE}
        />
        <StatCard
          label="Total P&L"
          value={priced.length ? RM(totalPnl) : "—"}
          sub={totalPnlPct !== null ? `${totalPnl >= 0 ? "+" : ""}${totalPnlPct.toFixed(2)}% overall` : "Refresh to see"}
          color={totalPnl >= 0 ? "#4ade80" : "#f87171"}
        />
      </div>

      {/* Add Holding */}
      <div style={{ background: "var(--card-bg)", borderRadius: 16, padding: 24, border: "1px solid var(--border)", marginBottom: 20 }}>
        <div className="section-title">Add Holding</div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>
          Enter the Bursa Malaysia stock code (e.g. <strong style={{ color: "var(--label)" }}>1155</strong> for Maybank, <strong style={{ color: "var(--label)" }}>5347</strong> for Tenaga, <strong style={{ color: "var(--label)" }}>MAYBANK</strong>). The .KL suffix is added automatically.
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
          <div style={{ flex: "0 0 110px" }}>
            <label style={{ fontSize: 11, color: "var(--label)", display: "block", marginBottom: 4 }}>Stock Code</label>
            <input className="hl-in" style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, textTransform: "uppercase" }}
              placeholder="1155" value={form.code}
              onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
              onKeyDown={e => e.key === "Enter" && addHolding()} />
          </div>
          <div style={{ flex: "1 1 90px" }}>
            <label style={{ fontSize: 11, color: "var(--label)", display: "block", marginBottom: 4 }}>Shares</label>
            <input className="hl-in" type="number" placeholder="1000" value={form.shares}
              onChange={e => setForm(f => ({ ...f, shares: e.target.value }))} min={0} step={100}
              style={{ fontFamily: "'DM Mono', monospace" }} />
          </div>
          <div style={{ flex: "1 1 120px" }}>
            <label style={{ fontSize: 11, color: "var(--label)", display: "block", marginBottom: 4 }}>Buy Price (RM/share)</label>
            <input className="hl-in" type="number" placeholder="9.50" value={form.avgCost}
              onChange={e => setForm(f => ({ ...f, avgCost: e.target.value }))} min={0} step={0.005}
              style={{ fontFamily: "'DM Mono', monospace" }} />
          </div>
          <div style={{ flex: "1 1 90px" }}>
            <label style={{ fontSize: 11, color: "var(--label)", display: "block", marginBottom: 4 }}>Fees (RM)</label>
            <input className="hl-in" type="number" placeholder="0" value={form.fees}
              onChange={e => setForm(f => ({ ...f, fees: e.target.value }))} min={0} step={0.01}
              style={{ fontFamily: "'DM Mono', monospace" }} />
          </div>
          <div style={{ flex: "0 0 auto" }}>
            <label style={{ fontSize: 11, color: "var(--label)", display: "block", marginBottom: 4 }}>Buy Date</label>
            <input className="hl-in" type="date" style={{ width: 155 }} value={form.buyDate}
              onChange={e => setForm(f => ({ ...f, buyDate: e.target.value }))} />
          </div>
          <div style={{ flex: "2 1 160px" }}>
            <label style={{ fontSize: 11, color: "var(--label)", display: "block", marginBottom: 4 }}>Notes</label>
            <input className="hl-in" placeholder="Optional" value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
          <button onClick={addHolding} style={addBtnStyle}>+ Add</button>
        </div>
      </div>

      {/* Holdings Table */}
      {enriched.length > 0 ? (
        <div style={{ background: "var(--card-bg)", borderRadius: 16, border: "1px solid var(--border)", marginBottom: 20, overflow: "hidden" }}>
          <div style={{ padding: "20px 24px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
            <div className="section-title" style={{ margin: 0 }}>Holdings</div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {refreshedAt && (
                <span style={{ fontSize: 11, color: "var(--muted)" }}>
                  Updated {new Date(refreshedAt).toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
              <button onClick={refreshAll} disabled={anyFetching} style={{ padding: "6px 16px", borderRadius: 8, background: anyFetching ? "transparent" : "rgba(56,189,248,0.1)", color: anyFetching ? "var(--muted)" : BLUE, border: "1px solid rgba(56,189,248,0.2)", cursor: anyFetching ? "not-allowed" : "pointer", fontWeight: 600, fontSize: 12, fontFamily: "inherit" }}>
                {anyFetching ? "⟳ Fetching…" : "⟳ Refresh Prices"}
              </button>
              <button style={exportBtnStyle} onClick={exportMyStocksCsv}>↓ CSV</button>
              <button style={exportBtnStyle} onClick={exportMyStocksPdf}>⎙ PDF</button>
            </div>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {cols.map(([label, align]) => <th key={label} style={thS(align)}>{label}</th>)}
                </tr>
              </thead>
              <tbody>
                {enriched.map((h, i) => {
                  const isLoading = fetching.has(h.code);
                  const err = fetchErrors[h.code];
                  return (
                    <tr key={h.id} style={{ borderBottom: "1px solid var(--border)", background: i % 2 ? "rgba(255,255,255,0.01)" : "transparent" }}>
                      <td style={{ padding: "12px 14px" }}>
                        <div style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: BLUE, fontSize: 14 }}>{h.code}</div>
                        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>{toYahooTicker(h.code)}</div>
                        {h.buyDate && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>{h.buyDate}</div>}
                        {h.notes && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.notes}</div>}
                      </td>
                      <td style={{ padding: "12px 14px", textAlign: "right", fontFamily: "'DM Mono', monospace" }}>{h.shares.toLocaleString()}</td>
                      <td style={{ padding: "12px 14px", textAlign: "right", fontFamily: "'DM Mono', monospace" }}>{RM2(h.avgCost)}</td>
                      <td style={{ padding: "12px 14px", textAlign: "right", fontFamily: "'DM Mono', monospace", color: "var(--muted)" }}>{RM2(h.totalFees)}</td>
                      <td style={{ padding: "12px 14px", textAlign: "right", fontFamily: "'DM Mono', monospace" }}>{RM(h.cost)}</td>
                      <td style={{ padding: "12px 14px", textAlign: "right" }}>
                        {isLoading ? (
                          <span style={{ color: "var(--muted)", fontSize: 12 }}>Loading…</span>
                        ) : editingPrice.has(h.code) ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}>
                            <input
                              autoFocus type="number" step="0.0001" min="0" placeholder="0.00"
                              value={manualInput[h.code] || ""}
                              onChange={e => setManualInput(m => ({ ...m, [h.code]: e.target.value }))}
                              onKeyDown={e => { if (e.key === "Enter") commitManual(h.code); if (e.key === "Escape") cancelEditing(h.code); }}
                              style={{ width: 80, padding: "4px 7px", borderRadius: 6, border: `1px solid ${BLUE}`, background: "rgba(56,189,248,0.08)", color: "var(--text)", fontFamily: "'DM Mono', monospace", fontSize: 12, outline: "none" }}
                            />
                            <button onClick={() => commitManual(h.code)} style={{ color: BLUE, background: "none", border: "none", cursor: "pointer", fontSize: 15, padding: "2px 3px", lineHeight: 1 }} title="Confirm">✓</button>
                            <button onClick={() => cancelEditing(h.code)} style={{ color: "var(--muted)", background: "none", border: "none", cursor: "pointer", fontSize: 13, padding: "2px 3px", lineHeight: 1 }} title="Cancel">✕</button>
                          </div>
                        ) : err ? (
                          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                            <button onClick={() => fetchPrice(h.code)} style={{ color: "#f87171", background: "none", border: "none", cursor: "pointer", fontSize: 11, padding: 0 }} title={err}>⚠ Retry</button>
                            <button onClick={() => startEditing(h.code)} style={{ color: "var(--muted)", background: "none", border: "none", cursor: "pointer", fontSize: 11, padding: 0 }} title="Enter price manually">✎ Manual</button>
                          </div>
                        ) : h.pd ? (
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: 5, justifyContent: "flex-end" }}>
                              <div style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>{RM2(h.pd.price)}</div>
                              <button onClick={() => startEditing(h.code)} style={{ color: "var(--muted)", background: "none", border: "none", cursor: "pointer", fontSize: 11, padding: 0, opacity: 0.5, lineHeight: 1 }} title="Override price">✎</button>
                            </div>
                            {h.pd.manual ? (
                              <div style={{ fontSize: 10, color: "var(--muted)", fontStyle: "italic" }}>manual</div>
                            ) : h.pd.prevClose != null && (() => {
                              const chg = ((h.pd.price - h.pd.prevClose) / h.pd.prevClose) * 100;
                              return <div style={{ fontSize: 11, color: chg >= 0 ? "#4ade80" : "#f87171" }}>{chg >= 0 ? "▲" : "▼"} {Math.abs(chg).toFixed(2)}% today</div>;
                            })()}
                          </div>
                        ) : (
                          <div style={{ display: "flex", gap: 5, justifyContent: "flex-end" }}>
                            <button onClick={() => fetchPrice(h.code)} style={{ padding: "4px 10px", borderRadius: 6, background: "rgba(56,189,248,0.1)", color: BLUE, border: "1px solid rgba(56,189,248,0.2)", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>Fetch</button>
                            <button onClick={() => startEditing(h.code)} style={{ padding: "4px 8px", borderRadius: 6, background: "transparent", color: "var(--muted)", border: "1px solid var(--border)", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }} title="Enter price manually">✎</button>
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "12px 14px", textAlign: "right", fontFamily: "'DM Mono', monospace" }}>{h.value !== null ? RM(h.value) : "—"}</td>
                      <td style={{ padding: "12px 14px", textAlign: "right", fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>
                        {h.pnl !== null ? <span style={{ color: h.pnl >= 0 ? "#4ade80" : "#f87171" }}>{h.pnl >= 0 ? "+" : ""}{RM(h.pnl)}</span> : "—"}
                      </td>
                      <td style={{ padding: "12px 14px", textAlign: "right", fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>
                        {h.pnlPct !== null ? <span style={{ color: h.pnlPct >= 0 ? "#4ade80" : "#f87171" }}>{h.pnlPct >= 0 ? "+" : ""}{h.pnlPct.toFixed(2)}%</span> : "—"}
                      </td>
                      <td style={{ padding: "12px 14px" }}>
                        <button onClick={() => delHolding(h.id)} style={{ color: "#f87171", background: "none", border: "none", cursor: "pointer", fontSize: 14, padding: "2px 8px" }}>✕</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {enriched.length > 1 && (
                <tfoot>
                  <tr style={{ borderTop: "2px solid var(--border)" }}>
                    <td style={{ padding: "12px 14px", fontWeight: 700, color: "var(--label)", fontSize: 12 }}>TOTAL</td>
                    <td colSpan={3} />
                    <td style={{ padding: "12px 14px", textAlign: "right", fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>{RM(totalCost)}</td>
                    <td />
                    <td style={{ padding: "12px 14px", textAlign: "right", fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>{priced.length ? RM(totalValue) : "—"}</td>
                    <td style={{ padding: "12px 14px", textAlign: "right", fontFamily: "'DM Mono', monospace", fontWeight: 800 }}>
                      {priced.length ? <span style={{ color: totalPnl >= 0 ? "#4ade80" : "#f87171" }}>{totalPnl >= 0 ? "+" : ""}{RM(totalPnl)}</span> : "—"}
                    </td>
                    <td style={{ padding: "12px 14px", textAlign: "right", fontFamily: "'DM Mono', monospace", fontWeight: 800 }}>
                      {totalPnlPct !== null ? <span style={{ color: totalPnlPct >= 0 ? "#4ade80" : "#f87171" }}>{totalPnlPct >= 0 ? "+" : ""}{totalPnlPct.toFixed(2)}%</span> : "—"}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      ) : (
        <div style={{ textAlign: "center", padding: "48px 24px", color: "var(--muted)", fontSize: 14, background: "var(--card-bg)", borderRadius: 16, border: "1px solid var(--border)", marginBottom: 20 }}>
          No holdings yet. Add your first Bursa Malaysia stock above.
        </div>
      )}

      <div style={{ padding: "14px 18px", borderRadius: 12, background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", fontSize: 11, color: "var(--muted)", lineHeight: 1.7 }}>
        <strong style={{ color: "var(--label)" }}>Note (Bursa Malaysia):</strong> Prices are fetched from Yahoo Finance using the .KL suffix and may be delayed 15–20 minutes during Bursa trading hours (9:00am–5:00pm MYT, Mon–Fri). P&L is unrealised gain/loss based on cost basis (shares × buy price + fees). Include brokerage fees and stamp duty in the Fees field for accurate cost basis. All values in MYR. For personal record-keeping only — not financial advice.
      </div>
    </div>
  );
}
