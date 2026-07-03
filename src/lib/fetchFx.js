import { fetchWithTimeout } from "./fetchWithTimeout.js";

const FX_CACHE_KEY = "_fx_cache";
const FX_TTL = 3_600_000; // 1 hour

export async function fetchFxRates() {
  const readCache = () => {
    try { return JSON.parse(localStorage.getItem(FX_CACHE_KEY) || "null"); } catch { return null; }
  };

  const cached = readCache();
  if (cached && Date.now() - cached.ts < FX_TTL) return { ...cached.rates, fromCache: true };

  let data;
  try {
    const res = await fetchWithTimeout("https://api.frankfurter.app/latest?from=USD&to=SGD,MYR");
    if (!res.ok) throw new Error(`FX fetch failed: HTTP ${res.status}`);
    data = await res.json();
  } catch (err) {
    // Network down or API unreachable: serve a stale cache over failing outright
    if (cached?.rates) return { ...cached.rates, fromCache: true, stale: true };
    throw err;
  }

  const rates = {
    usdToSgd: data.rates.SGD,
    myrToSgd: data.rates.SGD / data.rates.MYR,
  };
  try {
    localStorage.setItem(FX_CACHE_KEY, JSON.stringify({ ts: Date.now(), rates }));
  } catch {}
  return rates;
}
