import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "./supabase.js";
import { LS_KEYS } from "./backup.js";

function readLocalData() {
  const data = {};
  for (const key of LS_KEYS) {
    const val = localStorage.getItem(key);
    if (val !== null) data[key] = val;
  }
  return data;
}

function writeLocalData(data) {
  for (const [key, val] of Object.entries(data)) {
    try { localStorage.setItem(key, String(val)); } catch {}
  }
}

/**
 * Syncs localStorage ↔ Supabase profiles table.
 *
 * @param {number} syncTrigger  Increment this whenever persisted state changes
 *                              to trigger a debounced outbound write.
 * @returns {{ user: object|null, syncing: boolean, syncError: string|null, signOut: Function }}
 */
export function useCloudSync(syncTrigger) {
  const [user, setUser]         = useState(null);
  const [syncing, setSyncing]   = useState(false);
  const [syncError, setSyncError] = useState(null);
  const debounceRef = useRef(null);
  const userRef     = useRef(null);

  // ── Auth state listener ──────────────────────────────────────────────────
  useEffect(() => {
    // Restore existing session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user ?? null;
      userRef.current = u;
      setUser(u);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      const u = session?.user ?? null;
      userRef.current = u;
      setUser(u);

      if (event === "SIGNED_IN" && u) {
        setSyncing(true);
        setSyncError(null);
        try {
          const { data: profile, error } = await supabase
            .from("profiles")
            .select("data")
            .eq("id", u.id)
            .maybeSingle();

          if (!error && profile?.data) {
            writeLocalData(profile.data);
            // Reload so all useState initialisers re-read from localStorage
            window.location.reload();
          }
        } catch (e) {
          setSyncError("Could not load cloud data: " + e.message);
        } finally {
          setSyncing(false);
        }
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // ── Outbound sync: debounced write to Supabase ───────────────────────────
  useEffect(() => {
    if (!userRef.current) return;

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const u = userRef.current;
      if (!u) return;
      try {
        const { error } = await supabase
          .from("profiles")
          .upsert({ id: u.id, data: readLocalData(), updated_at: new Date().toISOString() });
        if (error) setSyncError("Sync failed: " + error.message);
        else setSyncError(null);
      } catch (e) {
        setSyncError("Sync failed: " + e.message);
      }
    }, 1500);

    return () => clearTimeout(debounceRef.current);
  }, [syncTrigger]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    userRef.current = null;
    setUser(null);
  }, []);

  return { user, syncing, syncError, signOut };
}
