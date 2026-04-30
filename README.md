# Retire Calculator 🇸🇬

A web application to help Singapore Permanent Residents (PRs) calculate their CPF contributions and project retirement savings over time.

## Features

- **CPF Contribution Calculator** — Based on official CPF Board rates effective 1 January 2026
- **PR Graduated Rates** — Supports 1st year, 2nd year, and 3rd year+ PR contribution rates
- **Age-based Rates** — Automatically adjusts rates for age groups (≤55, 55–60, 60–65, 65–70, 70+)
- **Account Allocation** — Shows breakdown across OA, SA, and MA accounts
- **Projection Chart** — Visualise CPF growth over up to 40 years with adjustable return rates
- **Salary Increment** — Factor in annual salary increments for realistic projections
- **Year-by-Year Table** — Detailed tabular view of yearly balances and contributions

## CPF Rates Used

| PR Status | Employee | Employer | Total |
|-----------|----------|----------|-------|
| 1st Year  | 5%       | 4%       | 9%    |
| 2nd Year  | 15%      | 9%       | 24%   |
| 3rd Year+ | 20%      | 17%      | 37%   |

*Rates shown for age ≤55, salary >$750/month. OW ceiling: $8,000/month.*

## Tech Stack

- React 18
- Recharts (charts)
- Vite (build tool)
- Tailwind CSS (utility classes)

## Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## Disclaimer

This calculator is for estimation purposes only. Actual CPF contributions may vary due to Additional Wages, bonus months, annual salary ceiling ($102,000), and rounding rules. The interest projection uses simplified annual compounding and does not include the extra 1% on first $60K or extra 0.5% on next $30K of combined balances. Always refer to [cpf.gov.sg](https://www.cpf.gov.sg) for official calculations.

## License

MIT
