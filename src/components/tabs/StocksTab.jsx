import { useState, useMemo, useEffect } from "react";
import { USD, uid } from "../../lib/finance.js";
import { toCsv, downloadBlob, printTable } from "../../lib/backup.js";
import { StatCard } from "../shared/StatCard.jsx";
import { fetchYahooChart } from "../../lib/fetchPrice.js";

export default function StocksTab() {
  const [holdings, setHoldings] = useState(() => {
    try {
      const s = localStorage.getItem("stocks_v1");
      if (s) { const h = JSON.parse(s); if (Array.isArray(h)) return h; }
    } catch {}
    return [];
  });

  const [prices, setPrices] = useState({});
  const [fetching, setFetching] = useState(new Set());
  const [fetchErrors, setFetchErrors] = useState({});
  const [form, setForm] = useState({ ticker: "", shares: "", avgCost: "", fees: "0", buyDate: "", notes: "" });
  const [refreshedAt, setRefreshedAt] = useState(null);
  const [editingPrice, setEditingPrice] = useState(new Set());
  const [manualInput, setManualInput] = useState({});

  useEffect(() => {
    try { localStorage.setItem("stocks_v1", JSON.stringify(holdings)); } catch {}
  }, [holdings]);

  useEffect(() => {
    if (Object.keys(prices).length === 0) return;
    try { localStorage.setItem("stocks_prices_v1", JSON.stringify(prices)); } catch {}
  }, [prices]);

  const fetchPrice = async (ticker) => {
    setFetching(s => new Set([...s, ticker]));
    setFetchErrors(e => { const n = { ...e }; delete n[ticker]; return n; });
    try {
      const { price, prevClose } = await fetchYahooChart(ticker);
      setPrices(p => ({ ...p, [ticker]: { price, prevClose, at: Date.now() } }));
    } catch (err) {
      setFetchErrors(e => ({ ...e, [ticker]: err.message || "Failed" }));
    }
    setFetching(s => { const n = new Set(s); n.delete(ticker); return n; });
  };

  const refreshAll = () => {
    const tickers = [...new Set(holdings.map(h => h.ticker))];
    tickers.forEach(fetchPrice);
    setRefreshedAt(Date.now());
  };

  const commitManual = (ticker) => {
    const val = parseFloat(manualInput[ticker]);
    if (!isNaN(val) && val > 0) {
      setPrices(p => ({ ...p, [ticker]: { price: val, prevClose: null, manual: true, at: Date.now() } }));
      setFetchErrors(e => { const n = { ...e }; delete n[ticker]; return n; });
    }
    setEditingPrice(s => { const n = new Set(s); n.delete(ticker); return n; });
    setManualInput(m => { const n = { ...m }; delete n[ticker]; return n; });
  };

  const startEditing = (ticker) => setEditingPrice(s => new Set([...s, ticker]));
  const cancelEditing = (ticker) => setEditingPrice(s => { const n = new Set(s); n.delete(ticker); return n; });

  const addHolding = () => {
    const ticker = form.ticker.toUpperCase().trim();
    if (!ticker || !form.shares || !form.avgCost) return;
    setHoldings(hs => [...hs, {
      id: uid(), ticker,
      shares: parseFloat(form.shares) || 0,
      avgCost: parseFloat(form.avgCost) || 0,
      totalFees: parseFloat(form.fees) || 0,
      buyDate: form.buyDate,
      notes: form.notes.trim(),
    }]);
    setForm({ ticker: "", shares: "", avgCost: "", fees: "0", buyDate: "", notes: "" });
  };

  const delHolding = (id) => setHoldings(hs => hs.filter(h => h.id !== id));

  const enriched = useMemo(() => holdings.map(h => {
    const cost = h.shares * h.avgCost + (h.totalFees || 0);
    const p = prices[h.ticker];
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

  const exportStocksCsv = () => {
    const rows = enriched.map(h => ({
      Ticker: h.ticker, Shares: h.shares, "Buy Price (USD)": h.avgCost.toFixed(4),
      "Fees (USD)": (h.totalFees || 0).toFixed(2), "Total Cost (USD)": h.cost.toFixed(2),
      "Current Price (USD)": h.pd ? h.pd.price.toFixed(4) : "",
      "Market Value (USD)": h.value != null ? h.value.toFixed(2) : "",
      "P&L (USD)": h.pnl != null ? h.pnl.toFixed(2) : "",
      "P&L (%)": h.pnlPct != null ? h.pnlPct.toFixed(2) : "",
      "Buy Date": h.buyDate, Notes: h.notes,
    }));
    downloadBlob(`us-stocks-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows), "text/csv");
  };

  const exportStocksPdf = () => printTable("US Stock Portfolio", [{
    headers: ["Ticker", "Shares", "Buy Price", "Fees", "Total Cost", "Current Price", "Value", "P&L (USD)", "P&L %", "Buy Date"],
    rows: enriched.map(h => [
      h.ticker, h.shares, USD(h.avgCost), USD(h.totalFees || 0), USD(h.cost),
      h.pd ? USD(h.pd.price) : "—", h.value != null ? USD(h.value) : "—",
      h.pnl != null ? (h.pnl >= 0 ? "+" : "") + USD(h.pnl) : "—",
      h.pnlPct != null ? (h.pnlPct >= 0 ? "+" : "") + h.pnlPct.toFixed(2) + "%" : "—",
      h.buyDate,
    ]),
  }]);

  const addBtnStyle = {
    padding: "8px 18px", borderRadius: 8, background: "rgba(110,231,183,0.12)",
    color: "var(--accent)", border: "1px solid rgba(110,231,183,0.25)",
    cursor: "pointer", fontWeight: 600, fontSize: 13, fontFamily: "inherit", whiteSpace: "nowrap",
  };

  const exportBtnStyle = {
    padding: "6px 12px", borderRadius: 7, border: "1px solid var(--border)",
    background: "rgba(255,255,255,0.04)", color: "var(--label)", fontSize: 11,
    fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
  };

  const thS = (align) => ({
    padding: "12px 14px", textAlign: align, fontSize: 11, fontWeight: 600,
    color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap",
  });

  const cols = [
    ["Ticker", "left"], ["Shares", "right"], ["Buy Price", "right"], ["Fees", "right"],
    ["Total Cost", "right"], ["Current Price", "right"], ["Value", "right"],
    ["P&L (USD)", "right"], ["P&L %", "right"], ["", "right"],
  ];

  return (
    <div>
      {/* Summary */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
        <StatCard label="Total Invested" value={USD(totalCost)} sub="Cost basis incl. fees" color="#e8eaf0" />
        <StatCard
          label="Portfolio Value"
          value={priced.length ? USD(totalValue) : "—"}
          sub={priced.length < enriched.length && enriched.length > 0 ? `${priced.length}/${enriched.length} positions priced` : "Live prices"}
          color="var(--accent2)"
        />
        <StatCard
          label="Total P&L"
          value={priced.length ? USD(totalPnl) : "—"}
          sub={totalPnlPct !== null ? `${totalPnl >= 0 ? "+" : ""}${totalPnlPct.toFixed(2)}% overall` : "Refresh to see"}
          color={totalPnl >= 0 ? "#4ade80" : "#f87171"}
        />
      </div>

      {/* Add Holding */}
      <div style={{ background: "var(--card-bg)", borderRadius: 16, padding: 24, border: "1px solid var(--border)", marginBottom: 20 }}>
        <div className="section-title">Add Holding</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
          <div style={{ flex: "0 0 90px" }}>
            <label style={{ fontSize: 11, color: "var(--label)", display: "block", marginBottom: 4 }}>Ticker</label>
            <input className="hl-in" style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, textTransform: "uppercase" }}
              placeholder="AAPL" value={form.ticker}
              onChange={e => setForm(f => ({ ...f, ticker: e.target.value }))}
              onKeyDown={e => e.key === "Enter" && addHolding()} />
          </div>
          <div style={{ flex: "1 1 90px" }}>
            <label style={{ fontSize: 11, color: "var(--label)", display: "block", marginBottom: 4 }}>Shares</label>
            <input className="hl-in" type="number" placeholder="10" value={form.shares}
              onChange={e => setForm(f => ({ ...f, shares: e.target.value }))} min={0} step={0.001}
              style={{ fontFamily: "'DM Mono', monospace" }} />
          </div>
          <div style={{ flex: "1 1 120px" }}>
            <label style={{ fontSize: 11, color: "var(--label)", display: "block", marginBottom: 4 }}>Buy Price (USD/share)</label>
            <input className="hl-in" type="number" placeholder="150.00" value={form.avgCost}
              onChange={e => setForm(f => ({ ...f, avgCost: e.target.value }))} min={0} step={0.01}
              style={{ fontFamily: "'DM Mono', monospace" }} />
          </div>
          <div style={{ flex: "1 1 90px" }}>
            <label style={{ fontSize: 11, color: "var(--label)", display: "block", marginBottom: 4 }}>Fees (USD)</label>
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
              <button onClick={refreshAll} disabled={anyFetching} style={{ padding: "6px 16px", borderRadius: 8, background: anyFetching ? "transparent" : "rgba(110,231,183,0.1)", color: anyFetching ? "var(--muted)" : "var(--accent)", border: "1px solid rgba(110,231,183,0.2)", cursor: anyFetching ? "not-allowed" : "pointer", fontWeight: 600, fontSize: 12, fontFamily: "inherit" }}>
                {anyFetching ? "⟳ Fetching…" : "⟳ Refresh Prices"}
              </button>
              <button style={exportBtnStyle} onClick={exportStocksCsv}>↓ CSV</button>
              <button style={exportBtnStyle} onClick={exportStocksPdf}>⎙ PDF</button>
            </div>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {cols.map(([label, align]) => (
                    <th key={label} style={thS(align)}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {enriched.map((h, i) => {
                  const isLoading = fetching.has(h.ticker);
                  const err = fetchErrors[h.ticker];
                  return (
                    <tr key={h.id} style={{ borderBottom: "1px solid var(--border)", background: i % 2 ? "rgba(255,255,255,0.01)" : "transparent" }}>
                      <td style={{ padding: "12px 14px" }}>
                        <div style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: "var(--accent2)", fontSize: 14 }}>{h.ticker}</div>
                        {h.buyDate && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{h.buyDate}</div>}
                        {h.notes && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.notes}</div>}
                      </td>
                      <td style={{ padding: "12px 14px", textAlign: "right", fontFamily: "'DM Mono', monospace" }}>{h.shares}</td>
                      <td style={{ padding: "12px 14px", textAlign: "right", fontFamily: "'DM Mono', monospace" }}>{USD(h.avgCost)}</td>
                      <td style={{ padding: "12px 14px", textAlign: "right", fontFamily: "'DM Mono', monospace", color: "var(--muted)" }}>{USD(h.totalFees)}</td>
                      <td style={{ padding: "12px 14px", textAlign: "right", fontFamily: "'DM Mono', monospace" }}>{USD(h.cost)}</td>
                      <td style={{ padding: "12px 14px", textAlign: "right" }}>
                        {isLoading ? (
                          <span style={{ color: "var(--muted)", fontSize: 12 }}>Loading…</span>
                        ) : editingPrice.has(h.ticker) ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}>
                            <input
                              autoFocus type="number" step="0.0001" min="0" placeholder="0.00"
                              value={manualInput[h.ticker] || ""}
                              onChange={e => setManualInput(m => ({ ...m, [h.ticker]: e.target.value }))}
                              onKeyDown={e => { if (e.key === "Enter") commitManual(h.ticker); if (e.key === "Escape") cancelEditing(h.ticker); }}
                              style={{ width: 80, padding: "4px 7px", borderRadius: 6, border: "1px solid var(--accent)", background: "rgba(110,231,183,0.08)", color: "var(--text)", fontFamily: "'DM Mono', monospace", fontSize: 12, outline: "none" }}
                            />
                            <button onClick={() => commitManual(h.ticker)} style={{ color: "var(--accent)", background: "none", border: "none", cursor: "pointer", fontSize: 15, padding: "2px 3px", lineHeight: 1 }} title="Confirm">✓</button>
                            <button onClick={() => cancelEditing(h.ticker)} style={{ color: "var(--muted)", background: "none", border: "none", cursor: "pointer", fontSize: 13, padding: "2px 3px", lineHeight: 1 }} title="Cancel">✕</button>
                          </div>
                        ) : err ? (
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                            <div style={{ display: "flex", gap: 6 }}>
                              <button onClick={() => fetchPrice(h.ticker)} style={{ color: "#f87171", background: "none", border: "none", cursor: "pointer", fontSize: 11, padding: 0 }} title={err}>⚠ Retry</button>
                              <button onClick={() => startEditing(h.ticker)} style={{ color: "var(--muted)", background: "none", border: "none", cursor: "pointer", fontSize: 11, padding: 0 }} title="Enter price manually">✎ Manual</button>
                            </div>
                          </div>
                        ) : h.pd ? (
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: 5, justifyContent: "flex-end" }}>
                              <div style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>{USD(h.pd.price)}</div>
                              <button onClick={() => startEditing(h.ticker)} style={{ color: "var(--muted)", background: "none", border: "none", cursor: "pointer", fontSize: 11, padding: 0, opacity: 0.5, lineHeight: 1 }} title="Override price">✎</button>
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
                            <button onClick={() => fetchPrice(h.ticker)} style={{ padding: "4px 10px", borderRadius: 6, background: "rgba(110,231,183,0.1)", color: "var(--accent)", border: "1px solid rgba(110,231,183,0.2)", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>Fetch</button>
                            <button onClick={() => startEditing(h.ticker)} style={{ padding: "4px 8px", borderRadius: 6, background: "transparent", color: "var(--muted)", border: "1px solid var(--border)", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }} title="Enter price manually">✎</button>
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "12px 14px", textAlign: "right", fontFamily: "'DM Mono', monospace" }}>
                        {h.value !== null ? USD(h.value) : "—"}
                      </td>
                      <td style={{ padding: "12px 14px", textAlign: "right", fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>
                        {h.pnl !== null ? <span style={{ color: h.pnl >= 0 ? "#4ade80" : "#f87171" }}>{h.pnl >= 0 ? "+" : ""}{USD(h.pnl)}</span> : "—"}
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
                    <td style={{ padding: "12px 14px", textAlign: "right", fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>{USD(totalCost)}</td>
                    <td />
                    <td style={{ padding: "12px 14px", textAlign: "right", fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>{priced.length ? USD(totalValue) : "—"}</td>
                    <td style={{ padding: "12px 14px", textAlign: "right", fontFamily: "'DM Mono', monospace", fontWeight: 800 }}>
                      {priced.length ? <span style={{ color: totalPnl >= 0 ? "#4ade80" : "#f87171" }}>{totalPnl >= 0 ? "+" : ""}{USD(totalPnl)}</span> : "—"}
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
          No holdings yet. Add your first stock position above.
        </div>
      )}

      <div style={{ padding: "14px 18px", borderRadius: 12, background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", fontSize: 11, color: "var(--muted)", lineHeight: 1.7 }}>
        <strong style={{ color: "var(--label)" }}>Note:</strong> Prices are fetched live from Yahoo Finance and may be delayed up to 15–20 minutes during market hours. P&L shown is unrealised gain/loss based on your cost basis (shares × buy price + fees). All values in USD. For personal record-keeping only — not financial advice.
      </div>
    </div>
  );
}
