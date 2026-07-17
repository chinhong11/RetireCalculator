# Retire Calculator 🇸🇬🇲🇾

A personal finance web app for Singapore PRs and Malaysians to track CPF contributions, housing loans, and investment portfolios — all in one place.

## Tabs

### 🌐 Summary
- **Unified net-worth hero** — one ≈ SGD figure summing CPF, MYR and USD assets at your FX rates, with a composition bar
- **CPF (SGD):** projected OA / SA (or RA after 55) / MA balances with progress bars
- **MYR Assets:** property equity + outstanding loans + Bursa Malaysia stocks cost basis
- **USD Investments:** US Stocks and Crypto side-by-side with allocation bars
- **Retirement goals** — track milestones per currency with projected achievement age

### 📈 Growth Chart
- Visualise projected CPF balance over up to 40 years
- Stacked area chart showing OA, SA, MA growth separately
- Factors in annual salary increment and compound interest

### 📋 Year-by-Year Table
- Detailed tabular view of yearly CPF balances and contributions
- Columns: Year, Age, PR Year, Salary, Monthly Contribution, OA, SA, MA, Total

### 🏠 Housing Loan (Malaysia)
- Track multiple properties with a property selector
- Per property: name, developer, address, type (under construction / completed), purchase price (RM), interest rate (% p.a.), loan tenure (up to 35 years), SPA date, VP/handover date
- Auto-computed monthly installment using the standard reducing balance formula
- Summary cards: purchase price, downpayment paid, loan amount, monthly installment, total payable, total interest
- **Downpayment records** — log each payment with date, amount, note; running total shown
- **Progressive interest records** (under-construction) — track each bank disbursement by construction stage; auto-calculates cumulative disbursed and estimated monthly interest-only payment before VP

### 🇲🇾 MY Stocks (Bursa Malaysia)
- Track Bursa Malaysia equity holdings in MYR
- Enter stock code (e.g. `1155`, `MAYBANK`) — `.KL` suffix added automatically for Yahoo Finance
- Records shares, buy price (RM/share), fees, buy date, notes
- Live price fetching with today's daily % change (▲/▼); Bursa hours 9am–5pm MYT Mon–Fri
- Unrealised P&L per position and in aggregate (RM and %)
- Portfolio totals row; holdings persisted to localStorage

### 📊 US Stocks
- Track US equity holdings in USD
- Add positions: ticker, shares, buy price (USD/share), fees, buy date, notes
- Live price fetching from Yahoo Finance — per-row Fetch or global Refresh All
- Today's daily % change (▲/▼), unrealised P&L per holding and in aggregate
- Portfolio totals row; holdings persisted to localStorage

### 🪙 Crypto
- Track cryptocurrency holdings in USD
- 35+ coins pre-mapped (BTC, ETH, SOL, BNB, DOGE, PEPE, TON, and more); unlisted tokens supported via CoinGecko coin ID
- Live prices from CoinGecko free API with 24h % change (▲/▼)
- Smart price formatting for large (BTC) and tiny (SHIB, PEPE) values
- Unrealised P&L per position and in aggregate; holdings persisted to localStorage

---

## CPF Rates (1 Jan 2026)

| PR Status | Employee | Employer | Total |
|-----------|----------|----------|-------|
| 1st Year  | 5%       | 4%       | 9%    |
| 2nd Year  | 15%      | 9%       | 24%   |
| 3rd Year+ | 20%      | 17%      | 37%   |

*Rates shown for age ≤55. OW ceiling: $8,000/month.*

## Tech Stack

- React 18 · Vite · Recharts (charts, lazy-loaded) · jsPDF (PDF export, lazy-loaded)
- Inline CSS with CSS custom properties (dark + light themes, `src/theme.js`)
- Supabase (optional cloud sync of localStorage snapshots)
- Yahoo Finance (stocks) · CoinGecko (crypto) · frankfurter.app (FX) — all fetched with timeouts and cache fallbacks
- PWA: installable, offline-capable service worker

## Architecture

```
src/
  CPFCalculator.jsx        app shell: state, derived projections, tab routing
  theme.js                 THEMES, GLOBAL_CSS, SEM semantic color tokens
  components/
    layout/                Header, Sidebar, TabBar
    shared/                MoneyInput, QuickStart, ScenarioCompare, StatCard, …
    tabs/                  12 lazy-loaded feature tabs
  lib/
    cpf.js  epf.js         projection math (pure, unit-tested)
    housing.js  finance.js loan amortization, FD interest
    usePersistedState.js   localStorage-backed state (single persistence path)
    useCloudSync.js        3-way reconciliation with Supabase (see Security)
    backup.js  migrations.js
e2e/                       Playwright smoke test + ux-audit screenshot harness
supabase/rls.sql           Row-Level Security policies (apply once — see Security)
```

## Getting Started

```bash
npm install
npm run dev        # development server
npm run build      # production build
npm run preview    # serve the production build

npm test           # 225 unit/component tests (vitest)
npm run test:watch # watch mode
npm run coverage   # coverage report
npm run typecheck  # tsc checkJs over src/lib
npm run e2e        # Playwright smoke test against the production build
```

CI (GitHub Actions) runs typecheck + tests + build and the Playwright e2e job on every push and PR.

## Security — Supabase Row-Level Security (required if you enable cloud sync)

Cloud sync stores each user's complete financial snapshot in a `profiles`
table, and the publishable API key ships in the client (that is normal for
Supabase). **Without Row-Level Security, any visitor could read or overwrite
other users' rows.** Apply `supabase/rls.sql` once in the Supabase SQL editor
and verify in Dashboard → Database → `profiles` that RLS shows as enabled.

## Disclaimers

**CPF:** For estimation only. Actual contributions may vary due to Additional Wages, bonus months, and the annual salary ceiling ($102,000). Interest projection uses simplified annual compounding and includes the extra 1% on the first S$60,000 of combined balances (OA capped at S$20,000), and for age 55+ the extra 2% on the first S$30,000 and extra 1% on the next S$30,000 — extra interest is credited to SA. Monthly compounding and precise rounding per CPF Board rules are not modelled. Refer to [cpf.gov.sg](https://www.cpf.gov.sg) for official figures.

**Housing Loan:** Monthly installment uses the reducing balance (monthly rest) formula. Actual figures depend on your bank's Base Rate (BR), BLR-linked packages, lock-in periods, and rounding. MRTA/MLTA premiums and legal fees are not included. Refer to your loan agreement for accurate figures.

**MY Stocks & US Stocks:** Live prices sourced from Yahoo Finance and may be delayed up to 15–20 minutes during market hours. Bursa Malaysia trading hours: 9:00am–5:00pm MYT, Mon–Fri.

**Crypto:** Live prices sourced from CoinGecko and reflect the latest available market price.

All P&L figures are unrealised gain/loss based on cost basis (shares/amount × buy price + fees). For personal record-keeping only — not financial advice.

## License

MIT
