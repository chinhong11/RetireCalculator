// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// Stub recharts so AreaChart / Area don't need a real DOM canvas
vi.mock("recharts", () => ({
  AreaChart: ({ children }) => <div data-testid="area-chart">{children}</div>,
  Area: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
  CartesianGrid: () => null,
  BarChart: ({ children }) => <div>{children}</div>,
  Bar: () => null,
  Cell: () => null,
  PieChart: ({ children }) => <div>{children}</div>,
  Pie: () => null,
  Legend: () => null,
  LineChart: ({ children }) => <div>{children}</div>,
  Line: () => null,
  ReferenceLine: () => null,
}));

beforeEach(() => localStorage.clear());
afterEach(cleanup);

// ─── Minimal fixture data ──────────────────────────────────────────────────
const makeRow = (overrides = {}) => ({
  year: 0, label: "Year 0", age: 30, prYear: 3,
  salary: 5000, oa: 10000, sa: 5000, ra: 0, ma: 8000,
  cpfis: 0, bhs: 71500, total: 23000, raFormed: false,
  monthlyContrib: 1850, annualContrib: 22200, takeHome: 4000,
  ...overrides,
});

const projectionData = [
  makeRow({ year: 0 }),
  makeRow({ year: 1, oa: 12000, sa: 6000, total: 26000 }),
  makeRow({ year: 2, oa: 14000, sa: 7000, total: 29000 }),
];

const finalData = projectionData[projectionData.length - 1];

const cpfLifePayout = { raAtPayout: 213000, monthlyPayout: 1120, extrapolated: false, fromAge: null, payoutAge: 65 };

// ─── Shared components ────────────────────────────────────────────────────
import { CpfSummaryCards } from "../shared/CpfSummaryCards.jsx";
import { MonthlyBreakdown } from "../shared/MonthlyBreakdown.jsx";
import { StatCard } from "../shared/StatCard.jsx";
import { ErrorBoundary } from "../shared/ErrorBoundary.jsx";

describe("CpfSummaryCards", () => {
  it("renders OA balance label", () => {
    render(<CpfSummaryCards
      finalData={finalData} yearsToProject={2}
      oaReturn={2.5} saReturn={4} maReturn={4}
      cpfLifePayout={null}
    />);
    expect(screen.getByText(/OA Balance/i)).toBeInTheDocument();
  });

  it("renders CPF LIFE payout when provided", () => {
    render(<CpfSummaryCards
      finalData={finalData} yearsToProject={2}
      oaReturn={2.5} saReturn={4} maReturn={4}
      cpfLifePayout={cpfLifePayout}
    />);
    expect(screen.getByText(/CPF LIFE/i)).toBeInTheDocument();
  });

  it("shows RA label once raFormed", () => {
    const raData = makeRow({ raFormed: true, ra: 213000, sa: 0 });
    render(<CpfSummaryCards
      finalData={raData} yearsToProject={25}
      oaReturn={2.5} saReturn={4} maReturn={4}
      cpfLifePayout={null}
    />);
    expect(screen.getByText(/RA Balance/i)).toBeInTheDocument();
  });
});

describe("MonthlyBreakdown", () => {
  const monthly = {
    takeHome: 4000, employeeContrib: 1000, employerContrib: 850, totalContrib: 1850,
    oaAmount: 1150, saAmount: 300, maAmount: 400,
    rates: { employee: 0.20, employer: 0.17, total: 0.37 },
    allocation: { oa: 0.6217, sa: 0.1621, ma: 0.2162 },
  };

  it("renders take-home pay label", () => {
    render(<MonthlyBreakdown monthly={monthly} prYear={3} age={30} />);
    expect(screen.getByText(/Take-Home Pay/i)).toBeInTheDocument();
  });

  it("shows PR year 1 tip for first-year PRs", () => {
    render(<MonthlyBreakdown monthly={monthly} prYear={1} age={30} />);
    expect(screen.getByText(/1st-year PR/i)).toBeInTheDocument();
  });

  it("shows PR year 2 tip for second-year PRs", () => {
    render(<MonthlyBreakdown monthly={monthly} prYear={2} age={30} />);
    expect(screen.getByText(/2nd-year PR/i)).toBeInTheDocument();
  });
});

describe("StatCard", () => {
  it("renders label and value", () => {
    render(<StatCard label="Test Label" value="$1,234" color="#4ade80" sub="sub text" />);
    expect(screen.getByText("Test Label")).toBeInTheDocument();
    expect(screen.getByText("$1,234")).toBeInTheDocument();
  });
});

describe("ErrorBoundary", () => {
  it("renders children when no error", () => {
    render(<ErrorBoundary><span>ok</span></ErrorBoundary>);
    expect(screen.getByText("ok")).toBeInTheDocument();
  });

  it("renders error fallback when child throws", () => {
    const Boom = () => { throw new Error("test explosion"); };
    // suppress React's console.error for this test
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<ErrorBoundary><Boom /></ErrorBoundary>);
    expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();
    spy.mockRestore();
  });
});

// ─── Tab components ───────────────────────────────────────────────────────
import ProjectionTab from "../tabs/ProjectionTab.jsx";
import ProjectionTableTab from "../tabs/ProjectionTableTab.jsx";

describe("ProjectionTab", () => {
  it("renders projected CPF balance heading", () => {
    render(<ProjectionTab
      projectionData={projectionData}
      finalData={finalData}
      yearsToProject={2}
      ceilingGrowth={3.5}
      saReturn={4}
      cpfLifePayout={null}
      gridLineColor="#333"
    />);
    expect(screen.getByText(/Projected CPF Balance/i)).toBeInTheDocument();
  });

  it("renders CPF LIFE estimate when payout provided", () => {
    render(<ProjectionTab
      projectionData={projectionData}
      finalData={finalData}
      yearsToProject={2}
      ceilingGrowth={3.5}
      saReturn={4}
      cpfLifePayout={cpfLifePayout}
      gridLineColor="#333"
    />);
    expect(screen.getAllByText(/CPF LIFE payout/i).length).toBeGreaterThan(0);
  });
});

describe("ProjectionTableTab", () => {
  it("renders table headers", () => {
    render(<ProjectionTableTab
      projectionData={projectionData}
      effectiveSaShield={0}
      rowAltColor="rgba(255,255,255,0.03)"
    />);
    expect(screen.getByText(/Total CPF/i)).toBeInTheDocument();
  });

  it("shows CPFIS-SA column when saShield is active", () => {
    render(<ProjectionTableTab
      projectionData={projectionData}
      effectiveSaShield={10000}
      rowAltColor="rgba(255,255,255,0.03)"
    />);
    expect(screen.getByText(/CPFIS-SA/i)).toBeInTheDocument();
  });
});
