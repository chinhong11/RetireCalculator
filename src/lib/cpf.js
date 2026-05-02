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

// Full Retirement Sum effective 2026. The RA is seeded from SA (+ OA top-up)
// up to this cap when the member turns 55. The FRS rises ~3-5% annually.
export const CPF_FRS_2026 = 213_000;

export function getRateKey(age) {
  if (age <= 55) return "55";
  if (age <= 60) return "60";
  if (age <= 65) return "65";
  if (age <= 70) return "70";
  return "999";
}

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

export function getSPRKey(prYear) {
  if (prYear <= 1) return "spr1";
  if (prYear <= 2) return "spr2";
  return "spr3";
}

export function getContribRates(age, prYear) {
  const sprKey = getSPRKey(prYear);
  const table = CPF_RATES[sprKey];
  const keys = Object.keys(table).map(Number).sort((a, b) => a - b);
  for (const k of keys) {
    if (age <= k) return table[String(k)];
  }
  return table[String(keys[keys.length - 1])];
}

export function getAllocation(age) {
  const key = getAllocationKey(age);
  return ALLOCATION_RATIOS[key];
}

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

export function projectYears({
  salary, age, prYear, annualIncrement, yearsToProject,
  oaReturn, saReturn, maReturn,
  oaStart = 0, saStart = 0, maStart = 0,
  frs = CPF_FRS_2026,
}) {
  const data = [];

  // If the user is already 55+, treat saStart as their current RA balance.
  let raFormed    = age >= 55;
  let oaBalance   = oaStart;
  let saBalance   = raFormed ? 0      : saStart;
  let raBalance   = raFormed ? saStart : 0;
  let maBalance   = maStart;

  let currentSalary  = salary;
  let currentAge     = age;
  let currentPRYear  = prYear;

  for (let y = 0; y <= yearsToProject; y++) {
    if (y > 0) {
      // 1. Base interest (at the age carried over from the previous year)
      oaBalance *= (1 + oaReturn / 100);
      if (raFormed) raBalance *= (1 + saReturn / 100); // RA earns the configured SA rate
      else          saBalance *= (1 + saReturn / 100);
      maBalance *= (1 + maReturn / 100);

      // 2. Advance age/salary
      currentSalary = currentSalary * (1 + annualIncrement / 100);
      currentAge    += 1;
      currentPRYear += 1;

      // 3. RA formation at 55: SA transferred in full, OA tops up to FRS
      if (!raFormed && currentAge >= 55) {
        raFormed  = true;
        raBalance = saBalance;
        saBalance = 0;
        const topUp = Math.min(oaBalance, Math.max(0, frs - raBalance));
        raBalance  += topUp;
        oaBalance  -= topUp;
      }

      // 4. Extra CPF interest (OA capped at $20k towards threshold)
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
      // After RA formation the allocation that would go to SA goes to RA instead
      if (raFormed) raBalance += monthly.saAmount * 12;
      else          saBalance += monthly.saAmount * 12;
      maBalance += monthly.maAmount * 12;
    }

    data.push({
      year: y, label: `Year ${y}`,
      age: currentAge, prYear: currentPRYear,
      salary: Math.round(currentSalary),
      oa: Math.round(oaBalance),
      sa: Math.round(saBalance),  // 0 once raFormed
      ra: Math.round(raBalance),  // 0 before raFormed
      ma: Math.round(maBalance),
      total: Math.round(oaBalance + saBalance + raBalance + maBalance),
      raFormed,
      monthlyContrib: monthly.totalContrib,
      annualContrib:  monthly.totalContrib * 12,
      takeHome:       monthly.takeHome,
    });
  }
  return data;
}

export const fmt  = (n) => n.toLocaleString("en-SG", { maximumFractionDigits: 0 });
export const fmtD = (n) => `$${fmt(n)}`;
