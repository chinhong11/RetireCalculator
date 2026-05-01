import { describe, it, expect } from "vitest";

import {
  getRateKey, getAllocationKey, getSPRKey,
  getContribRates, getAllocation,
  computeMonthly, projectYears,
  OW_CEILING,
} from "../cpf.js";

import {
  getEpfRates, computeEpfMonthly, projectEpfYears,
} from "../epf.js";

import { calcInstallment, calcFd } from "../finance.js";

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

  it("OA+SA+MA equals total for every row (within 2 due to per-account rounding)", () => {
    const rows = projectYears({ ...base, yearsToProject: 5 });
    rows.forEach(r => expect(Math.abs(r.oa + r.sa + r.ma - r.total)).toBeLessThanOrEqual(2));
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
