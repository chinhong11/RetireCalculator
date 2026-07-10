import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "./supabase.js";
import { LS_KEYS } from "./backup.js";
import { decideSyncAction } from "./syncDecision.js";
import { PERSIST_EVENT } from "./usePersistedState.js";

// Last snapshot known to match the cloud (set after every successful push or
// pull). Lets reconciliation tell "local changed" apart from "remote changed".
const SYNC_BASE_KEY = "_cloud_sync_base";

// Key-order-independent serialization. The remote snapshot round-trips
// through Postgres (jsonb reorders object keys), so byte-comparing plain
// JSON.stringify output would never match and reconciliation would thrash.
export function canonicalJson(obj) {
  return JSON.stringify(Object.fromEntries(
    Object.entries(obj).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  ));
}

function readLocalData() {
  const data = {};
  for (const key of LS_KEYS) {
    const val = localStorage.getItem(key);
    if (val !== null) data[key] = val;
  }
  return data;
}

// Make local storage mirror the remote snapshot exactly: keys absent from
// the snapshot are REMOVED, otherwise data deleted on another device would
// survive here and get pushed back to the cloud on the next edit.
export function writeLocalData(data) {
  for (const key of LS_KEYS) {
    try {
      if (key in data) localStorage.setItem(key, String(data[key]));
      else localStorage.removeItem(key);
    } catch {}
  }
}

function readBase() {
  try { return localStorage.getItem(SYNC_BASE_KEY); } catch { return null; }
}

function writeBase(json) {
  try { localStorage.setItem(SYNC_BASE_KEY, json); } catch {}
}

/**
 * Syncs localStorage ↔ Supabase profiles table.
 *
 * Reconciliation runs on INITIAL_SESSION (returning user opening the app —
 * supabase-js v2 does NOT fire SIGNED_IN for a restored session) as well as
 * on interactive SIGNED_IN. A three-way diff against the last-synced baseline
 * decides push vs pull; when both sides changed, the user picks a side
 * instead of either one being silently destroyed.
 *
 * Outbound pushes are debounced and driven by the PERSIST_EVENT that
 * usePersistedState (and the few raw-setItem writers) dispatch on every
 * localStorage write — so edits in ANY tab sync, not just the CPF inputs.
 *
 * @returns {{ user: object|null, syncing: boolean, syncError: string|null, signOut: Function }}
 */
export function useCloudSync() {
  const [user, setUser]         = useState(null);
  const [syncing, setSyncing]   = useState(false);
  const [syncError, setSyncError] = useState(null);
  const debounceRef = useRef(null);
  const userRef     = useRef(null);
  const reconciledRef = useRef(false); // run reconciliation once per page load
  const syncReadyRef  = useRef(false); // block outbound pushes until reconciliation SUCCEEDS

  const pushNow = useCallback(async (u, data, json) => {
    const { error } = await supabase
      .from("profiles")
      .upsert({ id: u.id, data, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    writeBase(json);
  }, []);

  const reconcile = useCallback(async (u) => {
    setSyncing(true);
    setSyncError(null);
    try {
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("data")
        .eq("id", u.id)
        .maybeSingle();
      if (error) throw new Error(error.message);

      const local      = readLocalData();
      const localJson  = canonicalJson(local);
      const remote     = profile?.data ?? null;
      const remoteJson = remote ? canonicalJson(remote) : null;

      let action = decideSyncAction(localJson, remoteJson, readBase());
      if (action === "conflict") {
        action = window.confirm(
          "Your cloud data differs from the data on this device.\n\n" +
          "OK — use CLOUD data (this device's data will be replaced)\n" +
          "Cancel — keep THIS DEVICE's data (the cloud copy will be replaced)"
        ) ? "pull" : "push";
      }

      if (action === "none") {
        writeBase(localJson);
      } else if (action === "push") {
        await pushNow(u, local, localJson);
      } else if (action === "pull") {
        writeLocalData(remote);
        writeBase(remoteJson);
        // Reload so all useState initialisers re-read from localStorage
        window.location.reload();
        return; // don't open the push gate mid-navigation
      }

      // Open the push gate ONLY after a successful reconcile. Opening it on
      // failure (e.g. the select threw) would let the next edit blindly
      // upsert local state over a cloud row that was never read — the exact
      // data-loss class this hook exists to prevent.
      syncReadyRef.current = true;
    } catch (e) {
      setSyncError("Cloud sync failed (changes are NOT being backed up): " + e.message);
    } finally {
      setSyncing(false);
    }
  }, [pushNow]);

  // ── Auth state listener ──────────────────────────────────────────────────
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const u = session?.user ?? null;
      userRef.current = u;
      setUser(u);

      // INITIAL_SESSION fires on page load for an already-signed-in user;
      // SIGNED_IN fires on interactive login. Both need reconciliation.
      if (u && (event === "SIGNED_IN" || event === "INITIAL_SESSION") && !reconciledRef.current) {
        reconciledRef.current = true;
        reconcile(u);
      }
      if (event === "SIGNED_OUT") {
        reconciledRef.current = false;
        syncReadyRef.current  = false;
        // The baseline belongs to the account that just left — a different
        // account signing in must not reconcile against it.
        try { localStorage.removeItem(SYNC_BASE_KEY); } catch {}
      }
    });

    return () => subscription.unsubscribe();
  }, [reconcile]);

  // ── Outbound sync: debounced push on every persisted write ───────────────
  useEffect(() => {
    const schedulePush = () => {
      if (!userRef.current || !syncReadyRef.current) return;
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        const u = userRef.current;
        if (!u || !syncReadyRef.current) return;
        try {
          const data = readLocalData();
          await pushNow(u, data, canonicalJson(data));
          setSyncError(null);
        } catch (e) {
          setSyncError("Sync failed: " + e.message);
        }
      }, 1500);
    };

    window.addEventListener(PERSIST_EVENT, schedulePush);
    return () => {
      window.removeEventListener(PERSIST_EVENT, schedulePush);
      clearTimeout(debounceRef.current);
    };
  }, [pushNow]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    userRef.current = null;
    setUser(null);
  }, []);

  return { user, syncing, syncError, signOut };
}
