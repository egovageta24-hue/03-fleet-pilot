import { expect, test } from "@playwright/test";
import { USERS, login } from "./helpers";

// Diego starts the day with orders that are still only "assigned" in the seed data.
const DRIVER = "diego@fleetpilot.test";

test.describe("driver journey", () => {
  test("opens assigned deliveries, sees sequence + customer details and marks pickup → out for delivery → delivered", async ({ page }) => {
    await login(page, DRIVER);

    // Drivers land on their own run, not the staff dashboard.
    await expect(page).toHaveURL(/\/my-deliveries/);
    await expect(page.getByRole("heading", { name: /^Hi Diego/ })).toBeVisible();

    // Sequence and customer details are visible on the first stop.
    const stops = page.getByRole("article");
    await expect(stops.first()).toBeVisible();
    await expect(stops.first().getByText("1", { exact: true })).toBeVisible();
    await expect(stops.first().getByRole("link", { name: /^\(555\)/ })).toBeVisible(); // tap-to-call
    const reference = (await stops.first().getByRole("link", { name: /^FP-\d+$/ }).innerText()).trim();

    // Drivers cannot see staff-only controls.
    await expect(page.getByRole("link", { name: "Dashboard" })).toHaveCount(0);

    // Work the first stop through its remaining steps.
    const first = () => page.getByRole("article").filter({ has: page.getByRole("link", { name: reference, exact: true }) });
    // The primary (first) button is always the next legal step: pickup → start delivery → delivered.
    const seen: string[] = [];
    for (let i = 0; i < 4 && (await first().count()) > 0; i++) {
      const primary = first().getByRole("button").first();
      const label = (await primary.innerText()).trim();
      seen.push(label);
      await primary.click();
      // Wait for the step to land: the card either disappears (delivered) or offers the next step.
      await expect(async () => {
        if ((await first().count()) === 0) return;
        const next = (await first().getByRole("button").first().innerText()).trim();
        expect(next).not.toBe(label);
      }).toPass();
    }
    expect(seen.at(-1)).toBe("Mark delivered");

    // It leaves the run and appears under "Delivered today".
    await expect(first()).toHaveCount(0);
    await page.getByText(/Delivered today \(\d+\)/).click();
    await expect(page.getByRole("link", { name: reference, exact: true })).toBeVisible();

    // The order's history shows every step, attributed to the driver.
    await page.getByRole("link", { name: reference, exact: true }).click();
    await expect(page.getByRole("heading", { name: reference })).toBeVisible();
    await page.getByRole("tab", { name: "Status history" }).click();
    await expect(page.getByRole("table")).toContainText("Diego Fernandez");
    await expect(page.getByRole("table")).toContainText(/Out for delivery[\s\S]*Delivered/);
  });

  test("cannot open another driver's order or any staff page", async ({ browser, page }) => {
    // Find an order held by someone else, as a dispatcher.
    const staff = await browser.newContext();
    const staffPage = await staff.newPage();
    await login(staffPage, USERS.dispatcher);
    await staffPage.goto("/orders?status=assigned");
    const row = staffPage.locator("table tbody tr").filter({ hasNotText: "Diego Fernandez" }).first();
    const href = await row.getByRole("link").first().getAttribute("href");
    const reference = (await row.getByRole("link").first().innerText()).trim();
    const customer = (await row.locator("td").nth(2).locator("div.font-medium").innerText()).trim();
    expect(href).toMatch(/^\/orders\//);
    await staff.close();

    await login(page, DRIVER);

    // The page answers "not found" and none of the order's details reach the browser.
    // (The HTTP status can be 200 because the response is already streaming when the
    // not-found boundary is reached; what matters is that nothing is disclosed.)
    const response = await page.goto(href!);
    await expect(page.getByRole("heading", { name: "Not found" })).toBeVisible();
    const html = await response!.text();
    expect(html).not.toContain(reference);
    expect(html).not.toContain(customer);
    expect(await page.content()).not.toContain(customer);

    // Staff sections bounce a driver back to their own home.
    for (const path of ["/dashboard", "/orders", "/drivers", "/reports", "/settings"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/my-deliveries/);
    }
  });
});
