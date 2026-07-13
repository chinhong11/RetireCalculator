// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// jsdom has no ResizeObserver; stub recharts (chart internals aren't under test)
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
  LineChart: ({ children }) => <div>{children}</div>,
  AreaChart: ({ children }) => <div>{children}</div>,
  Line: () => null, Area: () => null,
  XAxis: () => null, YAxis: () => null,
  Tooltip: () => null, CartesianGrid: () => null, Legend: () => null,
}));

import HousingLoanTab from "../tabs/HousingLoanTab.jsx";
import SummaryTab from "../tabs/SummaryTab.jsx";
import { QuickStart } from "../shared/QuickStart.jsx";
import { MoneyInput } from "../shared/MoneyInput.jsx";
import { ScenarioCompare } from "../shared/ScenarioCompare.jsx";

beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

// ─── HousingLoanTab — user flows ──────────────────────────────────────────────

describe("HousingLoanTab", () => {
  // Most flows need a property first — created explicitly, never auto-injected
  const renderWithProperty = () => {
    const utils = render(<HousingLoanTab />);
    fireEvent.click(screen.getByText("+ Add my first property"));
    return utils;
  };

  it("first visit shows an empty state and persists NOTHING", () => {
    render(<HousingLoanTab />);
    expect(screen.getByText(/Track a property purchase/i)).toBeInTheDocument();
    // Regression: a phantom "My Property · RM 500,000" used to be silently
    // saved here and then reported by the Summary tab as a real asset
    expect(localStorage.getItem("hl_props_v1")).toBeNull();
  });

  it("adding the first property creates and persists it", () => {
    renderWithProperty();
    expect(screen.getByText(/🏠 My Property/)).toBeInTheDocument();
    expect(screen.getByDisplayValue("500,000")).toBeInTheDocument(); // MoneyInput formats live
    expect(JSON.parse(localStorage.getItem("hl_props_v1"))).toHaveLength(1);
  });

  it("shows a validation error when adding a downpayment with no date or amount", () => {
    renderWithProperty();
    fireEvent.click(screen.getAllByText("+ Add")[0]); // downpayment Add button
    expect(screen.getByText(/Date and amount are required/i)).toBeInTheDocument();
  });

  // The property form has SPA/VP date inputs first; the downpayment row's
  // date input is the last type=date in the document.
  const dpDateInput = (container) =>
    [...container.querySelectorAll('input[type="date"]')].at(-1);

  it("adds a downpayment record and reduces the loan amount", () => {
    const { container } = renderWithProperty();

    const dateInput   = dpDateInput(container);
    const amountInput = screen.getByPlaceholderText("e.g. 50,000");
    fireEvent.change(dateInput,   { target: { value: "2026-01-15" } });
    fireEvent.change(amountInput, { target: { value: "50000" } });
    fireEvent.click(screen.getAllByText("+ Add")[0]);

    // Record appears and validation error does not
    expect(screen.queryByText(/required/i)).not.toBeInTheDocument();
    expect(screen.getByText("Total Paid")).toBeInTheDocument();
    // Loan = 500k - 50k = 450k, shown in the Loan Amount stat card
    expect(screen.getByText("Loan Amount").parentElement).toHaveTextContent("RM 450,000");
  });

  it("persists records to localStorage", () => {
    const { container } = renderWithProperty();
    fireEvent.change(dpDateInput(container), { target: { value: "2026-02-01" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. 50,000"), { target: { value: "25000" } });
    fireEvent.click(screen.getAllByText("+ Add")[0]);

    const stored = JSON.parse(localStorage.getItem("hl_props_v1"));
    expect(stored[0].downpaymentRecords).toHaveLength(1);
    expect(stored[0].downpaymentRecords[0].amount).toBe(25000);
  });

  it("adds a second property via + Add Property", () => {
    renderWithProperty();
    fireEvent.click(screen.getByText("+ Add Property"));
    expect(JSON.parse(localStorage.getItem("hl_props_v1"))).toHaveLength(2);
  });

  it("delete asks for confirmation and keeps the property when declined", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    renderWithProperty();
    fireEvent.click(screen.getByText("Delete Property"));
    expect(window.confirm).toHaveBeenCalled();
    expect(screen.getByText(/🏠 My Property/)).toBeInTheDocument();
  });

  it("deleting the last property returns to the empty state and clears storage", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderWithProperty();
    fireEvent.click(screen.getByText("Delete Property"));
    expect(screen.getByText(/Track a property purchase/i)).toBeInTheDocument();
    expect(localStorage.getItem("hl_props_v1")).toBeNull();
  });
});

// ─── SummaryTab — goals flow ──────────────────────────────────────────────────

describe("SummaryTab", () => {
  const cpfData = { oa: 100_000, sa: 80_000, ma: 40_000, total: 220_000, age: 50, raFormed: false };
  const projectionData = [
    { year: 0, age: 30, total: 0 },
    { year: 1, age: 31, total: 120_000 },
    { year: 2, age: 32, total: 250_000 },
  ];
  const renderTab = () => render(
    <SummaryTab cpfData={cpfData} yearsToProject={20} projectionData={projectionData} />
  );

  it("renders the projected CPF total", () => {
    renderTab();
    // Appears in both the net-worth hero and the CPF section
    expect(screen.getAllByText("S$220,000").length).toBeGreaterThanOrEqual(1);
  });

  it("shows a unified net-worth hero that sums the currency blocks in SGD", () => {
    // CPF 220k (SGD) + property equity 50k MYR ×0.30 + stocks 1800 USD ×1.35
    localStorage.setItem("fx_myr_sgd", "0.30");
    localStorage.setItem("fx_usd_sgd", "1.35");
    localStorage.setItem("hl_props_v1", JSON.stringify([
      { id: "p", name: "C", purchasePrice: 200000, downpaymentRecords: [{ id: "d", amount: 50000 }] },
    ]));
    localStorage.setItem("stocks_v1", JSON.stringify([
      { id: "s", ticker: "AAPL", shares: 10, avgCost: 180, totalFees: 0 },
    ]));
    renderTab();
    // 220000 + 50000*0.30 (15000) + 1800*1.35 (2430) = 237430
    expect(screen.getByText(/Estimated Total Net Worth/i)).toBeInTheDocument();
    expect(screen.getByText("≈ S$237,430")).toBeInTheDocument();
  });

  it("net-worth hero is CPF-only (100%) when no assets are entered", () => {
    renderTab();
    expect(screen.getByText("≈ S$220,000")).toBeInTheDocument();
    expect(screen.getByText(/CPF ·/)).toBeInTheDocument();
  });

  it("adds a goal and shows progress against the mapped currency", () => {
    renderTab();
    fireEvent.change(screen.getByPlaceholderText(/Goal name/), { target: { value: "Retirement Fund" } });
    fireEvent.change(screen.getByPlaceholderText("Target amount"), { target: { value: "440000" } });
    fireEvent.click(screen.getByText("+ Add"));

    expect(screen.getByText("Retirement Fund")).toBeInTheDocument();
    // Current SGD value = cpf total 220k of 440k target = 50.0%
    expect(screen.getByText(/\(50\.0%\)/)).toBeInTheDocument();
    // SGD goals get a projected achievement age from projectionData (total >= 440k: none in fixture)
    expect(screen.getByText(/Still needed:/)).toBeInTheDocument();
    // Persisted
    expect(JSON.parse(localStorage.getItem("goals_v1"))).toHaveLength(1);
  });

  it("marks an achieved goal as reached", () => {
    renderTab();
    fireEvent.change(screen.getByPlaceholderText(/Goal name/), { target: { value: "First 100k" } });
    fireEvent.change(screen.getByPlaceholderText("Target amount"), { target: { value: "100000" } });
    fireEvent.click(screen.getByText("+ Add"));
    expect(screen.getByText(/Goal reached!/)).toBeInTheDocument();
  });

  it("shows the projected age for an SGD goal within the projection", () => {
    renderTab();
    fireEvent.change(screen.getByPlaceholderText(/Goal name/), { target: { value: "Quarter mil" } });
    fireEvent.change(screen.getByPlaceholderText("Target amount"), { target: { value: "240000" } });
    fireEvent.click(screen.getByText("+ Add"));
    // projectionData first row with total >= 240k is age 32
    expect(screen.getByText(/age 32/)).toBeInTheDocument();
  });

  it("deletes a goal via its remove button", () => {
    renderTab();
    fireEvent.change(screen.getByPlaceholderText(/Goal name/), { target: { value: "Temp" } });
    fireEvent.change(screen.getByPlaceholderText("Target amount"), { target: { value: "1" } });
    fireEvent.click(screen.getByText("+ Add"));
    fireEvent.click(screen.getByTitle("Remove goal"));
    expect(screen.queryByText("Temp")).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("goals_v1"))).toHaveLength(0);
  });

  it("does not add a goal when name or target is missing", () => {
    renderTab();
    fireEvent.click(screen.getByText("+ Add"));
    expect(localStorage.getItem("goals_v1")).toBe("[]");
  });
});

// ─── MoneyInput — live thousands separators ───────────────────────────────────

describe("MoneyInput", () => {
  function Harness({ initial = 0 }) {
    const [v, setV] = useState(initial);
    return <MoneyInput value={v} onChange={setV} placeholder="amount" />;
  }

  it("formats typed digits with thousands separators", () => {
    render(<Harness />);
    const input = screen.getByPlaceholderText("amount");
    fireEvent.change(input, { target: { value: "480000" } });
    expect(input).toHaveValue("480,000");
  });

  it("emits a plain integer, stripping any pasted separators/garbage", () => {
    const onChange = vi.fn();
    render(<MoneyInput value={0} onChange={onChange} placeholder="amount" />);
    fireEvent.change(screen.getByPlaceholderText("amount"), { target: { value: "RM 1,234,567" } });
    expect(onChange).toHaveBeenCalledWith(1234567);
  });

  it("clearing the field emits 0 and shows the placeholder", () => {
    render(<Harness initial={5000} />);
    const input = screen.getByPlaceholderText("amount");
    expect(input).toHaveValue("5,000");
    fireEvent.change(input, { target: { value: "" } });
    expect(input).toHaveValue("");
  });

  it("clamps to max", () => {
    const onChange = vi.fn();
    render(<MoneyInput value={0} onChange={onChange} max={1000} placeholder="amount" />);
    fireEvent.change(screen.getByPlaceholderText("amount"), { target: { value: "99999" } });
    expect(onChange).toHaveBeenCalledWith(1000);
  });

  it("uses the numeric mobile keypad", () => {
    render(<MoneyInput value={0} onChange={() => {}} placeholder="amount" />);
    expect(screen.getByPlaceholderText("amount")).toHaveAttribute("inputmode", "numeric");
  });
});

// ─── ScenarioCompare — "what if?" projections ─────────────────────────────────

describe("ScenarioCompare", () => {
  // age 40 + 20 yrs reaches 60, so the RA forms and CPF LIFE estimates render
  const baseInputs = {
    salary: 5000, age: 40, prYear: 3, annualIncrement: 3, yearsToProject: 20,
    oaReturn: 2.5, saReturn: 4, maReturn: 4,
    oaStart: 0, saStart: 0, maStart: 0,
    frsGrowthRate: 3.5, bhsGrowthRate: 3.5, saShield: 0,
  };

  it("is collapsed by default and expands on demand", () => {
    render(<ScenarioCompare baseInputs={baseInputs} gridLineColor="#333" />);
    expect(screen.queryByText(/Scenario B — Monthly salary/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText(/Compare a/));
    expect(screen.getByText(/Scenario B — Monthly salary/)).toBeInTheDocument();
  });

  it("a higher scenario-B salary produces a positive difference", () => {
    const { container } = render(<ScenarioCompare baseInputs={baseInputs} gridLineColor="#333" />);
    fireEvent.click(screen.getByText(/Compare a/));
    const salaryB = screen.getByDisplayValue("5,000");
    fireEvent.change(salaryB, { target: { value: "8000" } });

    const diffCard = screen.getByText(/Difference after 20 yrs/).parentElement;
    expect(diffCard).toHaveTextContent(/\+\$/); // strictly more CPF
    // Both CPF LIFE ranges shown (text spans styled children)
    expect(container.textContent).toMatch(/Est\. CPF LIFE at 65/);
  });

  it("reset restores scenario B to the current inputs", () => {
    render(<ScenarioCompare baseInputs={baseInputs} gridLineColor="#333" />);
    fireEvent.click(screen.getByText(/Compare a/));
    fireEvent.change(screen.getByDisplayValue("5,000"), { target: { value: "9000" } });
    fireEvent.click(screen.getByText(/Reset to current/));
    expect(screen.getByDisplayValue("5,000")).toBeInTheDocument();
    expect(screen.queryByText(/Reset to current/)).not.toBeInTheDocument();
  });
});

// ─── QuickStart — first-run onboarding ────────────────────────────────────────

describe("QuickStart", () => {
  const setup = (over = {}) => {
    const onComplete = vi.fn();
    const onClose = vi.fn();
    render(<QuickStart initialSalary={5000} initialAge={30} initialPrYear={1}
      monthlyContrib={450} onComplete={onComplete} onClose={onClose} {...over} />);
    return { onComplete, onClose };
  };

  it("renders the three setup questions", () => {
    setup();
    expect(screen.getByText(/Monthly salary/i)).toBeInTheDocument();
    expect(screen.getByText(/Your age/i)).toBeInTheDocument();
    expect(screen.getByText(/PR status year/i)).toBeInTheDocument();
  });

  it("submitting fires onComplete with entered values and shows the ready screen", () => {
    const { onComplete } = setup();
    fireEvent.change(screen.getByPlaceholderText("e.g. 5,000"), { target: { value: "7000" } });
    fireEvent.click(screen.getByRole("button", { name: /See my projection/ }));
    expect(onComplete).toHaveBeenCalledWith({ salary: 7000, age: 30, prYear: 1 });
    expect(screen.getByText(/Your CPF projection is ready/i)).toBeInTheDocument();
  });

  it("the ready screen closes as completed", () => {
    const { onClose } = setup();
    fireEvent.change(screen.getByPlaceholderText("e.g. 5,000"), { target: { value: "7000" } });
    fireEvent.click(screen.getByRole("button", { name: /See my projection/ }));
    fireEvent.click(screen.getByRole("button", { name: /Explore my projection/ }));
    expect(onClose).toHaveBeenCalledWith(true);
  });

  it("skip closes as not-completed without applying values", () => {
    const { onComplete, onClose } = setup();
    fireEvent.click(screen.getByRole("button", { name: /Skip/ }));
    expect(onComplete).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledWith(false);
  });
});
