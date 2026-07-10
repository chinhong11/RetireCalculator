// ─── usePersistedState ────────────────────────────────────────────────
// useState backed by localStorage. Replaces the repeated
//   const [x, setX] = useState(() => lsFloat("key", fb));
//   useEffect(() => { localStorage.setItem("key", x); }, [x]);
// pairs so serialization lives in exactly one place.

import { useState, useEffect } from "react";

// Fired after every persisted write so cloud sync can schedule a push for
// edits made in ANY tab (not just components wired to a specific trigger).
export const PERSIST_EVENT = "app:persist";

/** Announce a localStorage write to listeners (cloud sync). */
export function notifyPersist() {
  try { window.dispatchEvent(new Event(PERSIST_EVENT)); } catch {}
}

const serializers = {
  float: {
    parse: (raw, fallback) => {
      const n = parseFloat(raw);
      return Number.isFinite(n) ? n : fallback;
    },
    stringify: String,
  },
  string: {
    parse: (raw) => raw,
    stringify: String,
  },
  bool: {
    parse: (raw) => raw === "true",
    stringify: String,
  },
  json: {
    parse: (raw, fallback) => {
      try { return JSON.parse(raw); } catch { return fallback; }
    },
    stringify: JSON.stringify,
  },
  // Like json, but rejects non-array values (guards against corrupted storage
  // crashing .map/.reduce consumers).
  jsonArray: {
    parse: (raw, fallback) => {
      try {
        const v = JSON.parse(raw);
        return Array.isArray(v) ? v : fallback;
      } catch { return fallback; }
    },
    stringify: JSON.stringify,
  },
};

/**
 * @param {string} key localStorage key
 * @param {*} fallback default when the key is absent or unparseable;
 *   pass a function for a lazily-computed default (e.g. legacy-key migration)
 * @param {"float"|"string"|"bool"|"json"|"jsonArray"} type serialization format
 * @returns {[*, Function]} same contract as useState
 */
export function usePersistedState(key, fallback, type = "float") {
  const ser = serializers[type];
  const resolveFallback = () => (typeof fallback === "function" ? fallback() : fallback);

  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) return ser.parse(raw, resolveFallback());
    } catch {}
    return resolveFallback();
  });

  useEffect(() => {
    try { localStorage.setItem(key, ser.stringify(value)); } catch {}
    notifyPersist();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, value]);

  return [value, setValue];
}
