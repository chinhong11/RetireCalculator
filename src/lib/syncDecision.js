// ─── Cloud-sync reconciliation decision ───────────────────────────────
// Pure three-way comparison between the local snapshot, the remote (cloud)
// snapshot, and the last-synced baseline recorded after the previous
// successful push or pull. Keeping this pure makes the data-loss-critical
// logic unit-testable without mocking Supabase.

/**
 * @param {string|null} localJson  JSON of the current local snapshot
 * @param {string|null} remoteJson JSON of the cloud snapshot (null = no cloud row yet)
 * @param {string|null} baseJson   JSON of the last-synced snapshot (null = never synced here)
 * @returns {"none"|"push"|"pull"|"conflict"}
 *   none     — already in sync (record baseline)
 *   push     — local has the only changes → upload local
 *   pull     — remote has the only changes → download remote
 *   conflict — both sides changed since baseline (or first sync on a device
 *              where both sides already differ) → caller must ask the user
 */
export function decideSyncAction(localJson, remoteJson, baseJson) {
  if (remoteJson === null) return "push";          // nothing in the cloud yet
  if (remoteJson === localJson) return "none";     // identical — nothing to do
  if (baseJson !== null) {
    if (localJson === baseJson) return "pull";     // only remote changed
    if (remoteJson === baseJson) return "push";    // only local changed
  }
  return "conflict";
}
