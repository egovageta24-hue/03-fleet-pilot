import { expect, test } from "@playwright/test";
import { USERS, login } from "./helpers";

test.describe("dispatcher journey", () => {
  test("finds an unassigned order, assigns a driver and sees status, timeline and history update", async ({ page }) => {
    await login(page, USERS.dispatcher);

    // Open the unassigned queue.
    await page.goto("/orders?status=unassigned");
    const firstRow = page.locator("table tbody tr").first();
    await expect(firstRow).toBeVisible();
    const reference = (await firstRow.getByRole("link").first().innerText()).trim();
    expect(reference).toMatch(/^FP-\d+$/);

    // Assign the suggested driver from the dialog.
    await firstRow.getByRole("button", { name: "Assign" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const suggested = dialog.locator("label", { hasText: "Suggested" });
    await expect(suggested).toBeVisible();
    const driverName = (await suggested.locator("span.text-sm.font-medium").first().innerText()).trim();
    await suggested.click();
    await dialog.getByRole("button", { name: "Assign driver" }).click();
    await expect(page.getByText(`${reference} assigned to ${driverName}`)).toBeVisible();

    // The order leaves the unassigned queue...
    await page.reload();
    await expect(page.getByRole("link", { name: reference, exact: true })).toHaveCount(0);

    // ...and its detail page reflects the new state, with the history preserved.
    await page.goto(`/orders?q=${reference}`);
    await page.getByRole("link", { name: reference, exact: true }).first().click();
    await expect(page.getByRole("heading", { name: reference })).toBeVisible();
    await expect(page.getByText("Assigned", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(`Assigned to ${driverName}`)).toBeVisible();

    await page.getByRole("tab", { name: "Status history" }).click();
    const rows = page.getByRole("table").getByRole("row");
    await expect(rows).toHaveCount(3); // header + "created" + "assigned"
    await expect(rows.nth(1)).toContainText("Order created"); // the first entry is kept
    await expect(rows.nth(2)).toContainText(/Unassigned[\s\S]*Assigned[\s\S]*Priya Nair/);
  });

  test("creates a new order that joins the unassigned queue with its history started", async ({ page }) => {
    await login(page, USERS.dispatcher);
    await page.goto("/orders");
    await page.getByRole("button", { name: "New order" }).click();
    const dialog = page.getByRole("dialog", { name: "New order" });

    const customer = `E2E Customer ${Date.now()}`;
    await dialog.getByLabel("Name", { exact: true }).fill(customer);
    await dialog.getByLabel("Phone").fill("(555) 010-9999");
    await dialog.getByLabel("Street address").fill("42 Testing Lane");
    await dialog.getByLabel("Postcode").fill("RV1 1AA");
    await dialog.getByRole("combobox", { name: "Zone" }).click();
    await page.getByRole("option", { name: /Midtown/ }).click();
    await dialog.getByRole("button", { name: "Create order" }).click();

    await expect(page.getByText(/Order FP-\d+ created/)).toBeVisible();

    await page.goto(`/orders?q=${encodeURIComponent(customer)}`);
    const row = page.locator("table tbody tr").first();
    await expect(row).toContainText(customer);
    await expect(row).toContainText("Unassigned");
    await row.getByRole("link").first().click();
    await page.getByRole("tab", { name: "Status history" }).click();
    await expect(page.getByRole("table")).toContainText("Order created");
  });
});
