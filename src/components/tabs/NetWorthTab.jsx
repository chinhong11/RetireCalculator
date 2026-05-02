import { useState, useEffect, useMemo } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { projectEpfYears } from "../../lib/epf.js";
import { fetchFxRates } from "../../lib/fetchFx.js";

export default function NetWorthTab({ projectionData, yearsToProject }) {
  const [usdToSgd, setUsdToSgd] = useState(() => parseFloat(localStorage.getItem("fx_usd_sgd") || "1.35"));
  const [myrToSgd, setMyrToSgd] = useState(() => parseFloat(localStorage.getItem("fx_myr_sgd") || "0.30"));
  const [fxStatus, setFxStatus] = useState("idle"); // "idle" | "loading" | "live" | "error"

  useEffect(() => { localStorage.setItem("fx_usd_sgd", usdToSgd); }, [usdToSgd]);
  useEffect(() => { localStorage.setItem("fx_myr_sgd", myrToSgd); }, [myrToSgd]);

  useEffect(() => {
    setFxStatus("loading");
    fetchFxRates()
      .then(rates => {
        setUsdToSgd(parseFloat(rates.usdToSgd.toFixed(4)));
        setMyrToSgd(parseFloat(rates.myrToSgd.toFixed(4)));
        setFxStatus(rates.fromCache ? "live" : "live");
      })
      .catch(() => setFxStatus("error"));
  }, []);

  const readLS = (key, fallback = []) => { try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : fallback; } catch { return fallback; } };

  const [stockHoldings,  setStockHoldings]  = useState(() => readLS("stocks_v1"));
  const [cryptoHoldings, setCryptoHoldings] = useState(() => readLS("crypto_v1"));
  const [myStocks,       setMyStocks]       = useState(() => readLS("mystocks_v1"));
  const [properties,     setProperties]     = useState(() => readLS("hl_props_v1"));
  const [fdList,         setFdList]         = useState(() => readLS("fd_v1"));

  const readEpf = () => ({
    wage:      parseFloat(localStorage.getItem("epf_wage")        || "0"),
    age:       parseInt(localStorage.getItem("epf_age")           || "30"),
    increment: parseFloat(localStorage.getItem("epf_increment")   || "3"),
    dividend:  parseFloat(localStorage.getItem("epf_dividend")    || "5.5"),
    startPer:  parseFloat(localStorage.getItem("epf_per_start")   || "0"),
    startSej:  parseFloat(localStorage.getItem("epf_sej_start")   || "0"),
    startFlek: parseFloat(localStorage.getItem("epf_flek_start")  || "0"),
  });
  const [epfSettings, setEpfSettings] = useState(readEpf);

  // Price caches — written by portfolio tabs, read here. A storage event fires
  // when another tab (or window) writes to localStorage, keeping this in sync.
  const [stockPrices,   setStockPrices]   = useState(() => readLS("stocks_prices_v1",   {}));
  const [cryptoPrices,  setCryptoPrices]  = useState(() => readLS("crypto_prices_v1",   {}));
  const [myStockPrices, setMyStockPrices] = useState(() => readLS("mystocks_prices_v1", {}));

  useEffect(() => {
    const HANDLERS = {
      "stocks_v1":          v => setStockHoldings(v ?? []),
      "crypto_v1":          v => setCryptoHoldings(v ?? []),
      "mystocks_v1":        v => setMyStocks(v ?? []),
      "hl_props_v1":        v => setProperties(v ?? []),
      "fd_v1":              v => setFdList(v ?? []),
      "stocks_prices_v1":   v => setStockPrices(v ?? {}),
      "crypto_prices_v1":   v => setCryptoPrices(v ?? {}),
      "mystocks_prices_v1": v => setMyStockPrices(v ?? {}),
      "epf_wage":           () => setEpfSettings(readEpf()),
      "epf_age":            () => setEpfSettings(readEpf()),
      "epf_increment":      () => setEpfSettings(readEpf()),
      "epf_dividend":       () => setEpfSettings(readEpf()),
    };
    function onStorage(e) {
      const handler = HANDLERS[e.key];
      if (!handler) return;
      try { handler(e.newValue ? JSON.parse(e.newValue) : null); } catch {}
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const epfProjection = useMemo(() => {
    if (!epfSettings.wage || yearsToProject < 1) return [];
    return projectEpfYears({
      wage: epfSettings.wage, age: epfSettings.age,
      annualIncrement: epfSettings.increment, years: yearsToProject,
      dividendRate: epfSettings.dividend,
      startPer: epfSettings.startPer, startSej: epfSettings.startSej, startFlek: epfSettings.startFlek,
    });
  }, [epfSettings, yearsToProject]);


  // Per-holding market value: live price × qty when available, cost basis otherwise
  const stocksValue  = stockHoldings.reduce((s, h) => {
    const lp = stockPrices[h.ticker];
    return s + (lp ? h.shares * lp.price : h.shares * h.avgCost + (h.totalFees || 0));
  }, 0);
  const cryptoValue  = cryptoHoldings.reduce((s, h) => {
    const lp = cryptoPrices[h.ticker];
    return s + (lp ? h.amount * lp.price : h.amount * h.buyPrice + (h.totalFees || 0));
  }, 0);
  const myStockValue = myStocks.reduce((s, h) => {
    const lp = myStockPrices[h.code];
    return s + (lp ? h.shares * lp.price : h.shares * h.avgCost + (h.totalFees || 0));
  }, 0);

  // Track which categories are using live prices vs cost basis
  const stocksLive   = stockHoldings.some(h => stockPrices[h.ticker]);
  const cryptoLive   = cryptoHoldings.some(h => cryptoPrices[h.ticker]);
  const myStocksLive = myStocks.some(h => myStockPrices[h.code]);

  const fdPrincipal   = fdList.reduce((s, fd) => s + (parseFloat(fd.principal) || 0), 0);
  const housingEquity = properties.reduce((s, p) => {
    const paid = (p.downpaymentRecords || []).reduce((a, r) => a + (r.amount || 0), 0);
    return s + paid;
  }, 0);
  const epfStart = epfSettings.startPer + epfSettings.startSej + epfSettings.startFlek;

  const chartData = useMemo(() => {
    const n = projectionData.length;
    return Array.from({ length: n }, (_, i) => {
      const cpf      = projectionData[i]?.total || 0;
      const epfMYR   = i === 0 ? epfStart : (epfProjection[i - 1]?.total ?? epfStart);
      const epf      = Math.round(epfMYR * myrToSgd);
      const housing  = Math.round(housingEquity * myrToSgd);
      const myStk    = Math.round(myStockValue * myrToSgd);
      const usAssets = Math.round((stocksValue + cryptoValue) * usdToSgd);
      const fds      = Math.round(fdPrincipal * myrToSgd);
      return {
        year: i,
        age: projectionData[i]?.age ?? i,
        cpf, epf, housing, myStk, usAssets, fds,
        total: cpf + epf + housing + myStk + usAssets + fds,
      };
    });
  }, [projectionData, epfProjection, epfStart, myrToSgd, usdToSgd, housingEquity, myStockValue, stocksValue, cryptoValue, fdPrincipal]);

  const today  = chartData[0] || {};
  const finale = chartData[chartData.length - 1] || {};

  const fmtSGD  = v => "S$" + Math.round(v).toLocaleString();
  const inputStyle = { background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 10px", color: "var(--text)", fontSize: 13, width: "100%", maxWidth: 140 };
  const cardStyle  = { borderRadius: 12, padding: "14px 18px", background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)" };

  const SERIES = [
    { key: "cpf",      label: "CPF (SGD)",             color: "#6ee7b7", note: "projected" },
    { key: "epf",      label: "EPF (MYR→SGD)",          color: "#6366f1", note: epfSettings.wage ? "projected" : "cost basis" },
    { key: "housing",  label: "Housing Equity (MYR)",   color: "#f472b6", note: "cost basis" },
    { key: "myStk",    label: "MY Stocks (MYR)",        color: "#38bdf8", note: myStocksLive ? "live" : "cost basis" },
    { key: "usAssets", label: "US Stocks+Crypto (USD)", color: "#fbbf24", note: (stocksLive || cryptoLive) ? "live" : "cost basis" },
    { key: "fds",      label: "Fixed Deposits (MYR)",   color: "#34d399", note: "principal" },
  ].filter(s => (today[s.key] || 0) > 0 || s.key === "cpf");

  const gradId = k => `nwGrad_${k}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

      <div style={{ ...cardStyle }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: "var(--label)", fontWeight: 600 }}>FX Rates (to SGD)</div>
          {fxStatus === "loading" && <span style={{ fontSize: 10, color: "var(--muted)" }}>fetching…</span>}
          {fxStatus === "live"    && <span style={{ fontSize: 10, color: "#6ee7b7" }}>● live (frankfurter.app)</span>}
          {fxStatus === "error"   && <span style={{ fontSize: 10, color: "#f87171" }}>⚠ offline — using saved rates</span>}
        </div>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>1 USD =</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input type="number" min={0} step={0.01} value={usdToSgd} onChange={e => setUsdToSgd(parseFloat(e.target.value) || 0)} style={inputStyle} />
              <span style={{ fontSize: 13, color: "var(--muted)" }}>SGD</span>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>1 MYR =</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input type="number" min={0} step={0.001} value={myrToSgd} onChange={e => setMyrToSgd(parseFloat(e.target.value) || 0)} style={inputStyle} />
              <span style={{ fontSize: 13, color: "var(--muted)" }}>SGD</span>
            </div>
          </div>
          <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.6 }}>
            ≈ 1 SGD = {myrToSgd > 0 ? (1 / myrToSgd).toFixed(2) : "—"} MYR<br />
            ≈ 1 SGD = {usdToSgd > 0 ? (1 / usdToSgd).toFixed(4) : "—"} USD
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
        {SERIES.map(({ key, label, color }) => (
          <div key={key} style={{ ...cardStyle, borderLeft: `3px solid ${color}` }}>
            <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color }}>{fmtSGD(today[key] || 0)}</div>
          </div>
        ))}
        <div style={{ ...cardStyle, borderLeft: "3px solid #fff" }}>
          <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 4 }}>Total Today</div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{fmtSGD(today.total || 0)}</div>
        </div>
      </div>

      <div style={{ ...cardStyle, background: "rgba(110,231,183,0.06)", border: "1px solid rgba(110,231,183,0.2)", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 11, color: "var(--muted)" }}>Projected Net Worth in {yearsToProject} years (Age {finale.age})</div>
          <div style={{ fontSize: 28, fontWeight: 800, fontFamily: "'DM Mono', monospace", color: "#6ee7b7", marginTop: 4 }}>{fmtSGD(finale.total || 0)}</div>
        </div>
        <div style={{ fontSize: 13, color: "var(--muted)" }}>
          {today.total > 0 && finale.total > today.total && (
            <span style={{ color: "#6ee7b7", fontWeight: 600 }}>+{fmtSGD(finale.total - today.total)}</span>
          )}
          {today.total > 0 && <span style={{ marginLeft: 6 }}>({today.total > 0 ? ((finale.total / today.total - 1) * 100).toFixed(0) : 0}% growth)</span>}
        </div>
      </div>

      <div style={cardStyle}>
        <div style={{ fontSize: 12, color: "var(--label)", fontWeight: 600, marginBottom: 16 }}>Net Worth Trajectory (SGD)</div>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <defs>
              {SERIES.map(({ key, color }) => (
                <linearGradient key={key} id={gradId(key)} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={color} stopOpacity={0.45} />
                  <stop offset="95%" stopColor={color} stopOpacity={0.05} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey="age"
              tick={{ fontSize: 11, fill: "var(--muted)" }}
              label={{ value: "Age", position: "insideBottomRight", offset: -5, fontSize: 11, fill: "var(--muted)" }}
            />
            <YAxis
              tickFormatter={v => v >= 1000000 ? "S$" + (v / 1000000).toFixed(1) + "M" : v >= 1000 ? "S$" + (v / 1000).toFixed(0) + "k" : "S$" + v}
              tick={{ fontSize: 10, fill: "var(--muted)" }}
            />
            <Tooltip
              formatter={(v, name) => [fmtSGD(v), name]}
              contentStyle={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
              labelFormatter={l => `Age ${l}`}
            />
            {SERIES.map(({ key, label, color }) => (
              <Area key={key} type="monotone" dataKey={key} name={label} stackId="1"
                stroke={color} fill={`url(#${gradId(key)})`} strokeWidth={1.5} dot={false} />
            ))}
          </AreaChart>
        </ResponsiveContainer>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 12 }}>
          {SERIES.map(({ key, label, color, note }) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: "var(--muted)" }}>{label}</span>
              {note === "live"       && <span style={{ fontSize: 10, color: "#6ee7b7", fontStyle: "italic" }}>● live</span>}
              {note === "cost basis" && <span style={{ fontSize: 10, color: "var(--muted)", fontStyle: "italic" }}>(cost basis)</span>}
              {note === "principal"  && <span style={{ fontSize: 10, color: "var(--muted)", fontStyle: "italic" }}>(principal)</span>}
            </div>
          ))}
        </div>
      </div>

      <div style={cardStyle}>
        <div style={{ fontSize: 12, color: "var(--label)", fontWeight: 600, marginBottom: 10 }}>Year-by-Year (SGD)</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ color: "var(--muted)", borderBottom: "1px solid var(--border)" }}>
                {["Yr", "Age", ...SERIES.map(s => s.label), "Total"].map(h => (
                  <th key={h} style={{ padding: "6px 8px", textAlign: "right", fontWeight: 500, whiteSpace: "nowrap", fontSize: 11 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {chartData.map((row, i) => (
                <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)" }}>
                  <td style={{ padding: "5px 8px", textAlign: "right", color: "var(--muted)" }}>{row.year}</td>
                  <td style={{ padding: "5px 8px", textAlign: "right", color: "var(--muted)" }}>{row.age}</td>
                  {SERIES.map(({ key, color }) => (
                    <td key={key} style={{ padding: "5px 8px", textAlign: "right", color, fontFamily: "'DM Mono', monospace" }}>
                      {fmtSGD(row[key] || 0)}
                    </td>
                  ))}
                  <td style={{ padding: "5px 8px", textAlign: "right", fontWeight: 700, fontFamily: "'DM Mono', monospace" }}>
                    {fmtSGD(row.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ padding: "12px 16px", borderRadius: 10, background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", fontSize: 11, color: "var(--muted)", lineHeight: 1.7 }}>
        <strong style={{ color: "var(--label)" }}>Note:</strong> Stocks and crypto use <strong style={{ color: "var(--label)" }}>live market prices</strong> when available (fetched in the portfolio tabs) — labelled <span style={{ color: "#6ee7b7" }}>● live</span> in the legend. When no prices have been fetched yet, cost basis is used instead. CPF and EPF are projected year-by-year. Housing equity reflects downpayments recorded. FX rates are user-defined. All snapshot values are flat (no future appreciation assumed). For personal planning only — not financial advice.
      </div>
    </div>
  );
}
