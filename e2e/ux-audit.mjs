// UX audit capture — drives the app as a user with data and screenshots
// every major surface, in dark + light mode + mobile. Throwaway script.
import { chromium } from "@playwright/test";

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH });
const OUT = "e2e/shots";

const SEED = {
  cpf_salary: "6500", cpf_age: "35",
  stocks_v1: JSON.stringify([
    { id: "s1", ticker: "AAPL", shares: 15, avgCost: 180, totalFees: 10, buyDate: "2024-03-01", notes: "" },
    { id: "s2", ticker: "VOO", shares: 8, avgCost: 420, totalFees: 5, buyDate: "2024-06-01", notes: "" },
  ]),
  crypto_v1: JSON.stringify([{ id: "c1", ticker: "BTC", amount: 0.1, buyPrice: 45000, totalFees: 20, buyDate: "2024-01-15", notes: "" }]),
  hl_props_v1: JSON.stringify([{
    id: "p1", name: "Tropika A-12", developer: "ABC Dev", type: "under_construction",
    purchasePrice: 480000, interestRate: 4.1, tenure: 35, spaDate: "2024-05-10", vpDate: "2026-12-01",
    downpaymentRecords: [{ id: "d1", date: "2024-05-10", amount: 48000, note: "10% booking" }],
    progressiveRecords: [{ id: "r1", month: "2024-08", claimAmount: 48000, stage: "Foundation", note: "" }],
  }]),
  fd_v1: JSON.stringify([{ id: "f1", bank: "Maybank", principal: "30000", rate: "3.8", tenureMonths: "12", startDate: "2026-01", notes: "" }]),
  sav_income: "5100", sav_other: "400", sav_start_cash: "25000",
  sav_expenses_v1: JSON.stringify([
    { id: "e1", category: "Rent / Housing", amount: "1500", note: "" },
    { id: "e2", category: "Food & Dining", amount: "800", note: "" },
  ]),
  fire_monthly_exp: "3200",
};

async function capture(theme, viewport, tabs) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  await page.goto("http://localhost:4173/");
  await page.evaluate((seed) => {
    localStorage.clear();
    for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v);
    localStorage.setItem("theme", seed.__theme || "dark");
  }, { ...SEED, __theme: theme });
  await page.reload();
  await page.waitForTimeout(800);
  const label = viewport.width < 500 ? "mob" : "desk";
  for (const [name, tabRe] of tabs) {
    if (tabRe) {
      await page.getByRole("tab", { name: tabRe }).click();
      await page.waitForTimeout(700);
    }
    await page.screenshot({ path: `${OUT}/ux-${theme}-${label}-${name}.png`, fullPage: true });
  }
  await ctx.close();
}

const DESKTOP = { width: 1280, height: 900 };
const MOBILE  = { width: 390, height: 844 };

await capture("dark", DESKTOP, [
  ["chart",   /Growth Chart/],
  ["table",   /Year-by-Year/],
  ["housing", /Housing Loan/],
  ["stocks",  /US Stocks/],
  ["epf",     /EPF/],
  ["fire",    /FIRE/],
  ["networth",/Net Worth/],
  ["savings", /Savings Rate/],
]);
await capture("light", DESKTOP, [
  ["summary", null],
  ["chart",   /Growth Chart/],
  ["networth",/Net Worth/],
]);
await capture("dark", MOBILE, [
  ["table",   /Year-by-Year/],
  ["housing", /Housing Loan/],
]);

await browser.close();
console.log("done");
