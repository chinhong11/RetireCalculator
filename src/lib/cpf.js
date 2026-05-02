/**
 * @typedef {{ employee: number, employer: number, total: number }} ContribRates
 * @typedef {{ oa: number, sa: number, ma: number }} AllocationRatios
 * @typedef {{
 *   salary: number, cappedOW: number,
 *   employeeContrib: number, employerContrib: number, totalContrib: number,
 *   takeHome: number,
 *   oaAmount: number, saAmount: number, maAmount: number,
 *   rates: ContribRates, allocation: AllocationRatios,
 * }} MonthlyResult
 * @typedef {{
 *   year: number, label: string, age: number, prYear: number,
 *   salary: number, oa: number, sa: number, ra: number, ma: number,
 *   cpfis: number, bhs: number, total: number, raFormed: boolean,
 *   monthlyContrib: number, annualContrib: number, takeHome: number,
 * }} ProjectionRow
 * @typedef {{
 *   raAtPayout: number, monthlyPayout: number,
 *   extrapolated: boolean, fromAge: number | null, payoutAge: number,
 * }} CpfLifePayout
 */

// ─── CPF Rate Tables (from 1 Jan 2026) ───────────────────────────────
export const CPF_RATES = {
  "spr1": { // 1st year SPR (G/G)
    "55":   { employee: 0.05, employer: 0.04, total: 0.09 },
    "60":   { employee: 0.05, employer: 0.04, total: 0.09 },
    "65":   { employee: 0.05, employer: 0.035, total: 0.085 },
    "999":  { employee: 0.05, employer: 0.035, total: 0.085 },
  },
  "spr2": { // 2nd year SPR (G/G)
    "55":   { employee: 0.15, employer: 0.09, total: 0.24 },
    "60":   { employee: 0.125, employer: 0.06, total: 0.185 },
    "65":   { employee: 0.075, employer: 0.035, total: 0.11 },
    "999":  { employee: 0.05, employer: 0.035, total: 0.085 },
  },
  "spr3": { // 3rd year onwards / SC
    "55":   { employee: 0.20, employer: 0.17, total: 0.37 },
    "60":   { employee: 0.18, employer: 0.16, total: 0.34 },
    "65":   { employee: 0.125, employer: 0.125, total: 0.25 },
    "70":   { employee: 0.075, employer: 0.09, total: 0.165 },
    "999":  { employee: 0.05, employer: 0.075, total: 0.125 },
  },
};

// CPF Account allocation ratios (from 1 Jan 2026).
// After age 55, the "sa" share is directed to RA rather than SA.
export const ALLOCATION_RATIOS = {
  "35":  { oa: 0.6217, sa: 0.1621, ma: 0.2162 },
  "45":  { oa: 0.5677, sa: 0.1891, ma: 0.2432 },
  "50":  { oa: 0.5136, sa: 0.2162, ma: 0.2702 },
  "55":  { oa: 0.4055, sa: 0.3108, ma: 0.2837 },
  "60":  { oa: 0.353,  sa: 0.3382, ma: 0.3088 },
  "65":  { oa: 0.14,   sa: 0.44,   ma: 0.42 },
  "70":  { oa: 0.0607, sa: 0.303,  ma: 0.6363 },
  "999": { oa: 0.08,   sa: 0.08,   ma: 0.84 },
};

export const OW_CEILING = 8000;

// Full Retirement Sum (2026). RA is seeded from SA + OA top-up at age 55.
// Rises ~3-5% annually — use frsGrowthRate to project the future FRS.
export const CPF_FRS_2026 = 213_000;

// Basic Healthcare Sum (2026). MA contributions/interest above this cap
// overflow to SA (before 55) or RA (55+). Also rises annually.
export const CPF_BHS_2026 = 71_500;

// CPF LIFE Standard Plan approximate annual payout rate on RA at payout age.
export const CPF_LIFE_RATE = 0.063;

/** @param {number} age @returns {string} */
export function getRateKey(age) {
  if (age <= 55) return "55";
  if (age <= 60) return "60";
  if (age <= 65) return "65";
  if (age <= 70) return "70";
  return "999";
}

/** @param {number} age @returns {string} */
export function getAllocationKey(age) {
  if (age <= 35) return "35";
  if (age <= 45) return "45";
  if (age <= 50) return "50";
  if (age <= 55) return "55";
  if (age <= 60) return "60";
  if (age <= 65) return "65";
  if (age <= 70) return "70";
  return "999";
}

/** @param {number} prYear @returns {string} */
export function getSPRKey(prYear) {
  if (prYear <= 1) return "spr1";
  if (prYear <= 2) return "spr2";
  return "spr3";
}

/**
 * @param {number} age
 * @param {number} prYear
 * @returns {ContribRates}
 */
export function getContribRates(age, prYear) {
  const sprKey = getSPRKey(prYear);
  const table = CPF_RATES[sprKey];
  const keys = Object.keys(table).map(Number).sort((a, b) => a - b);
  for (const k of keys) {
    if (age <= k) return table[String(k)];
  }
  return table[String(keys[keys.length - 1])];
}

/** @param {number} age @returns {AllocationRatios} */
export function getAllocation(age) {
  const key = getAllocationKey(age);
  return ALLOCATION_RATIOS[key];
}

/**
 * @param {number} salary  Monthly gross salary in SGD
 * @param {number} age
 * @param {number} prYear  1 = 1st-year SPR, 2 = 2nd-year, 3+ = SC/full
 * @returns {MonthlyResult}
 */
export function computeMonthly(salary, age, prYear) {
  const cappedOW = Math.min(salary, OW_CEILING);
  const rates = getContribRates(age, prYear);
  const allocation = getAllocation(age);

  const employeeContrib = Math.floor(cappedOW * rates.employee);
  const totalContrib = Math.round(cappedOW * rates.total);
  const employerContrib = totalContrib - employeeContrib;

  const oaAmount = Math.round(totalContrib * allocation.oa);
  const maAmount = Math.round(totalContrib * allocation.ma);
  const saAmount = totalContrib - oaAmount - maAmount;

  return {
    salary, cappedOW,
    employeeContrib, employerContrib, totalContrib,
    takeHome: salary - employeeContrib,
    oaAmount, saAmount, maAmount,
    rates, allocation,
  };
}

/**
 * Project CPF balances year-by-year.
 * @param {{
 *   salary: number, age: number, prYear: number,
 *   annualIncrement: number, yearsToProject: number,
 *   oaReturn: number, saReturn: number, maReturn: number,
 *   oaStart?: number, saStart?: number, maStart?: number,
 *   frs?: number, bhs?: number,
 *   frsGrowthRate?: number, bhsGrowthRate?: number,
 *   saShield?: number,
 * }} params
 * @returns {ProjectionRow[]}
 */
export function projectYears({
  salary, age, prYear, annualIncrement, yearsToProject,
  oaReturn, saReturn, maReturn,
  oaStart = 0, saStart = 0, maStart = 0,
  frs = CPF_FRS_2026,
  bhs = CPF_BHS_2026,
  frsGrowthRate = 3.5,
  bhsGrowthRate = 3.5,
  // SA Shielding: invest this amount of SA into CPFIS-SA before 55 to protect
  // it from the RA transfer. At 55 the CPFIS-SA proceeds return to OA.
  saShield = 0,
}) {
  const data = [];

  // If already 55+, saStart is the current RA balance.
  let raFormed  = age >= 55;
  let oaBalance = oaStart;
  let saBalance = raFormed ? 0       : saStart;
  let raBalance = raFormed ? saStart : 0;
  // Cap initial MA at today's BHS (any excess overflowed in the past already).
  let maBalance = Math.min(maStart, bhs);

  // CPFIS-SA shield: carved out of saBalance, grows at SA rate, returns to OA at 55.
  let cpfisBalance = 0;
  if (!raFormed && saShield > 0) {
    cpfisBalance = Math.min(saShield, saBalance);
    saBalance   -= cpfisBalance;
  }

  let currentSalary  = salary;
  let currentAge     = age;
  let currentPRYear  = prYear;

  for (let y = 0; y <= yearsToProject; y++) {
    // BHS and FRS for year y (grown y years from the 2026 base values).
    const currentBhs = Math.round(bhs * Math.pow(1 + bhsGrowthRate / 100, y));

    if (y > 0) {
      // 1. Base interest
      oaBalance *= (1 + oaReturn / 100);
      if (raFormed) raBalance *= (1 + saReturn / 100);
      else          saBalance *= (1 + saReturn / 100);
      if (cpfisBalance > 0) cpfisBalance *= (1 + saReturn / 100);
      maBalance *= (1 + maReturn / 100);

      // MA interest overflow → SA/RA
      if (maBalance > currentBhs) {
        const ov = maBalance - currentBhs;
        maBalance = currentBhs;
        if (raFormed) raBalance += ov; else saBalance += ov;
      }

      // 2. Advance age/salary
      currentSalary = currentSalary * (1 + annualIncrement / 100);
      currentAge    += 1;
      currentPRYear += 1;

      // 3. RA formation at 55: only uninvested SA transferred; CPFIS-SA liquidated → OA
      if (!raFormed && currentAge >= 55) {
        raFormed  = true;
        raBalance = saBalance;   // only the uninvested (non-shielded) SA
        saBalance = 0;
        const effectiveFrs = Math.round(frs * Math.pow(1 + frsGrowthRate / 100, y));
        const topUp = Math.min(oaBalance, Math.max(0, effectiveFrs - raBalance));
        raBalance  += topUp;
        oaBalance  -= topUp;
        // Liquidate CPFIS-SA → OA (user sells investments, proceeds credited to OA)
        oaBalance    += cpfisBalance;
        cpfisBalance  = 0;
      }

      // 4. Extra CPF interest (OA capped at $20k towards combined threshold)
      const oaCapped = Math.min(oaBalance, 20000);
      const combined = oaCapped + (raFormed ? raBalance : saBalance) + maBalance;
      let extra = 0;
      if (currentAge >= 55) {
        extra = Math.min(combined, 30000) * 0.02
              + Math.min(Math.max(0, combined - 30000), 30000) * 0.01;
      } else {
        extra = Math.min(combined, 60000) * 0.01;
      }
      if (raFormed) raBalance += extra;
      else          saBalance += extra;
    }

    // 5. Twelve months of contributions
    const monthly = computeMonthly(currentSalary, currentAge, currentPRYear);
    if (y > 0) {
      oaBalance += monthly.oaAmount * 12;
      if (raFormed) raBalance += monthly.saAmount * 12;
      else          saBalance += monthly.saAmount * 12;
      maBalance += monthly.maAmount * 12;

      // MA contribution overflow → SA/RA
      if (maBalance > currentBhs) {
        const ov = maBalance - currentBhs;
        maBalance = currentBhs;
        if (raFormed) raBalance += ov; else saBalance += ov;
      }
    }

    data.push({
      year: y, label: `Year ${y}`,
      age: currentAge, prYear: currentPRYear,
      salary: Math.round(currentSalary),
      oa: Math.round(oaBalance),
      sa: Math.round(saBalance),        // 0 once raFormed
      ra: Math.round(raBalance),        // 0 before raFormed
      ma: Math.round(maBalance),
      cpfis: Math.round(cpfisBalance),  // 0 after age 55 (liquidated)
      bhs: currentBhs,
      total: Math.round(oaBalance + saBalance + raBalance + maBalance + cpfisBalance),
      raFormed,
      monthlyContrib: monthly.totalContrib,
      annualContrib:  monthly.totalContrib * 12,
      takeHome:       monthly.takeHome,
    });
  }
  return data;
}

/**
 * Estimate CPF LIFE Standard Plan monthly payout.
 * Finds RA at payoutAge; if the projection ends before payoutAge, extrapolates
 * with interest only (conservative — no contributions assumed).
 * @param {ProjectionRow[]} projectionData
 * @param {number} saReturnPct
 * @param {number} [payoutAge=65]
 * @returns {CpfLifePayout | null}
 */
export function estimateCpfLifePayout(projectionData, saReturnPct, payoutAge = 65) {
  if (!projectionData?.length) return null;
  const last = projectionData[projectionData.length - 1];

  // RA must form at some point for CPF LIFE to apply.
  if (!projectionData.some(d => d.raFormed)) return null;

  let raAtPayout, extrapolated = false, fromAge = null;

  const exactRow = projectionData.find(d => d.age === payoutAge && d.raFormed);
  if (exactRow) {
    raAtPayout = exactRow.ra;
  } else if (last.raFormed && last.age < payoutAge) {
    // Projection ends before 65 — grow RA forward with interest, no new contributions
    extrapolated = true;
    fromAge      = last.age;
    raAtPayout   = Math.round(last.ra * Math.pow(1 + saReturnPct / 100, payoutAge - last.age));
  } else if (last.raFormed && last.age > payoutAge) {
    // Projection reaches past 65 — find the age-65 row
    const row65 = projectionData.slice().reverse().find(d => d.age <= payoutAge && d.raFormed);
    raAtPayout = row65 ? row65.ra : last.ra;
  } else {
    return null;
  }

  const monthlyPayout = Math.round(raAtPayout * CPF_LIFE_RATE / 12);
  return { raAtPayout, monthlyPayout, extrapolated, fromAge, payoutAge };
}

export const fmt  = (n) => n.toLocaleString("en-SG", { maximumFractionDigits: 0 });
export const fmtD = (n) => `$${fmt(n)}`;
