// fetch() never times out on its own — a hung price API leaves the UI
// spinner stuck forever. Abort after `ms` so callers get a catchable error.
export async function fetchWithTimeout(url, ms = 10_000, options = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } catch (err) {
    if (err.name === "AbortError") throw new Error("Request timed out — try again");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
