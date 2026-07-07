import { test, expect } from "@playwright/test";

test.describe("app smoke", () => {
  test("loads, projects a salary, and navigates tabs", async ({ page }) => {
    await page.goto("/");

    // App shell renders
    await expect(page.getByRole("heading", { name: /CPF Contribution Calculator/i })).toBeVisible();

    // Live result strip shows a projected total for the default inputs
    await expect(page.getByText(/Total CPF · \d+ yr/)).toBeVisible();

    // Changing the salary updates the monthly contribution figure
    const salaryInput = page.getByPlaceholder("e.g. 5000");
    const contribCell = page.getByText("CPF Contribution / mo").locator("..");
    const before = await contribCell.textContent();
    await salaryInput.fill("8000");
    await expect(contribCell).not.toHaveText(before);

    // Lazy-loaded tabs render on demand: Housing Loan
    await page.getByRole("tab", { name: /Housing Loan/ }).click();
    await expect(page.getByText("Property Details")).toBeVisible();

    // Growth Chart tab pulls in the Recharts chunk and renders an SVG chart
    await page.getByRole("tab", { name: /Growth Chart/ }).click();
    await expect(page.locator(".recharts-surface").first()).toBeVisible();

    // Inputs persist across reload (localStorage round-trip in a real browser)
    await page.reload();
    await expect(page.getByPlaceholder("e.g. 5000")).toHaveValue("8000");
  });
});
