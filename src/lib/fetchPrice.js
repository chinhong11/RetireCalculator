// Routes Yahoo Finance chart fetches through the proxy when VITE_PRICE_PROXY_URL
// is set, falls back to querying Yahoo directly otherwise (useful in local dev).

const PROXY    = import.meta.env.VITE_PRICE_PROXY_URL?.replace(/\/$/, "") ?? "";
const DIRECT   = "https://query1.finance.yahoo.com/v8/finance/chart";

export async function fetchYahooChart(ticker) {
  const base = PROXY ? `${PROXY}/price` : DIRECT;
  const res  = await fetch(`${base}/${encodeURIComponent(ticker)}?interval=1d&range=1d`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const meta = data?.chart?.result?.[0]?.meta;
  if (!meta?.regularMarketPrice) throw new Error("Price unavailable");
  return {
    price:     meta.regularMarketPrice,
    prevClose: meta.previousClose ?? meta.chartPreviousClose ?? null,
  };
}
