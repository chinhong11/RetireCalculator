// ─── localStorage schema versioning & migrations ─────────────────────────────

export const SCHEMA_KEY = "_schema_version";
export const CURRENT_VERSION = 1;

// Read, transform, and write back an array collection stored in localStorage.
function safeMap(key, fn) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return;
    localStorage.setItem(key, JSON.stringify(arr.map(fn)));
  } catch {}
}

// ─── v0 → v1 ─────────────────────────────────────────────────────────────────
// Backfill optional fields that were added after initial release.
// Every record must have `id`; specific collections get their own field defaults.
function migrate_0_to_1() {
  const uid = () => Math.random().toString(36).slice(2, 10);

  // Ensure every record in every array collection has an id
  for (const key of ["stocks_v1", "crypto_v1", "mystocks_v1", "hl_props_v1", "fd_v1", "sav_expenses_v1", "goals_v1"]) {
    safeMap(key, r => ({ id: uid(), ...r }));
  }

  // stocks: ensure totalFees and notes fields exist
  safeMap("stocks_v1", r => ({
    totalFees: 0,
    notes: "",
    buyDate: "",
    ...r,
  }));

  // crypto: same optional fields
  safeMap("crypto_v1", r => ({
    totalFees: 0,
    notes: "",
    buyDate: "",
    ...r,
  }));

  // mystocks (Bursa): same optional fields
  safeMap("mystocks_v1", r => ({
    totalFees: 0,
    notes: "",
    buyDate: "",
    ...r,
  }));

  // fd: ensure notes field exists
  safeMap("fd_v1", r => ({
    notes: "",
    ...r,
  }));

  // goals: ensure notes field exists
  safeMap("goals_v1", r => ({
    notes: "",
    currency: "SGD",
    ...r,
  }));

  // hl_props: ensure downpaymentRecords and progressiveRecords arrays exist
  safeMap("hl_props_v1", r => ({
    downpaymentRecords: [],
    progressiveRecords: [],
    developer: "",
    address: "",
    type: "",
    spaDate: "",
    vpDate: "",
    ...r,
  }));

  // sav_expenses: ensure note field exists (singular, distinct from notes)
  safeMap("sav_expenses_v1", r => ({
    note: "",
    ...r,
  }));
}

// Ordered list of migration functions — index N upgrades schema from N to N+1.
const MIGRATIONS = [
  migrate_0_to_1, // 0 → 1
];

export function runMigrations() {
  let version = 0;
  try {
    const stored = localStorage.getItem(SCHEMA_KEY);
    if (stored !== null) version = parseInt(stored, 10) || 0;
  } catch {}

  if (version >= CURRENT_VERSION) return;

  for (let v = version; v < CURRENT_VERSION; v++) {
    try {
      MIGRATIONS[v]();
      localStorage.setItem(SCHEMA_KEY, String(v + 1));
    } catch {}
  }
}
