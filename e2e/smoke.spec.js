import { test, expect } from "@playwright/test";

test.describe("app smoke", () => {
  test("first-run quick start, then projects a salary and navigates tabs", async ({ page }) => {
    // Ensure a genuine first run so the quick-start modal shows
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    // App shell renders
    await expect(page.getByRole("heading", { name: /CPF Contribution Calculator/i })).toBeVisible();

    // First-run quick-start modal: complete it
    await expect(page.getByText(/Let's set up your projection/i)).toBeVisible();
    await page.locator(".input-field").last().fill("6500");
    await page.getByRole("button", { name: /See my projection/ }).click();
    await expect(page.getByText(/Your CPF projection is ready/i)).toBeVisible();
    await page.getByRole("button", { name: /Explore my projection/ }).click();

    // Live result strip shows a projected total
    await expect(page.getByText(/Total CPF · \d+ yr/)).toBeVisible();

    // Changing the salary in the sidebar updates the monthly contribution figure
    const salaryInput = page.getByPlaceholder("e.g. 5000");
    const contribCell = page.getByText("CPF Contribution / mo").locator("..");
    const before = await contribCell.textContent();
    await salaryInput.fill("8000");
    await expect(contribCell).not.toHaveText(before);

    // Lazy-loaded tabs render on demand: Housing Loan starts with an empty
    // state (no phantom property) and creates one on request
    await page.getByRole("tab", { name: /Housing Loan/ }).click();
    await expect(page.getByText(/Track a property purchase/i)).toBeVisible();
    await page.getByRole("button", { name: /Add my first property/ }).click();
    await expect(page.getByText("Property Details")).toBeVisible();

    // Growth Chart tab pulls in the Recharts chunk and renders an SVG chart
    await page.getByRole("tab", { name: /Growth Chart/ }).click();
    await expect(page.locator(".recharts-surface").first()).toBeVisible();

    // Inputs persist across reload (localStorage round-trip in a real browser)
    await page.reload();
    await expect(page.getByPlaceholder("e.g. 5000")).toHaveValue("8000");
  });
});
