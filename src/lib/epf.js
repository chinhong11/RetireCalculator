// ─── EPF helpers ──────────────────────────────────────────────────────

export const EPF_PER = "#10b981";
export const EPF_SEJ = "#6366f1";
export const EPF_FLK = "#f59e0b";

export function getEpfRates(age, monthlyWage) {
  if (age < 60) {
    return { employee: 0.11, employer: monthlyWage > 5000 ? 0.12 : 0.13 };
  }
  return { employee: 0.055, employer: 0.06 };
}

export function computeEpfMonthly(wage, age) {
  const rates = getEpfRates(age, wage);
  const employeeContrib = Math.floor(wage * rates.employee);
  const employerContrib = Math.round(wage * rates.employer);
  const total = employeeContrib + employerContrib;
  const persaraan = Math.round(total * 0.75);
  const sejahtera = Math.round(total * 0.15);
  const fleksibel = total - persaraan - sejahtera;
  return {
    wage, employeeContrib, employerContrib, total,
    persaraan, sejahtera, fleksibel,
    rates: { employee: rates.employee, employer: rates.employer, total: rates.employee + rates.employer },
    takeHome: wage - employeeContrib,
  };
}

export function projectEpfYears({ wage, age, annualIncrement, years, dividendRate, startPer, startSej, startFlek }) {
  let per = startPer, sej = startSej, flek = startFlek;
  let w = wage, a = age;
  const r = dividendRate / 100;
  return Array.from({ length: years }, (_, idx) => {
    // Advance age/wage before computing so year-1 reflects contributions at age+1 (same convention as CPF)
    a++;
    w = Math.round(w * (1 + annualIncrement / 100));
    const m = computeEpfMonthly(w, a);
    const yPer = m.persaraan * 12, ySej = m.sejahtera * 12, yFlek = m.fleksibel * 12;
    const divPer = r * (per + yPer * 0.5);
    const divSej = r * (sej + ySej * 0.5);
    const divFlek = r * (flek + yFlek * 0.5);
    per = per + yPer + divPer;
    sej = sej + ySej + divSej;
    flek = flek + yFlek + divFlek;
    return { year: idx + 1, age: a, wage: w, monthlyContrib: m.total, per, sej, flek, total: per + sej + flek };
  });
}
