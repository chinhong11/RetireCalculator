import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  getRateKey, getAllocationKey, getSPRKey,
  getContribRates, getAllocation,
  computeMonthly, projectYears,
  OW_CEILING, CPF_FRS_2026, CPF_BHS_2026, CPF_LIFE_RATE,
  estimateCpfLifePayout,
} from "../cpf.js";

import {
  getEpfRates, computeEpfMonthly, projectEpfYears,
} from "../epf.js";

import { calcInstallment, calcFd } from "../finance.js";
import { runMigrations, SCHEMA_KEY, CURRENT_VERSION } from "../migrations.js";

// ─── CPF rate-table lookups ───────────────────────────────────────────────────

describe("getRateKey", () => {
  it("maps age ≤55 to '55'",  () => expect(getRateKey(30)).toBe("55"));
  it("maps age 55 to '55'",   () => expect(getRateKey(55)).toBe("55"));
  it("maps age 56 to '60'",   () => expect(getRateKey(56)).toBe("60"));
  it("maps age 60 to '60'",   () => expect(getRateKey(60)).toBe("60"));
  it("maps age 61 to '65'",   () => expect(getRateKey(61)).toBe("65"));
  it("maps age 71 to '999'",  () => expect(getRateKey(71)).toBe("999"));
});

describe("getSPRKey", () => {
  it("year 1 → spr1", () => expect(getSPRKey(1)).toBe("spr1"));
  it("year 2 → spr2", () => expect(getSPRKey(2)).toBe("spr2"));
  it("year 3 → spr3", () => expect(getSPRKey(3)).toBe("spr3"));
  it("year 5 → spr3", () => expect(getSPRKey(5)).toBe("spr3"));
});

describe("getContribRates — official CPF table values", () => {
  it("1st-year PR age 30: 5% employee + 4% employer = 9% total", () => {
    const r = getContribRates(30, 1);
    expect(r.employee).toBe(0.05);
    expect(r.employer).toBe(0.04);
    expect(r.total).toBe(0.09);
  });

  it("2nd-year PR age 30: 15% + 9% = 24% total", () => {
    const r = getContribRates(30, 2);
    expect(r.employee).toBe(0.15);
    expect(r.employer).toBe(0.09);
    expect(r.total).toBe(0.24);
  });

  it("3rd-year PR age 30 (full citizen rate): 20% + 17% = 37%", () => {
    const r = getContribRates(30, 3);
    expect(r.employee).toBe(0.20);
    expect(r.employer).toBe(0.17);
    expect(r.total).toBe(0.37);
  });

  it("3rd-year PR age 60: 18% + 16% = 34%", () => {
    const r = getContribRates(60, 3);
    expect(r.employee).toBe(0.18);
    expect(r.employer).toBe(0.16);
    expect(r.total).toBe(0.34);
  });

  it("3rd-year PR age 65: 12.5% + 12.5% = 25%", () => {
    const r = getContribRates(65, 3);
    expect(r.employee).toBe(0.125);
    expect(r.employer).toBe(0.125);
    expect(r.total).toBe(0.25);
  });
});

describe("getAllocation ratios", () => {
  it("age 30 (≤35 bracket) OA+SA+MA ratios sum to 1", () => {
    const a = getAllocation(30);
    expect(a.oa + a.sa + a.ma).toBeCloseTo(1, 4);
  });

  it("age 55 bracket ratios sum to 1", () => {
    const a = getAllocation(55);
    expect(a.oa + a.sa + a.ma).toBeCloseTo(1, 4);
  });

  it("OA share decreases as age increases (age 35 vs age 55)", () => {
    expect(getAllocation(35).oa).toBeGreaterThan(getAllocation(55).oa);
  });
});

// ─── computeMonthly ───────────────────────────────────────────────────────────

describe("computeMonthly", () => {
  it("3rd-year PR, age 30, salary $5,000: employee $1,000, total $1,850", () => {
    // employee = floor(5000 * 0.20) = 1000
    // total    = round(5000 * 0.37) = 1850
    // employer = 1850 - 1000 = 850
    const m = computeMonthly(5000, 30, 3);
    expect(m.employeeContrib).toBe(1000);
    expect(m.totalContrib).toBe(1850);
    expect(m.employerContrib).toBe(850);
    expect(m.takeHome).toBe(4000);
  });

  it("OA + SA + MA equals totalContrib", () => {
    const m = computeMonthly(5000, 30, 3);
    expect(m.oaAmount + m.saAmount + m.maAmount).toBe(m.totalContrib);
  });

  it("caps salary at OW_CEILING ($8,000) for contributions", () => {
    const atCeiling = computeMonthly(OW_CEILING, 30, 3);
    const aboveCeiling = computeMonthly(12000, 30, 3);
    expect(atCeiling.totalContrib).toBe(aboveCeiling.totalContrib);
    expect(atCeiling.employeeContrib).toBe(aboveCeiling.employeeContrib);
  });

  it("take-home reflects uncapped salary minus employee contribution", () => {
    // salary $12,000 but only OW_CEILING deducted via CPF
    const m = computeMonthly(12000, 30, 3);
    expect(m.takeHome).toBe(12000 - m.employeeContrib);
  });

  it("1st-year PR, age 30, salary $5,000: total = 9% of 5,000 = $450", () => {
    const m = computeMonthly(5000, 30, 1);
    expect(m.totalContrib).toBe(Math.round(5000 * 0.09));
    expect(m.employeeContrib).toBe(Math.floor(5000 * 0.05));
  });
});

// ─── projectYears ─────────────────────────────────────────────────────────────

describe("projectYears", () => {
  const base = { salary: 5000, age: 30, prYear: 3, annualIncrement: 0, yearsToProject: 2, oaReturn: 2.5, saReturn: 4, maReturn: 4 };

  it("year 0 row has no contributions (balances start at 0)", () => {
    const rows = projectYears(base);
    expect(rows[0].oa).toBe(0);
    expect(rows[0].sa).toBe(0);
    expect(rows[0].ma).toBe(0);
    expect(rows[0].total).toBe(0);
  });

  it("year 0 row reflects starting salary and age", () => {
    const rows = projectYears(base);
    expect(rows[0].salary).toBe(5000);
    expect(rows[0].age).toBe(30);
  });

  it("non-zero starting balances are preserved at year 0", () => {
    const rows = projectYears({ ...base, oaStart: 10000, saStart: 5000, maStart: 2000 });
    expect(rows[0].oa).toBe(10000);
    expect(rows[0].sa).toBe(5000);
    expect(rows[0].ma).toBe(2000);
  });

  it("year 1 total is strictly greater than year 0 (contributions + interest added)", () => {
    const rows = projectYears(base);
    expect(rows[1].total).toBeGreaterThan(rows[0].total);
  });

  it("year 1 total is at least 12 months of contributions", () => {
    const rows = projectYears(base);
    const m = computeMonthly(5000, 31, 4); // age/prYear advance by 1
    expect(rows[1].total).toBeGreaterThanOrEqual(m.totalContrib * 12);
  });

  it("OA+SA+RA+MA equals total for every row (within 2 due to per-account rounding)", () => {
    const rows = projectYears({ ...base, yearsToProject: 5 });
    rows.forEach(r => expect(Math.abs(r.oa + r.sa + r.ra + r.ma - r.total)).toBeLessThanOrEqual(2));
  });

  it("age increments by 1 each year", () => {
    const rows = projectYears({ ...base, yearsToProject: 3 });
    expect(rows[1].age).toBe(31);
    expect(rows[2].age).toBe(32);
    expect(rows[3].age).toBe(33);
  });

  it("balances grow even with 0% return (contributions-only growth)", () => {
    const rows = projectYears({ ...base, oaReturn: 0, saReturn: 0, maReturn: 0, yearsToProject: 3 });
    expect(rows[3].total).toBeGreaterThan(rows[2].total);
  });
});

// ─── RA formation at 55 ───────────────────────────────────────────────────────

describe("RA formation at age 55", () => {
  // Start at 54, project 2 years so age goes 54 → 55 → 56
  const base55 = {
    salary: 6000, age: 54, prYear: 3, annualIncrement: 0, yearsToProject: 2,
    oaReturn: 2.5, saReturn: 4, maReturn: 4,
    oaStart: 300_000, saStart: 100_000, maStart: 50_000,
    frs: CPF_FRS_2026,
  };

  it("raFormed is false at age 54, true at age 55", () => {
    const rows = projectYears(base55);
    expect(rows[0].raFormed).toBe(false); // age 54
    expect(rows[1].raFormed).toBe(true);  // age 55
    expect(rows[2].raFormed).toBe(true);  // age 56
  });

  it("SA becomes 0 when RA is formed", () => {
    const rows = projectYears(base55);
    expect(rows[0].sa).toBeGreaterThan(0); // SA exists before 55
    expect(rows[1].sa).toBe(0);            // SA = 0 at 55
    expect(rows[2].sa).toBe(0);            // SA stays 0 after 55
  });

  it("RA is 0 before formation, non-zero after", () => {
    const rows = projectYears(base55);
    expect(rows[0].ra).toBe(0);           // no RA before 55
    expect(rows[1].ra).toBeGreaterThan(0); // RA appears at 55
  });

  it("RA at formation is at least the SA balance (SA fully transferred)", () => {
    const rows = projectYears(base55);
    // SA at year 0 grown by one year of interest before the transfer
    const saAfterGrowth = Math.round(base55.saStart * (1 + base55.saReturn / 100));
    expect(rows[1].ra).toBeGreaterThanOrEqual(saAfterGrowth);
  });

  it("RA at end of formation year exceeds FRS (seeded at FRS + year's contributions)", () => {
    // SA (100k) < FRS (213k) so OA tops up to FRS at the transfer moment.
    // rows[1].ra then grows further: extra interest + 12 months of SA-allocation contributions.
    const rows = projectYears(base55);
    expect(rows[1].ra).toBeGreaterThan(CPF_FRS_2026);
  });

  it("OA is reduced by the top-up amount at formation", () => {
    const rows = projectYears(base55);
    // OA at formation = oaStart * (1+oaReturn) - topUp (plus contributions added AFTER formation)
    // Just verify OA is strictly less than it would have been without RA
    const noRa = projectYears({ ...base55, frs: 0 });
    expect(rows[1].oa).toBeLessThan(noRa[1].oa);
  });

  it("when SA >= FRS no OA is transferred", () => {
    // Give SA > FRS: only SA transferred, OA untouched
    const richSA = { ...base55, saStart: 250_000, frs: CPF_FRS_2026 };
    const rows = projectYears(richSA);
    // OA should grow normally without a top-up deduction
    const noRa = projectYears({ ...richSA, frs: 0 });
    expect(rows[1].oa).toBe(noRa[1].oa);
  });

  it("total is continuous across RA formation (no value disappears)", () => {
    const rows = projectYears(base55);
    // Total must still grow from year 0 to year 1 (contributions + interest > 0)
    expect(rows[1].total).toBeGreaterThan(rows[0].total);
  });

  it("user starting at age 55 has raFormed=true from row 0 (saStart treated as RA)", () => {
    const rows = projectYears({ ...base55, age: 55 });
    expect(rows[0].raFormed).toBe(true);
    expect(rows[0].sa).toBe(0);
    expect(rows[0].ra).toBe(base55.saStart);
  });
});

// ─── EPF rate table ───────────────────────────────────────────────────────────

describe("getEpfRates", () => {
  it("age <60, wage ≤5,000: employee 11%, employer 13%", () => {
    const r = getEpfRates(35, 4000);
    expect(r.employee).toBe(0.11);
    expect(r.employer).toBe(0.13);
  });

  it("age <60, wage >5,000: employee 11%, employer 12%", () => {
    const r = getEpfRates(35, 6000);
    expect(r.employee).toBe(0.11);
    expect(r.employer).toBe(0.12);
  });

  it("age ≥60: employee 5.5%, employer 6%", () => {
    const r = getEpfRates(60, 4000);
    expect(r.employee).toBe(0.055);
    expect(r.employer).toBe(0.06);
  });
});

describe("computeEpfMonthly", () => {
  it("persaraan + sejahtera + fleksibel equals total", () => {
    const m = computeEpfMonthly(5000, 35);
    expect(m.persaraan + m.sejahtera + m.fleksibel).toBe(m.total);
  });

  it("total = employee + employer contributions", () => {
    const m = computeEpfMonthly(5000, 35);
    expect(m.total).toBe(m.employeeContrib + m.employerContrib);
  });

  it("take-home = wage − employee contribution", () => {
    const m = computeEpfMonthly(5000, 35);
    expect(m.takeHome).toBe(5000 - m.employeeContrib);
  });

  it("persaraan is 75% of total", () => {
    const m = computeEpfMonthly(4000, 30);
    expect(m.persaraan).toBe(Math.round(m.total * 0.75));
  });
});

describe("projectEpfYears", () => {
  const base = { wage: 5000, age: 30, annualIncrement: 0, years: 3, dividendRate: 5.5, startPer: 0, startSej: 0, startFlek: 0 };

  it("returns exactly `years` entries", () => {
    expect(projectEpfYears(base)).toHaveLength(3);
  });

  it("balances grow year-on-year (contributions + dividend)", () => {
    const rows = projectEpfYears(base);
    expect(rows[1].total).toBeGreaterThan(rows[0].total);
    expect(rows[2].total).toBeGreaterThan(rows[1].total);
  });

  it("per + sej + flek equals total each year", () => {
    projectEpfYears(base).forEach(r => {
      expect(r.per + r.sej + r.flek).toBeCloseTo(r.total, 6);
    });
  });

  it("higher dividend rate produces a larger final balance", () => {
    const low  = projectEpfYears({ ...base, years: 10, dividendRate: 3 });
    const high = projectEpfYears({ ...base, years: 10, dividendRate: 6 });
    expect(high[9].total).toBeGreaterThan(low[9].total);
  });

  it("non-zero starting balances are included from year 1", () => {
    const withStart = projectEpfYears({ ...base, startPer: 50000, startSej: 10000, startFlek: 5000 });
    const noStart   = projectEpfYears(base);
    expect(withStart[0].total).toBeGreaterThan(noStart[0].total);
  });
});

// ─── calcInstallment (housing loan amortization) ──────────────────────────────

describe("calcInstallment", () => {
  it("returns 0 when principal is 0", () => {
    expect(calcInstallment(0, 4, 30)).toBe(0);
  });

  it("returns 0 when tenure is 0", () => {
    expect(calcInstallment(500000, 4, 0)).toBe(0);
  });

  it("0% interest rate: installment = principal / (tenure × 12)", () => {
    expect(calcInstallment(120000, 0, 10)).toBeCloseTo(1000, 2);
  });

  it("standard loan: RM 500k at 4% over 35 years ≈ RM 2,214/mo", () => {
    // M = P·r·(1+r)^n / ((1+r)^n − 1), r=4%/12, n=420
    expect(calcInstallment(500000, 4, 35)).toBeCloseTo(2213.87, 1);
  });

  it("installment decreases as tenure lengthens", () => {
    const short = calcInstallment(500000, 4, 20);
    const long  = calcInstallment(500000, 4, 35);
    expect(short).toBeGreaterThan(long);
  });

  it("installment increases as interest rate rises", () => {
    const low  = calcInstallment(500000, 3, 30);
    const high = calcInstallment(500000, 5, 30);
    expect(high).toBeGreaterThan(low);
  });
});

// ─── calcFd (fixed deposit) ───────────────────────────────────────────────────

describe("calcFd", () => {
  it("returns null when principal is missing", () => {
    expect(calcFd({ principal: "", rate: "3.85", tenureMonths: "12" })).toBeNull();
  });

  it("returns null when rate is missing", () => {
    expect(calcFd({ principal: "50000", rate: "", tenureMonths: "12" })).toBeNull();
  });

  it("RM 50k at 3.85% for 12 months: interest = RM 1,925", () => {
    const r = calcFd({ principal: "50000", rate: "3.85", tenureMonths: "12" });
    expect(r.interest).toBeCloseTo(1925, 2);
    expect(r.maturityValue).toBeCloseTo(51925, 2);
  });

  it("RM 100k at 4% for 6 months: interest = RM 2,000", () => {
    // 100000 * (4/100) * (6/12) = 2000
    const r = calcFd({ principal: "100000", rate: "4", tenureMonths: "6" });
    expect(r.interest).toBeCloseTo(2000, 2);
  });

  it("maturityValue = principal + interest", () => {
    const r = calcFd({ principal: "80000", rate: "3.5", tenureMonths: "9" });
    expect(r.maturityValue).toBeCloseTo(r.interest + 80000, 6);
  });
});

// ─── FIRE number invariant ────────────────────────────────────────────────────

// ─── MA Basic Healthcare Sum (BHS) cap ───────────────────────────────────────

describe("MA BHS cap", () => {
  // Project from age 40 with high salary so MA quickly hits BHS
  const baseBhs = {
    salary: 8000, age: 40, prYear: 3, annualIncrement: 0, yearsToProject: 30,
    oaReturn: 2.5, saReturn: 4, maReturn: 4,
    oaStart: 0, saStart: 0, maStart: 0,
    bhs: CPF_BHS_2026, bhsGrowthRate: 0, frsGrowthRate: 0,
  };

  it("MA never exceeds the BHS (with 0% BHS growth)", () => {
    const rows = projectYears(baseBhs);
    rows.forEach(r => expect(r.ma).toBeLessThanOrEqual(CPF_BHS_2026 + 1)); // +1 for rounding
  });

  it("MA eventually reaches and stays at BHS", () => {
    const rows = projectYears(baseBhs);
    const capped = rows.filter(r => r.ma >= CPF_BHS_2026 - 1);
    expect(capped.length).toBeGreaterThan(0);
  });

  it("total is higher when BHS overflows to SA (overflow is not lost)", () => {
    const withBhs    = projectYears({ ...baseBhs, yearsToProject: 10 });
    // Simulate no BHS cap by setting bhs very high
    const withoutBhs = projectYears({ ...baseBhs, yearsToProject: 10, bhs: 999_999_999 });
    // Total must be equal — overflow goes to SA, not discarded
    const last  = withBhs[withBhs.length - 1];
    const lastU = withoutBhs[withoutBhs.length - 1];
    expect(last.total).toBeCloseTo(lastU.total, -1); // within ~$10
  });

  it("MA overflow goes to SA before age 55", () => {
    const rows = projectYears({ ...baseBhs, yearsToProject: 5 });
    // After BHS is hit, SA should grow faster than without cap
    const noCap = projectYears({ ...baseBhs, yearsToProject: 5, bhs: 999_999_999 });
    const last     = rows[rows.length - 1];
    const lastNoCap = noCap[noCap.length - 1];
    expect(last.sa).toBeGreaterThanOrEqual(lastNoCap.sa);
  });

  it("MA overflow goes to RA after age 55", () => {
    const post55 = projectYears({
      ...baseBhs, age: 55, yearsToProject: 5, maStart: CPF_BHS_2026, saStart: 50000,
    });
    // raFormed should be true from the start; any MA overflow goes to RA
    expect(post55[0].raFormed).toBe(true);
    const noCap = projectYears({
      ...baseBhs, age: 55, yearsToProject: 5, maStart: CPF_BHS_2026, saStart: 50000, bhs: 999_999_999,
    });
    const last     = post55[post55.length - 1];
    const lastNoCap = noCap[noCap.length - 1];
    expect(last.ra).toBeGreaterThanOrEqual(lastNoCap.ra);
  });

  it("BHS grows with bhsGrowthRate so MA can grow further", () => {
    const growing  = projectYears({ ...baseBhs, bhsGrowthRate: 3.5, yearsToProject: 10 });
    const static_  = projectYears({ ...baseBhs, bhsGrowthRate: 0,   yearsToProject: 10 });
    // With a growing BHS cap, MA is allowed to accumulate more
    expect(growing[10].ma).toBeGreaterThan(static_[10].ma);
  });

  it("row includes bhs field reflecting the year's cap", () => {
    const rows = projectYears({ ...baseBhs, bhsGrowthRate: 3.5, yearsToProject: 3 });
    expect(rows[0].bhs).toBe(CPF_BHS_2026);
    expect(rows[3].bhs).toBeGreaterThan(CPF_BHS_2026);
  });
});

// ─── FRS inflation at RA formation ───────────────────────────────────────────

describe("FRS inflation", () => {
  const base55 = {
    salary: 6000, age: 50, prYear: 3, annualIncrement: 0, yearsToProject: 6,
    oaReturn: 2.5, saReturn: 4, maReturn: 4,
    oaStart: 300_000, saStart: 100_000, maStart: 50_000,
    frs: CPF_FRS_2026, bhs: CPF_BHS_2026,
    bhsGrowthRate: 0,
  };

  it("with frsGrowthRate=0, effective FRS equals CPF_FRS_2026", () => {
    const rows = projectYears({ ...base55, frsGrowthRate: 0 });
    const raRow = rows.find(d => d.raFormed && !rows[rows.indexOf(d) - 1]?.raFormed);
    // OA transferred = FRS - SA_after_growth (capped at available OA)
    // Just verify RA at formation is at least FRS
    expect(raRow.ra).toBeGreaterThan(CPF_FRS_2026);
  });

  it("higher frsGrowthRate increases OA top-up (more OA transferred to RA)", () => {
    const low  = projectYears({ ...base55, frsGrowthRate: 0 });
    const high = projectYears({ ...base55, frsGrowthRate: 4 });
    // Higher FRS → more OA transferred → OA lower, RA higher at formation year
    const lowRaYear  = low.find(d => d.raFormed);
    const highRaYear = high.find(d => d.raFormed);
    expect(highRaYear.ra).toBeGreaterThanOrEqual(lowRaYear.ra);
    expect(highRaYear.oa).toBeLessThanOrEqual(lowRaYear.oa);
  });
});

// ─── estimateCpfLifePayout ────────────────────────────────────────────────────

describe("estimateCpfLifePayout", () => {
  const baseProj = {
    salary: 6000, age: 40, prYear: 3, annualIncrement: 0, yearsToProject: 30,
    oaReturn: 2.5, saReturn: 4, maReturn: 4,
    oaStart: 0, saStart: 0, maStart: 0,
    frs: CPF_FRS_2026, bhs: 999_999_999, frsGrowthRate: 0, bhsGrowthRate: 0,
  };

  it("returns null when no RA forms", () => {
    // Project only 10 years from age 40 — RA never forms
    const rows = projectYears({ ...baseProj, yearsToProject: 10 });
    expect(estimateCpfLifePayout(rows, 4)).toBeNull();
  });

  it("returns a result with monthlyPayout > 0 when RA forms and projection covers 65", () => {
    const rows   = projectYears(baseProj); // age 40+30 = 70, covers 65
    const result = estimateCpfLifePayout(rows, 4);
    expect(result).not.toBeNull();
    expect(result.monthlyPayout).toBeGreaterThan(0);
    expect(result.extrapolated).toBe(false);
  });

  it("extrapolates when projection ends before payoutAge", () => {
    // Project to age 60 only — RA forms at 55 but payout at 65 not covered
    const rows   = projectYears({ ...baseProj, yearsToProject: 20 });
    const result = estimateCpfLifePayout(rows, 4);
    expect(result).not.toBeNull();
    expect(result.extrapolated).toBe(true);
    expect(result.fromAge).toBe(60);
    expect(result.payoutAge).toBe(65);
  });

  it("monthlyPayout = raAtPayout * CPF_LIFE_RATE / 12 (rounded)", () => {
    const rows   = projectYears(baseProj);
    const result = estimateCpfLifePayout(rows, 4);
    expect(result.monthlyPayout).toBe(Math.round(result.raAtPayout * CPF_LIFE_RATE / 12));
  });

  it("larger RA produces higher monthly payout", () => {
    const low  = projectYears({ ...baseProj, salary: 4000 });
    const high = projectYears({ ...baseProj, salary: 8000 });
    const payLow  = estimateCpfLifePayout(low,  4);
    const payHigh = estimateCpfLifePayout(high, 4);
    expect(payHigh.monthlyPayout).toBeGreaterThan(payLow.monthlyPayout);
  });
});

// ─── FIRE number formula ──────────────────────────────────────────────────────

describe("FIRE number formula", () => {
  // FIRE number = annual expenses / withdrawal rate (pure arithmetic)
  const fireNumber = (monthlyExp, ratePct) => (monthlyExp * 12) / (ratePct / 100);

  it("4% rule: $3,000/mo expenses → FIRE number = $900,000", () => {
    expect(fireNumber(3000, 4)).toBe(900000);
  });

  it("3% rule: $3,000/mo → FIRE number = $1,200,000", () => {
    expect(fireNumber(3000, 3)).toBe(1200000);
  });

  it("higher withdrawal rate produces a lower FIRE number", () => {
    expect(fireNumber(3000, 5)).toBeLessThan(fireNumber(3000, 4));
  });
});

// ─── migrations ───────────────────────────────────────────────────────────────

// Minimal localStorage stub for Node environment (vitest runs in Node)
const store = {};
const localStorageStub = {
  getItem:    k => (k in store ? store[k] : null),
  setItem:    (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; },
  clear:      ()    => { Object.keys(store).forEach(k => delete store[k]); },
};

beforeEach(() => {
  localStorageStub.clear();
  global.localStorage = localStorageStub;
});

afterEach(() => {
  delete global.localStorage;
});

describe("runMigrations", () => {
  it("sets _schema_version to CURRENT_VERSION on a fresh store", () => {
    runMigrations();
    expect(localStorage.getItem(SCHEMA_KEY)).toBe(String(CURRENT_VERSION));
  });

  it("is idempotent — running twice does not corrupt data", () => {
    localStorage.setItem("stocks_v1", JSON.stringify([{ ticker: "AAPL", shares: 10, avgCost: 150 }]));
    runMigrations();
    runMigrations();
    const rows = JSON.parse(localStorage.getItem("stocks_v1"));
    expect(rows).toHaveLength(1);
    expect(rows[0].ticker).toBe("AAPL");
  });

  it("skips migration when version is already current", () => {
    localStorage.setItem(SCHEMA_KEY, String(CURRENT_VERSION));
    // Corrupt the stocks store — migration must NOT run and overwrite it
    localStorage.setItem("stocks_v1", "NOT_JSON");
    runMigrations();
    expect(localStorage.getItem("stocks_v1")).toBe("NOT_JSON");
  });

  it("v0→v1: backfills missing id onto stocks_v1 records", () => {
    localStorage.setItem("stocks_v1", JSON.stringify([
      { ticker: "AAPL", shares: 10, avgCost: 150 },
    ]));
    runMigrations();
    const rows = JSON.parse(localStorage.getItem("stocks_v1"));
    expect(rows[0]).toHaveProperty("id");
    expect(typeof rows[0].id).toBe("string");
    expect(rows[0].id.length).toBeGreaterThan(0);
  });

  it("v0→v1: backfills totalFees and notes onto stocks_v1 records", () => {
    localStorage.setItem("stocks_v1", JSON.stringify([
      { ticker: "AAPL", shares: 10, avgCost: 150 },
    ]));
    runMigrations();
    const rows = JSON.parse(localStorage.getItem("stocks_v1"));
    expect(rows[0].totalFees).toBe(0);
    expect(rows[0].notes).toBe("");
  });

  it("v0→v1: preserves existing field values — does not overwrite non-missing fields", () => {
    localStorage.setItem("stocks_v1", JSON.stringify([
      { id: "abc123", ticker: "TSLA", shares: 5, avgCost: 200, totalFees: 9.99, notes: "existing" },
    ]));
    runMigrations();
    const rows = JSON.parse(localStorage.getItem("stocks_v1"));
    expect(rows[0].id).toBe("abc123");
    expect(rows[0].totalFees).toBe(9.99);
    expect(rows[0].notes).toBe("existing");
  });

  it("v0→v1: backfills notes onto fd_v1 records", () => {
    localStorage.setItem("fd_v1", JSON.stringify([
      { bank: "Maybank", principal: 50000, rate: 3.85, tenureMonths: 12 },
    ]));
    runMigrations();
    const rows = JSON.parse(localStorage.getItem("fd_v1"));
    expect(rows[0].notes).toBe("");
  });

  it("v0→v1: backfills downpaymentRecords and progressiveRecords onto hl_props_v1", () => {
    localStorage.setItem("hl_props_v1", JSON.stringify([
      { name: "Test Condo", purchasePrice: 500000, interestRate: 4, tenure: 35 },
    ]));
    runMigrations();
    const rows = JSON.parse(localStorage.getItem("hl_props_v1"));
    expect(Array.isArray(rows[0].downpaymentRecords)).toBe(true);
    expect(Array.isArray(rows[0].progressiveRecords)).toBe(true);
  });

  it("v0→v1: leaves empty collections intact", () => {
    localStorage.setItem("stocks_v1", JSON.stringify([]));
    runMigrations();
    const rows = JSON.parse(localStorage.getItem("stocks_v1"));
    expect(rows).toHaveLength(0);
  });

  it("v0→v1: handles missing collections gracefully (no error)", () => {
    expect(() => runMigrations()).not.toThrow();
  });
});
