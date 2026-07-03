import { describe, it, expect } from "vitest";

import {
  totalDownpayment, loanSummary,
  progressiveTimeline, totalProgressiveInterest,
  amortizationSchedule,
} from "../housing.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const baseProp = {
  id: "t1", name: "Test Condo", type: "under_construction",
  purchasePrice: 500000, interestRate: 4.0, tenure: 35,
  spaDate: "", vpDate: "",
  downpaymentRecords: [], progressiveRecords: [],
};

const withDp = (records) => ({ ...baseProp, downpaymentRecords: records });

// ─── totalDownpayment ─────────────────────────────────────────────────────────

describe("totalDownpayment", () => {
  it("sums all record amounts", () => {
    expect(totalDownpayment(withDp([{ amount: 10000 }, { amount: 40000 }]))).toBe(50000);
  });
  it("returns 0 for no records / missing array / null property", () => {
    expect(totalDownpayment(baseProp)).toBe(0);
    expect(totalDownpayment({ ...baseProp, downpaymentRecords: undefined })).toBe(0);
    expect(totalDownpayment(null)).toBe(0);
  });
  it("treats missing amounts as 0", () => {
    expect(totalDownpayment(withDp([{ amount: 5000 }, { note: "booking fee" }]))).toBe(5000);
  });
});

// ─── loanSummary — golden values ──────────────────────────────────────────────

describe("loanSummary", () => {
  it("RM500k @ 4.0% over 35 years (no downpayment) → RM2,213.87/month", () => {
    const s = loanSummary(baseProp);
    expect(s.loanAmount).toBe(500000);
    expect(s.monthlyInstallment).toBeCloseTo(2213.87, 2);
    expect(s.totalPayable).toBeCloseTo(929826.96, 1);
    expect(s.totalInterest).toBeCloseTo(429826.96, 1);
  });

  it("RM300k @ 4.5% over 30 years → RM1,520.06/month", () => {
    const s = loanSummary({ ...baseProp, purchasePrice: 300000, interestRate: 4.5, tenure: 30 });
    expect(s.monthlyInstallment).toBeCloseTo(1520.06, 2);
  });

  it("0% interest is simple division: RM120k over 10 years → RM1,000/month, zero interest", () => {
    const s = loanSummary({ ...baseProp, purchasePrice: 120000, interestRate: 0, tenure: 10 });
    expect(s.monthlyInstallment).toBe(1000);
    expect(s.totalInterest).toBe(0);
  });

  it("downpayments reduce the loan amount", () => {
    const s = loanSummary(withDp([{ amount: 50000 }, { amount: 25000 }]));
    expect(s.downpaid).toBe(75000);
    expect(s.loanAmount).toBe(425000);
  });

  it("over-downpayment clamps loan to 0 (never negative)", () => {
    const s = loanSummary(withDp([{ amount: 600000 }]));
    expect(s.loanAmount).toBe(0);
    expect(s.monthlyInstallment).toBe(0);
    expect(s.totalInterest).toBe(0);
  });

  it("handles null property without throwing", () => {
    const s = loanSummary(null);
    expect(s.loanAmount).toBe(0);
    expect(s.monthlyInstallment).toBe(0);
  });
});

// ─── amortizationSchedule — structural invariants ─────────────────────────────

describe("amortizationSchedule", () => {
  const prop = { ...baseProp, purchasePrice: 500000, interestRate: 4.0, tenure: 35 };
  const sched = amortizationSchedule(prop);

  it("has tenure × 12 rows", () => {
    expect(sched).toHaveLength(420);
  });

  it("total principal repaid equals the loan amount", () => {
    const totalPrincipal = sched.reduce((s, r) => s + r.principal, 0);
    expect(totalPrincipal).toBeCloseTo(500000, 2);
  });

  it("each month's closing equals next month's opening", () => {
    for (let i = 0; i < sched.length - 1; i++) {
      expect(sched[i].closing).toBeCloseTo(sched[i + 1].opening, 10);
    }
  });

  it("balance decreases monotonically and ends at 0", () => {
    for (const row of sched) {
      expect(row.closing).toBeLessThanOrEqual(row.opening);
      expect(row.closing).toBeGreaterThanOrEqual(0);
    }
    expect(sched[sched.length - 1].closing).toBeCloseTo(0, 4);
  });

  it("principal + interest ≈ installment for every non-final month", () => {
    const { monthlyInstallment } = loanSummary(prop);
    for (const row of sched.slice(0, -1)) {
      expect(row.principal + row.interest).toBeCloseTo(monthlyInstallment, 6);
    }
  });

  it("total interest matches loanSummary.totalInterest", () => {
    const totalInterest = sched.reduce((s, r) => s + r.interest, 0);
    expect(totalInterest).toBeCloseTo(loanSummary(prop).totalInterest, 0);
  });

  it("year field groups months 1-12 → 1, 13-24 → 2, …", () => {
    expect(sched[0].year).toBe(1);
    expect(sched[11].year).toBe(1);
    expect(sched[12].year).toBe(2);
    expect(sched[419].year).toBe(35);
  });

  it("0% loan amortizes linearly with zero interest", () => {
    const s = amortizationSchedule({ ...baseProp, purchasePrice: 120000, interestRate: 0, tenure: 10 });
    expect(s).toHaveLength(120);
    expect(s.every(r => r.interest === 0)).toBe(true);
    expect(s[0].principal).toBeCloseTo(1000, 6);
  });

  it("returns [] for zero loan / missing tenure / null", () => {
    expect(amortizationSchedule(withDp([{ amount: 500000 }]))).toEqual([]);
    expect(amortizationSchedule({ ...baseProp, tenure: 0 })).toEqual([]);
    expect(amortizationSchedule(null)).toEqual([]);
  });

  it("under-construction: repayment dates start at VP date", () => {
    const s = amortizationSchedule({ ...baseProp, vpDate: "2027-06" });
    expect(s[0].date).toMatch(/Jun 2027/);
  });

  it("completed/subsale: repayment dates start 1 month after SPA date", () => {
    const s = amortizationSchedule({ ...baseProp, type: "completed", spaDate: "2026-03" });
    expect(s[0].date).toMatch(/Apr 2026/);
  });

  it("no reference date → empty date strings", () => {
    expect(amortizationSchedule(baseProp)[0].date).toBe("");
  });
});

// ─── progressiveTimeline ──────────────────────────────────────────────────────

describe("progressiveTimeline", () => {
  const prog = {
    ...baseProp,
    interestRate: 4.0, // 4%/yr → 0.333…%/month
    vpDate: "2027-01",
    progressiveRecords: [
      { id: "a", month: "2026-01", claimAmount: 100000, stage: "Foundation" },
      { id: "b", month: "2026-07", claimAmount: 100000, stage: "Structure" },
    ],
  };

  it("cumulative disbursement accumulates across records", () => {
    const t = progressiveTimeline(prog);
    expect(t[0].cumulative).toBe(100000);
    expect(t[1].cumulative).toBe(200000);
  });

  it("monthly interest is cumulative × monthly rate", () => {
    const t = progressiveTimeline(prog);
    expect(t[0].monthlyInterest).toBeCloseTo(100000 * 0.04 / 12, 6); // 333.33
    expect(t[1].monthlyInterest).toBeCloseTo(200000 * 0.04 / 12, 6); // 666.67
  });

  it("stage duration runs from claim month to next claim, last stage to VP date", () => {
    const t = progressiveTimeline(prog);
    expect(t[0].stageDuration).toBe(6);  // Jan → Jul 2026
    expect(t[1].stageDuration).toBe(6);  // Jul 2026 → Jan 2027 (VP)
  });

  it("stage interest total = monthly interest × duration", () => {
    const t = progressiveTimeline(prog);
    expect(t[0].stageInterestTotal).toBeCloseTo(333.3333 * 6, 1);
    expect(t[1].stageInterestTotal).toBeCloseTo(666.6667 * 6, 1);
  });

  it("totalProgressiveInterest sums all stages", () => {
    expect(totalProgressiveInterest(prog)).toBeCloseTo((333.3333 + 666.6667) * 6, 1);
  });

  it("no VP date → last stage falls back to a single month of interest", () => {
    const t = progressiveTimeline({ ...prog, vpDate: "" });
    expect(t[1].stageDuration).toBeNull();
    expect(t[1].stageInterestTotal).toBeCloseTo(t[1].monthlyInterest, 6);
  });

  it("VP date before last claim → duration null (no negative durations)", () => {
    const t = progressiveTimeline({ ...prog, vpDate: "2026-03" });
    expect(t[1].stageDuration).toBeNull();
    expect(t[1].stageInterestTotal).toBeGreaterThan(0);
  });

  it("empty records / null property → []", () => {
    expect(progressiveTimeline(baseProp)).toEqual([]);
    expect(progressiveTimeline(null)).toEqual([]);
  });
});
