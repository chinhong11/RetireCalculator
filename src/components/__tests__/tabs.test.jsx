// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import HousingLoanTab from "../tabs/HousingLoanTab.jsx";
import SummaryTab from "../tabs/SummaryTab.jsx";

beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

// ─── HousingLoanTab — user flows ──────────────────────────────────────────────

describe("HousingLoanTab", () => {
  it("renders the default property with its purchase price", () => {
    render(<HousingLoanTab />);
    expect(screen.getByText(/🏠 My Property/)).toBeInTheDocument();
    // Default newProperty(): RM500k @ 4% over 35 years
    expect(screen.getByDisplayValue("500000")).toBeInTheDocument();
  });

  it("shows a validation error when adding a downpayment with no date or amount", () => {
    render(<HousingLoanTab />);
    fireEvent.click(screen.getAllByText("+ Add")[0]); // downpayment Add button
    expect(screen.getByText(/Date and amount are required/i)).toBeInTheDocument();
  });

  // The property form has SPA/VP date inputs first; the downpayment row's
  // date input is the last type=date in the document.
  const dpDateInput = (container) =>
    [...container.querySelectorAll('input[type="date"]')].at(-1);

  it("adds a downpayment record and reduces the loan amount", () => {
    const { container } = render(<HousingLoanTab />);

    const dateInput   = dpDateInput(container);
    const amountInput = screen.getByPlaceholderText("e.g. 50000");
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
    const { container } = render(<HousingLoanTab />);
    fireEvent.change(dpDateInput(container), { target: { value: "2026-02-01" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. 50000"), { target: { value: "25000" } });
    fireEvent.click(screen.getAllByText("+ Add")[0]);

    const stored = JSON.parse(localStorage.getItem("hl_props_v1"));
    expect(stored[0].downpaymentRecords).toHaveLength(1);
    expect(stored[0].downpaymentRecords[0].amount).toBe(25000);
  });

  it("adds a second property via + Add Property", () => {
    render(<HousingLoanTab />);
    fireEvent.click(screen.getByText("+ Add Property"));
    expect(JSON.parse(localStorage.getItem("hl_props_v1"))).toHaveLength(2);
  });

  it("delete asks for confirmation and keeps the property when declined", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<HousingLoanTab />);
    fireEvent.click(screen.getByText("Delete Property"));
    expect(window.confirm).toHaveBeenCalled();
    expect(screen.getByText(/🏠 My Property/)).toBeInTheDocument();
  });

  it("deleting the last property replaces it with a fresh one", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<HousingLoanTab />);
    fireEvent.click(screen.getByText("Delete Property"));
    // Never left with zero properties
    expect(JSON.parse(localStorage.getItem("hl_props_v1"))).toHaveLength(1);
    expect(screen.getByText(/🏠 My Property/)).toBeInTheDocument();
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
    expect(screen.getByText("S$220,000")).toBeInTheDocument();
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
