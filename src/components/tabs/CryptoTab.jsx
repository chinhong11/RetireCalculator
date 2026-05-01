import { useState, useMemo, useEffect } from "react";
import { USD, uid, COIN_IDS, fmtCoin } from "../../lib/finance.js";
import { toCsv, downloadBlob, printTable } from "../../lib/backup.js";
import { StatCard } from "../shared/StatCard.jsx";

export default function CryptoTab() {
  const [holdings, setHoldings] = useState(() => {
    try {
      const s = localStorage.getItem("crypto_v1");
      if (s) { const h = JSON.parse(s); if (Array.isArray(h)) return h; }
    } catch {}
    return [];
  });

  const [prices, setPrices] = useState({});
  const [fetching, setFetching] = useState(new Set());
  const [fetchErrors, setFetchErrors] = useState({});
  const [form, setForm] = useState({ ticker: "", amount: "", buyPrice: "", fees: "0", buyDate: "", notes: "" });
  const [refreshedAt, setRefreshedAt] = useState(null);
  const [editingPrice, setEditingPrice] = useState(new Set());
  const [manualInput, setManualInput] = useState({});
  const [showDca, setShowDca] = useState(false);
  const [dcaTicker, setDcaTicker] = useState("");
  const [dcaAddAmount, setDcaAddAmount] = useState("");
  const [dcaAddPrice, setDcaAddPrice] = useState("");
  const [dcaAddFees, setDcaAddFees] = useState("0");

  useEffect(() => {
    try { localStorage.setItem("crypto_v1", JSON.stringify(holdings)); } catch {}
  }, [holdings]);

  const fetchPrice = async (ticker) => {
    const coinId = COIN_IDS[ticker.toUpperCase()] || ticker.toLowerCase();
    setFetching(s => new Set([...s, ticker]));
    setFetchErrors(e => { const n = { ...e }; delete n[ticker]; return n; });
    try {
      const res = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(coinId)}&vs_currencies=usd&include_24hr_change=true`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data[coinId]?.usd) throw new Error(`"${ticker}" not found — try the CoinGecko coin ID`);
      setPrices(p => ({
        ...p,
        [ticker]: { price: data[coinId].usd, change24h: data[coinId].usd_24h_change, at: Date.now() },
      }));
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
      setPrices(p => ({ ...p, [ticker]: { price: val, change24h: null, manual: true, at: Date.now() } }));
      setFetchErrors(e => { const n = { ...e }; delete n[ticker]; return n; });
    }
    setEditingPrice(s => { const n = new Set(s); n.delete(ticker); return n; });
    setManualInput(m => { const n = { ...m }; delete n[ticker]; return n; });
  };

  const startEditing = (ticker) => setEditingPrice(s => new Set([...s, ticker]));
  const cancelEditing = (ticker) => setEditingPrice(s => { const n = new Set(s); n.delete(ticker); return n; });

  const addHolding = () => {
    const ticker = form.ticker.toUpperCase().trim();
    if (!ticker || !form.amount || !form.buyPrice) return;
    setHoldings(hs => [...hs, {
      id: uid(), ticker,
      amount: parseFloat(form.amount) || 0,
      buyPrice: parseFloat(form.buyPrice) || 0,
      totalFees: parseFloat(form.fees) || 0,
      buyDate: form.buyDate, notes: form.notes.trim(),
    }]);
    setForm({ ticker: "", amount: "", buyPrice: "", fees: "0", buyDate: "", notes: "" });
  };

  const delHolding = (id) => setHoldings(hs => hs.filter(h => h.id !== id));

  const enriched = useMemo(() => holdings.map(h => {
    const cost = h.amount * h.buyPrice + (h.totalFees || 0);
    const p = prices[h.ticker];
    const value = p ? h.amount * p.price : null;
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

  // Aggregate all lots for the selected DCA ticker
  const dcaPosition = useMemo(() => {
    if (!dcaTicker) return null;
    const lots = holdings.filter(h => h.ticker === dcaTicker);
    if (!lots.length) return null;
    const totalAmount = lots.reduce((s, h) => s + h.amount, 0);
    const totalCostBasis = lots.reduce((s, h) => s + h.amount * h.buyPrice + (h.totalFees || 0), 0);
    return { totalAmount, totalCostBasis, avgCost: totalAmount > 0 ? totalCostBasis / totalAmount : 0 };
  }, [dcaTicker, holdings]);

  // New average after the hypothetical add
  const dcaResult = useMemo(() => {
    if (!dcaPosition) return null;
    const addAmt = parseFloat(dcaAddAmount);
    const addPrice = parseFloat(dcaAddPrice);
    const addFees = parseFloat(dcaAddFees) || 0;
    if (!addAmt || addAmt <= 0 || !addPrice || addPrice <= 0) return null;
    const purchaseCost = addAmt * addPrice + addFees;
    const newAmount = dcaPosition.totalAmount + addAmt;
    const newCostBasis = dcaPosition.totalCostBasis + purchaseCost;
    const newAvgCost = newCostBasis / newAmount;
    const change = newAvgCost - dcaPosition.avgCost;
    const changePct = dcaPosition.avgCost > 0 ? (change / dcaPosition.avgCost) * 100 : 0;
    return { newAvgCost, newAmount, newCostBasis, purchaseCost, change, changePct };
  }, [dcaPosition, dcaAddAmount, dcaAddPrice, dcaAddFees]);

  const exportCryptoCsv = () => {
    const rows = enriched.map(h => ({
      Coin: h.ticker, Amount: h.amount, "Buy Price (USD)": h.buyPrice,
      "Fees (USD)": (h.totalFees || 0).toFixed(2), "Total Cost (USD)": h.cost.toFixed(2),
      "Current Price (USD)": h.pd ? h.pd.price : "",
      "Market Value (USD)": h.value != null ? h.value.toFixed(2) : "",
      "P&L (USD)": h.pnl != null ? h.pnl.toFixed(2) : "",
      "P&L (%)": h.pnlPct != null ? h.pnlPct.toFixed(2) : "",
      "24h Change (%)": h.pd?.change24h != null ? h.pd.change24h.toFixed(2) : "",
      "Buy Date": h.buyDate, Notes: h.notes,
    }));
    downloadBlob(`crypto-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows), "text/csv");
  };

  const exportCryptoPdf = () => printTable("Crypto Portfolio", [{
    headers: ["Coin", "Amount", "Buy Price", "Fees", "Total Cost", "Current Price", "Value", "P&L (USD)", "P&L %", "Buy Date"],
    rows: enriched.map(h => [
      h.ticker, h.amount, fmtCoin(h.buyPrice), USD(h.totalFees || 0), USD(h.cost),
      h.pd ? fmtCoin(h.pd.price) : "—", h.value != null ? USD(h.value) : "—",
      h.pnl != null ? (h.pnl >= 0 ? "+" : "") + USD(h.pnl) : "—",
      h.pnlPct != null ? (h.pnlPct >= 0 ? "+" : "") + h.pnlPct.toFixed(2) + "%" : "—",
      h.buyDate,
    ]),
  }]);

  const GOLD = "#fbbf24";
  const addBtnStyle = { padding: "8px 18px", borderRadius: 8, background: "rgba(251,191,36,0.12)", color: GOLD, border: "1px solid rgba(251,191,36,0.25)", cursor: "pointer", fontWeight: 600, fontSize: 13, fontFamily: "inherit", whiteSpace: "nowrap" };
  const exportBtnStyle = { padding: "6px 12px", borderRadius: 7, border: "1px solid var(--border)", background: "rgba(255,255,255,0.04)", color: "var(--label)", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };
  const thS = (align) => ({ padding: "12px 14px", textAlign: align, fontSize: 11, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" });
  const cols = [
    ["Coin", "left"], ["Amount", "right"], ["Buy Price", "right"], ["Fees", "right"],
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
          color={GOLD}
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
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>
          Use common ticker symbols (BTC, ETH, SOL…) or paste the CoinGecko coin ID for any unlisted token.
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
          <div style={{ flex: "0 0 90px" }}>
            <label style={{ fontSize: 11, color: "var(--label)", display: "block", marginBottom: 4 }}>Coin</label>
            <input className="hl-in" style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, textTransform: "uppercase" }}
              placeholder="BTC" value={form.ticker}
              onChange={e => setForm(f => ({ ...f, ticker: e.target.value }))}
              onKeyDown={e => e.key === "Enter" && addHolding()} />
          </div>
          <div style={{ flex: "1 1 110px" }}>
            <label style={{ fontSize: 11, color: "var(--label)", display: "block", marginBottom: 4 }}>Amount</label>
            <input className="hl-in" type="number" placeholder="0.5" value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} min={0} step="any"
              style={{ fontFamily: "'DM Mono', monospace" }} />
          </div>
          <div style={{ flex: "1 1 130px" }}>
            <label style={{ fontSize: 11, color: "var(--label)", display: "block", marginBottom: 4 }}>Buy Price (USD/coin)</label>
            <input className="hl-in" type="number" placeholder="45000" value={form.buyPrice}
              onChange={e => setForm(f => ({ ...f, buyPrice: e.target.value }))} min={0} step="any"
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

      {/* DCA Calculator */}
      {holdings.length > 0 && (
        <div style={{ background: "var(--card-bg)", borderRadius: 16, border: "1px solid var(--border)", marginBottom: 20, overflow: "hidden" }}>
          <div style={{ padding: "18px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div>
              <div className="section-title" style={{ margin: 0, marginBottom: 3 }}>Cost Average Calculator</div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>Simulate adding to a position and see the new average cost</div>
            </div>
            <button
              onClick={() => setShowDca(s => !s)}
              style={{ ...exportBtnStyle, color: showDca ? GOLD : "var(--label)", borderColor: showDca ? "rgba(251,191,36,0.3)" : "var(--border)", whiteSpace: "nowrap" }}
            >
              {showDca ? "▲ Hide" : "▼ Show"}
            </button>
          </div>

          {showDca && (
            <div style={{ borderTop: "1px solid var(--border)", padding: "20px 24px 24px" }}>
              <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-start" }}>

                {/* Existing position */}
                <div style={{ flex: "1 1 180px" }}>
                  <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, marginBottom: 12 }}>Existing Position</div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 11, color: "var(--label)", display: "block", marginBottom: 4 }}>Coin</label>
                    <select className="hl-in" value={dcaTicker} onChange={e => { setDcaTicker(e.target.value); setDcaAddPrice(""); }}>
                      <option value="">— Select coin —</option>
                      {[...new Set(holdings.map(h => h.ticker))].map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  {dcaPosition ? (
                    <div style={{ padding: "12px 14px", borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)", fontSize: 13, lineHeight: 1.9 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", columnGap: 14 }}>
                        <span style={{ color: "var(--muted)", fontSize: 12 }}>Amount held</span>
                        <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>{dcaPosition.totalAmount.toPrecision(8).replace(/\.?0+$/, "")}</span>
                        <span style={{ color: "var(--muted)", fontSize: 12 }}>Avg cost / coin</span>
                        <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>{fmtCoin(dcaPosition.avgCost)}</span>
                        <span style={{ color: "var(--muted)", fontSize: 12 }}>Total invested</span>
                        <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>{USD(dcaPosition.totalCostBasis)}</span>
                      </div>
                    </div>
                  ) : (
                    <div style={{ padding: "16px 14px", borderRadius: 10, border: "1px dashed var(--border)", color: "var(--muted)", fontSize: 12, textAlign: "center" }}>
                      {dcaTicker ? `No lots found for ${dcaTicker}` : "Select a coin above"}
                    </div>
                  )}
                </div>

                {/* New purchase */}
                <div style={{ flex: "1 1 180px" }}>
                  <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, marginBottom: 12 }}>New Purchase</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <div>
                      <label style={{ fontSize: 11, color: "var(--label)", display: "block", marginBottom: 4 }}>Add Amount</label>
                      <input className="hl-in" type="number" placeholder="0.5" value={dcaAddAmount}
                        onChange={e => setDcaAddAmount(e.target.value)} min={0} step="any"
                        style={{ fontFamily: "'DM Mono', monospace" }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: "var(--label)", display: "block", marginBottom: 4 }}>At Price (USD / coin)</label>
                      <input className="hl-in" type="number" placeholder="0.00" value={dcaAddPrice}
                        onChange={e => setDcaAddPrice(e.target.value)} min={0} step="any"
                        style={{ fontFamily: "'DM Mono', monospace" }} />
                      {dcaTicker && prices[dcaTicker] && (
                        <button
                          onClick={() => setDcaAddPrice(String(prices[dcaTicker].price))}
                          style={{ marginTop: 5, padding: "3px 8px", borderRadius: 5, border: "1px solid rgba(251,191,36,0.3)", background: "rgba(251,191,36,0.06)", color: GOLD, fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
                        >
                          Use live · {fmtCoin(prices[dcaTicker].price)}
                        </button>
                      )}
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: "var(--label)", display: "block", marginBottom: 4 }}>Fees (USD)</label>
                      <input className="hl-in" type="number" placeholder="0" value={dcaAddFees}
                        onChange={e => setDcaAddFees(e.target.value)} min={0} step={0.01}
                        style={{ fontFamily: "'DM Mono', monospace" }} />
                    </div>
                  </div>
                </div>

                {/* Results */}
                <div style={{ flex: "1 1 200px" }}>
                  <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, marginBottom: 12 }}>After Purchase</div>
                  {dcaResult ? (
                    <>
                      <div style={{ padding: "14px 16px", borderRadius: 10, background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.2)", lineHeight: 1.9 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", columnGap: 14, fontSize: 13 }}>
                          <span style={{ color: "var(--muted)", fontSize: 12 }}>New amount</span>
                          <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>{dcaResult.newAmount.toPrecision(8).replace(/\.?0+$/, "")}</span>

                          <span style={{ color: "var(--muted)", fontSize: 12 }}>New avg cost</span>
                          <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 800, color: GOLD, fontSize: 15 }}>{fmtCoin(dcaResult.newAvgCost)}</span>

                          <span style={{ color: "var(--muted)", fontSize: 12 }}>vs current avg</span>
                          <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600, color: dcaResult.change <= 0 ? "#4ade80" : "#f87171" }}>
                            {dcaResult.change >= 0 ? "+" : ""}{fmtCoin(dcaResult.change)} ({dcaResult.changePct >= 0 ? "+" : ""}{dcaResult.changePct.toFixed(2)}%)
                          </span>

                          <span style={{ color: "var(--muted)", fontSize: 12 }}>New total invested</span>
                          <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>{USD(dcaResult.newCostBasis)}</span>

                          <span style={{ color: "var(--muted)", fontSize: 12 }}>This purchase</span>
                          <span style={{ fontFamily: "'DM Mono', monospace", color: "var(--label)" }}>{USD(dcaResult.purchaseCost)}</span>
                        </div>
                      </div>

                      {dcaTicker && prices[dcaTicker] && (() => {
                        const live = prices[dcaTicker].price;
                        const pnlPct = ((live - dcaResult.newAvgCost) / dcaResult.newAvgCost) * 100;
                        const pnl = (live - dcaResult.newAvgCost) * dcaResult.newAmount;
                        return (
                          <div style={{ marginTop: 10, padding: "10px 14px", borderRadius: 8, background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", fontSize: 12 }}>
                            <div style={{ color: "var(--muted)", marginBottom: 3 }}>P&amp;L at live price ({fmtCoin(live)})</div>
                            <div style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: pnlPct >= 0 ? "#4ade80" : "#f87171" }}>
                              {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}% &nbsp;·&nbsp; {pnl >= 0 ? "+" : ""}{USD(pnl)}
                            </div>
                          </div>
                        );
                      })()}
                    </>
                  ) : (
                    <div style={{ padding: "20px 16px", borderRadius: 10, border: "1px dashed var(--border)", textAlign: "center", color: "var(--muted)", fontSize: 12 }}>
                      {dcaPosition ? "Enter add amount and price" : "Select a coin to get started"}
                    </div>
                  )}
                </div>

              </div>
            </div>
          )}
        </div>
      )}

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
              <button onClick={refreshAll} disabled={anyFetching} style={{ padding: "6px 16px", borderRadius: 8, background: anyFetching ? "transparent" : "rgba(251,191,36,0.1)", color: anyFetching ? "var(--muted)" : GOLD, border: `1px solid rgba(251,191,36,0.2)`, cursor: anyFetching ? "not-allowed" : "pointer", fontWeight: 600, fontSize: 12, fontFamily: "inherit" }}>
                {anyFetching ? "⟳ Fetching…" : "⟳ Refresh Prices"}
              </button>
              <button style={exportBtnStyle} onClick={exportCryptoCsv}>↓ CSV</button>
              <button style={exportBtnStyle} onClick={exportCryptoPdf}>⎙ PDF</button>
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
                  const isLoading = fetching.has(h.ticker);
                  const err = fetchErrors[h.ticker];
                  return (
                    <tr key={h.id} style={{ borderBottom: "1px solid var(--border)", background: i % 2 ? "rgba(255,255,255,0.01)" : "transparent" }}>
                      <td style={{ padding: "12px 14px" }}>
                        <div style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: GOLD, fontSize: 14 }}>{h.ticker}</div>
                        {h.buyDate && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{h.buyDate}</div>}
                        {h.notes && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.notes}</div>}
                      </td>
                      <td style={{ padding: "12px 14px", textAlign: "right", fontFamily: "'DM Mono', monospace" }}>{h.amount}</td>
                      <td style={{ padding: "12px 14px", textAlign: "right", fontFamily: "'DM Mono', monospace" }}>{fmtCoin(h.buyPrice)}</td>
                      <td style={{ padding: "12px 14px", textAlign: "right", fontFamily: "'DM Mono', monospace", color: "var(--muted)" }}>{USD(h.totalFees)}</td>
                      <td style={{ padding: "12px 14px", textAlign: "right", fontFamily: "'DM Mono', monospace" }}>{USD(h.cost)}</td>
                      <td style={{ padding: "12px 14px", textAlign: "right" }}>
                        {isLoading ? (
                          <span style={{ color: "var(--muted)", fontSize: 12 }}>Loading…</span>
                        ) : editingPrice.has(h.ticker) ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}>
                            <input
                              autoFocus type="number" step="0.000001" min="0" placeholder="0.00"
                              value={manualInput[h.ticker] || ""}
                              onChange={e => setManualInput(m => ({ ...m, [h.ticker]: e.target.value }))}
                              onKeyDown={e => { if (e.key === "Enter") commitManual(h.ticker); if (e.key === "Escape") cancelEditing(h.ticker); }}
                              style={{ width: 80, padding: "4px 7px", borderRadius: 6, border: `1px solid ${GOLD}`, background: "rgba(251,191,36,0.08)", color: "var(--text)", fontFamily: "'DM Mono', monospace", fontSize: 12, outline: "none" }}
                            />
                            <button onClick={() => commitManual(h.ticker)} style={{ color: GOLD, background: "none", border: "none", cursor: "pointer", fontSize: 15, padding: "2px 3px", lineHeight: 1 }} title="Confirm">✓</button>
                            <button onClick={() => cancelEditing(h.ticker)} style={{ color: "var(--muted)", background: "none", border: "none", cursor: "pointer", fontSize: 13, padding: "2px 3px", lineHeight: 1 }} title="Cancel">✕</button>
                          </div>
                        ) : err ? (
                          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                            <button onClick={() => fetchPrice(h.ticker)} style={{ color: "#f87171", background: "none", border: "none", cursor: "pointer", fontSize: 11, padding: 0 }} title={err}>⚠ Retry</button>
                            <button onClick={() => startEditing(h.ticker)} style={{ color: "var(--muted)", background: "none", border: "none", cursor: "pointer", fontSize: 11, padding: 0 }} title="Enter price manually">✎ Manual</button>
                          </div>
                        ) : h.pd ? (
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: 5, justifyContent: "flex-end" }}>
                              <div style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>{fmtCoin(h.pd.price)}</div>
                              <button onClick={() => startEditing(h.ticker)} style={{ color: "var(--muted)", background: "none", border: "none", cursor: "pointer", fontSize: 11, padding: 0, opacity: 0.5, lineHeight: 1 }} title="Override price">✎</button>
                            </div>
                            {h.pd.manual ? (
                              <div style={{ fontSize: 10, color: "var(--muted)", fontStyle: "italic" }}>manual</div>
                            ) : h.pd.change24h != null && (
                              <div style={{ fontSize: 11, color: h.pd.change24h >= 0 ? "#4ade80" : "#f87171" }}>
                                {h.pd.change24h >= 0 ? "▲" : "▼"} {Math.abs(h.pd.change24h).toFixed(2)}% 24h
                              </div>
                            )}
                          </div>
                        ) : (
                          <div style={{ display: "flex", gap: 5, justifyContent: "flex-end" }}>
                            <button onClick={() => fetchPrice(h.ticker)} style={{ padding: "4px 10px", borderRadius: 6, background: "rgba(251,191,36,0.1)", color: GOLD, border: "1px solid rgba(251,191,36,0.2)", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>Fetch</button>
                            <button onClick={() => startEditing(h.ticker)} style={{ padding: "4px 8px", borderRadius: 6, background: "transparent", color: "var(--muted)", border: "1px solid var(--border)", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }} title="Enter price manually">✎</button>
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "12px 14px", textAlign: "right", fontFamily: "'DM Mono', monospace" }}>{h.value !== null ? USD(h.value) : "—"}</td>
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
          No holdings yet. Add your first crypto position above.
        </div>
      )}

      <div style={{ padding: "14px 18px", borderRadius: 12, background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", fontSize: 11, color: "var(--muted)", lineHeight: 1.7 }}>
        <strong style={{ color: "var(--label)" }}>Note:</strong> Prices are fetched from CoinGecko (free public API). P&L is unrealised gain/loss based on your cost basis (amount × buy price + fees). All values in USD. For unlisted tokens, enter the CoinGecko coin ID (e.g. "wrapped-bitcoin") in the Coin field. For personal record-keeping only — not financial advice.
      </div>
    </div>
  );
}
