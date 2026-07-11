// ─── Housing Loan Math ────────────────────────────────────────────────
// Pure functions for loan amortization and progressive (under-construction)
// interest. Extracted from HousingLoanTab so they can be unit-tested and
// reused by exports/summary without touching the UI.

import { calcInstallment } from "./finance.js";

/** Sum of all recorded downpayments for a property. */
export function totalDownpayment(property) {
  return (property?.downpaymentRecords || []).reduce((s, r) => s + (r.amount || 0), 0);
}

/**
 * Headline loan figures derived from purchase price, downpayments, rate, tenure.
 * @returns {{ downpaid: number, loanAmount: number, monthlyInstallment: number,
 *             totalPayable: number, totalInterest: number }}
 */
export function loanSummary(property) {
  const downpaid = totalDownpayment(property);
  const loanAmount = Math.max(0, (property?.purchasePrice || 0) - downpaid);
  const monthlyInstallment = calcInstallment(loanAmount, property?.interestRate || 0, property?.tenure || 0);
  const totalPayable = monthlyInstallment * (property?.tenure || 0) * 12;
  const totalInterest = Math.max(0, totalPayable - loanAmount);
  return { downpaid, loanAmount, monthlyInstallment, totalPayable, totalInterest };
}

/**
 * First day of the month for a "YYYY-MM" or "YYYY-MM-DD" string.
 * The month inputs (progressive claims) give "YYYY-MM" while the SPA/VP
 * date inputs give full "YYYY-MM-DD" — naively appending "-01" to the
 * latter produced an Invalid Date.
 */
function monthStart(dateStr) {
  // Construct as a LOCAL date: new Date("YYYY-MM-DD") parses as UTC, which
  // reads back one month early through getMonth() in negative-offset zones.
  const [y, m] = dateStr.split("-");
  return new Date(Number(y), Number(m) - 1, 1);
}

/** Whole months between two date strings (end − start), month granularity. */
function monthsBetween(start, end) {
  const s = monthStart(start);
  const e = monthStart(end);
  return (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
}

/**
 * Progressive-interest timeline for an under-construction property.
 * Each disbursed tranche accrues interest on the cumulative disbursed amount
 * from its claim month until the next claim (or the VP date for the last one).
 *
 * @param {object} property — needs interestRate, vpDate, progressiveRecords
 *   (records must be sorted by month ascending, as the tab maintains them)
 * @returns {Array<{ cumulative: number, monthlyInterest: number,
 *                   stageDuration: number|null, stageInterestTotal: number }>}
 *   one entry per record, spread over the original record fields
 */
export function progressiveTimeline(property) {
  if (!property) return [];
  const r = (property.interestRate || 0) / 100 / 12;
  const records = property.progressiveRecords || [];
  let cum = 0;

  return records.map((rec, idx) => {
    cum += rec.claimAmount || 0;
    const monthlyInterest = cum * r;

    // Months this stage's cumulative amount accrues interest:
    // from this claim month until the next claim (or VP date).
    let stageDuration = null;
    if (rec.month) {
      const endYm = records[idx + 1]?.month || property.vpDate;
      if (endYm) {
        const months = monthsBetween(rec.month, endYm);
        if (months > 0) stageDuration = months;
      }
    }

    const stageInterestTotal = stageDuration !== null
      ? monthlyInterest * stageDuration
      : monthlyInterest;

    return { ...rec, cumulative: cum, monthlyInterest, stageDuration, stageInterestTotal };
  });
}

/** Total interest accrued across the whole progressive timeline. */
export function totalProgressiveInterest(property) {
  return progressiveTimeline(property).reduce((s, r) => s + r.stageInterestTotal, 0);
}

/**
 * Full reducing-balance amortization schedule.
 * Repayment start month: VP date for under-construction, SPA date + 1 month
 * for completed/subsale. Dates are omitted when no reference date is set.
 *
 * @returns {Array<{ month: number, year: number, date: string,
 *                   opening: number, principal: number, interest: number, closing: number }>}
 */
export function amortizationSchedule(property) {
  const { loanAmount, monthlyInstallment } = loanSummary(property);
  if (!loanAmount || !property?.tenure || !monthlyInstallment) return [];

  const r = (property.interestRate || 0) / 100 / 12;
  const n = property.tenure * 12;
  let balance = loanAmount;

  const refStr = property.type === "under_construction" ? property.vpDate : property.spaDate;
  let startDate = refStr ? monthStart(refStr) : null;
  if (startDate && property.type !== "under_construction") {
    // Completed/subsale: loan starts ~1 month after SPA
    startDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 1);
  }

  return Array.from({ length: n }, (_, idx) => {
    const i = idx + 1;
    const interest = balance * r;
    const principal = Math.min(monthlyInstallment - interest, balance);
    const closing = Math.max(0, balance - principal);
    let dateStr = "";
    if (startDate) {
      const d = new Date(startDate.getFullYear(), startDate.getMonth() + idx, 1);
      dateStr = d.toLocaleDateString("en-MY", { month: "short", year: "numeric" });
    }
    const row = { month: i, year: Math.ceil(i / 12), date: dateStr, opening: balance, principal, interest, closing };
    balance = closing;
    return row;
  });
}
