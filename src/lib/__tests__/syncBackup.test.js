// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";

import { decideSyncAction } from "../syncDecision.js";
import { collectBackupData, restoreBackupData, LS_KEYS } from "../backup.js";

// ─── decideSyncAction — the data-loss-critical decision matrix ────────────────

describe("decideSyncAction", () => {
  const A = JSON.stringify({ cpf_salary: "5000" });
  const B = JSON.stringify({ cpf_salary: "7000" });
  const C = JSON.stringify({ cpf_salary: "9000" });

  it("no cloud row yet → push local up", () => {
    expect(decideSyncAction(A, null, null)).toBe("push");
    expect(decideSyncAction(A, null, A)).toBe("push");
  });

  it("local and remote identical → nothing to do", () => {
    expect(decideSyncAction(A, A, null)).toBe("none");
    expect(decideSyncAction(A, A, B)).toBe("none");
  });

  it("only remote changed since baseline → pull (returning user, device 2)", () => {
    // local == base, remote is newer: the INITIAL_SESSION bug scenario —
    // device 2 must download the cloud data, not overwrite it
    expect(decideSyncAction(A, B, A)).toBe("pull");
  });

  it("only local changed since baseline → push", () => {
    // remote == base, local has offline edits
    expect(decideSyncAction(B, A, A)).toBe("push");
  });

  it("both sides changed since baseline → conflict (never silently clobber)", () => {
    expect(decideSyncAction(B, C, A)).toBe("conflict");
  });

  it("no baseline and sides differ → conflict (anonymous work + existing account)", () => {
    // The sign-in clobber bug scenario: newer anonymous local data vs an old
    // cloud snapshot. Must surface a conflict, not auto-pull.
    expect(decideSyncAction(B, A, null)).toBe("conflict");
  });
});

// ─── Backup export → import round-trip ────────────────────────────────────────

describe("backup round-trip", () => {
  beforeEach(() => localStorage.clear());

  it("plain-string keys survive a round-trip without gaining quotes", () => {
    localStorage.setItem("active_tab", "summary");
    localStorage.setItem("hl_selid_v1", "m3ab12cd");
    localStorage.setItem("theme", "light");

    const backup = collectBackupData();
    localStorage.clear();
    restoreBackupData(backup);

    // The old import wrote "\"summary\"" (with literal quotes), which matched
    // no tab id and left the app with no tab rendered
    expect(localStorage.getItem("active_tab")).toBe("summary");
    expect(localStorage.getItem("hl_selid_v1")).toBe("m3ab12cd");
    expect(localStorage.getItem("theme")).toBe("light");
  });

  it("numbers, bools, and JSON collections round-trip to identical raw storage", () => {
    localStorage.setItem("cpf_salary", "5000");
    localStorage.setItem("cpf_sa_shield_on", "true");
    localStorage.setItem("stocks_v1", JSON.stringify([{ id: "x", shares: 10 }]));

    const backup = collectBackupData();
    localStorage.clear();
    restoreBackupData(backup);

    expect(localStorage.getItem("cpf_salary")).toBe("5000");
    expect(localStorage.getItem("cpf_sa_shield_on")).toBe("true");
    expect(JSON.parse(localStorage.getItem("stocks_v1"))).toEqual([{ id: "x", shares: 10 }]);
  });

  it("restores legacy backup files that already contain typed values", () => {
    // Files produced by the old exportBackup: numbers/bools/arrays as JSON
    // types, plain strings as bare strings
    restoreBackupData({ cpf_salary: 5000, fire_incl_epf: true, active_tab: "housing", goals_v1: [] });

    expect(localStorage.getItem("cpf_salary")).toBe("5000");
    expect(localStorage.getItem("fire_incl_epf")).toBe("true");
    expect(localStorage.getItem("active_tab")).toBe("housing");
    expect(localStorage.getItem("goals_v1")).toBe("[]");
  });

  it("ignores keys not in LS_KEYS (no arbitrary storage writes from a crafted file)", () => {
    restoreBackupData({ evil_key: "payload", cpf_salary: 1234 });
    expect(localStorage.getItem("evil_key")).toBeNull();
    expect(localStorage.getItem("cpf_salary")).toBe("1234");
  });

  it("LS_KEYS includes theme so appearance survives backup and cloud sync", () => {
    expect(LS_KEYS).toContain("theme");
  });
});
