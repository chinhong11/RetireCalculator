const FX_CACHE_KEY = "_fx_cache";
const FX_TTL = 3_600_000; // 1 hour

export async function fetchFxRates() {
  try {
    const cached = JSON.parse(localStorage.getItem(FX_CACHE_KEY) || "null");
    if (cached && Date.now() - cached.ts < FX_TTL) return { ...cached.rates, fromCache: true };
  } catch {}

  const res = await fetch("https://api.frankfurter.app/latest?from=USD&to=SGD,MYR");
  if (!res.ok) throw new Error(`FX fetch failed: HTTP ${res.status}`);
  const data = await res.json();

  const rates = {
    usdToSgd: data.rates.SGD,
    myrToSgd: data.rates.SGD / data.rates.MYR,
  };
  try {
    localStorage.setItem(FX_CACHE_KEY, JSON.stringify({ ts: Date.now(), rates }));
  } catch {}
  return rates;
}
