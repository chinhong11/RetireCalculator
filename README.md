# Retire Calculator 🇸🇬

A personal finance web app for Singapore PRs and Malaysians to track CPF contributions, housing loans, and US stock portfolios — all in one place.

## Features

### 📈 CPF Calculator (Singapore PR)
- Based on official CPF Board rates effective 1 January 2026
- Supports 1st year, 2nd year, and 3rd year+ PR graduated contribution rates
- Age-based rate adjustments (≤55, 55–60, 60–65, 65–70, 70+)
- Breakdown across OA, SA, and MA accounts with allocation percentages
- Configurable OA / SA / MA return rates

### 📈 Growth Chart
- Visualise projected CPF balance over up to 40 years
- Stacked area chart showing OA, SA, MA growth separately
- Factors in annual salary increment and compound interest

### 📋 Year-by-Year Table
- Detailed tabular view of yearly balances and contributions
- Columns: Year, Age, PR Year, Salary, Monthly Contribution, OA, SA, MA, Total

### 🏠 Housing Loan (Malaysia)
- Track multiple properties — switch between them with a property selector
- Per property: name, developer, address, type (under construction / completed)
- Loan details: purchase price (RM), interest rate (% p.a.), tenure (up to 35 years), SPA date, VP/handover date
- Auto-computed monthly installment using the standard reducing balance formula
- Summary cards: purchase price, downpayment paid, loan amount, monthly installment, total payable, total interest
- **Downpayment records** — log each payment with date, amount, and note; running total shown
- **Progressive interest records** (under-construction properties) — track each bank disbursement by construction stage; auto-calculates cumulative disbursed and estimated monthly interest-only payment before VP
- All data persisted to browser localStorage

### 📊 US Stocks Portfolio
- Add equity positions: ticker, shares, buy price (USD/share), fees, buy date, notes
- **Live price fetching** from Yahoo Finance — per-row Fetch button or global Refresh All
- Shows current price and today's daily % change (▲/▼) per position
- Unrealised P&L per holding and in aggregate (USD and %)
- Portfolio totals row: total invested, current value, overall P&L
- Retry button shown if a price fetch fails
- Holdings persisted to localStorage; prices re-fetched each session

## CPF Rates (1 Jan 2026)

| PR Status | Employee | Employer | Total |
|-----------|----------|----------|-------|
| 1st Year  | 5%       | 4%       | 9%    |
| 2nd Year  | 15%      | 9%       | 24%   |
| 3rd Year+ | 20%      | 17%      | 37%   |

*Rates shown for age ≤55. OW ceiling: $8,000/month.*

## Tech Stack

- React 18
- Recharts (area chart)
- Vite (build tool)
- Inline CSS with CSS custom properties (dark theme)

## Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## Disclaimers

**CPF:** For estimation only. Actual contributions may vary due to Additional Wages, bonus months, the annual salary ceiling ($102,000), and rounding rules. Interest projection uses simplified annual compounding and excludes the extra 1% on the first $60K and extra 0.5% on the next $30K of combined balances. Refer to [cpf.gov.sg](https://www.cpf.gov.sg) for official figures.

**Housing Loan:** Monthly installment uses the reducing balance (monthly rest) formula. Actual figures depend on your bank's Base Rate (BR), BLR-linked packages, lock-in periods, and rounding. MRTA/MLTA premiums and legal fees are not included. Refer to your loan agreement for accurate figures.

**US Stocks:** Live prices are sourced from Yahoo Finance and may be delayed up to 15–20 minutes during market hours. P&L is unrealised gain/loss based on cost basis. For personal record-keeping only — not financial advice.

## License

MIT
