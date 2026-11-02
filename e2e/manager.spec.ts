import { expect, test, type Page } from "@playwright/test";
import { USERS, login } from "./helpers";

/** Minimal RFC 4180 parser (quoted fields, doubled quotes, CRLF). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\r" || c === "\n") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Total from "Showing 1–25 of 61 orders" (or "No orders"). */
async function tableTotal(page: Page): Promise<number> {
  const text = (await page.getByText(/^(Showing .* of [\d,]+ orders|No orders)$/).first().innerText()).trim();
  const m = /of ([\d,]+) orders/.exec(text);
  return m ? Number(m[1].replace(/,/g, "")) : 0;
}

test.describe("manager journey", () => {
  test("filters the report by status and driver, exports CSV, and the file matches the table", async ({ page }) => {
    await login(page, USERS.manager);
    await page.goto("/reports");
    await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible();
    const all = await tableTotal(page);
    expect(all).toBeGreaterThan(0);

    // Filter by status...
    await page.getByRole("button", { name: /^Status/ }).click();
    await page.getByRole("option", { name: "Delivered" }).click();
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/status=delivered/);
    await expect.poll(() => tableTotal(page)).toBeLessThanOrEqual(all);

    // ...and by driver.
    await page.getByRole("button", { name: /^Driver/ }).click();
    await page.getByRole("option", { name: "Aisha Khan" }).click();
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/driver=/);
    await expect.poll(() => tableTotal(page)).toBeGreaterThan(0);
    const total = await tableTotal(page);

    // Export what is on screen. The filename contract is asserted on the HTTP response itself
    // (Chromium's `suggestedFilename()` for an <a download> is racy); the contents come from the real download.
    const exportLink = page.getByRole("link", { name: "Export CSV" });
    const href = await exportLink.getAttribute("href");
    const probe = await page.request.get(href!);
    expect(probe.headers()["content-type"]).toContain("text/csv");
    expect(probe.headers()["content-disposition"]).toMatch(
      /attachment; filename="fleetpilot-report-\d{4}-\d{2}-\d{2}_to_\d{4}-\d{2}-\d{2}\.csv"/,
    );

    const [download] = await Promise.all([page.waitForEvent("download"), exportLink.click()]);
    const stream = await download.createReadStream();
    let text = "";
    for await (const chunk of stream) text += chunk.toString("utf8");

    const [header, ...rows] = parseCsv(text).filter((r) => r.length > 1);
    expect(header).toEqual(expect.arrayContaining(["Order", "Delivery date", "Status", "Driver", "On time"]));
    expect(rows).toHaveLength(total); // the file has exactly the rows the table reports
    const col = (name: string) => header.indexOf(name);
    for (const r of rows) {
      expect(r[col("Status")]).toBe("Delivered");
      expect(r[col("Driver")]).toBe("Aisha Khan");
      expect(r[col("Order")]).toMatch(/^FP-\d+$/);
    }
  });

  test("sees settings read-only and has no user management", async ({ page }) => {
    await login(page, USERS.manager);
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await expect(page.getByText("only an administrator can change them")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Company name" })).toBeDisabled();
    await expect(page.getByRole("tab", { name: /Users/ })).toHaveCount(0);
  });
});

test.describe("report export permissions", () => {
  test("is refused for dispatchers (403) and signed-out users (401)", async ({ page, browser }) => {
    await login(page, USERS.dispatcher);
    const forbidden = await page.request.get("/api/reports/export");
    expect(forbidden.status()).toBe(403);

    // Dispatchers do not get the Reports or Settings pages at all.
    for (const path of ["/reports", "/settings"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/dashboard/);
    }

    const anon = await browser.newContext();
    const res = await anon.request.get("http://localhost:3000/api/reports/export");
    expect(res.status()).toBe(401);
    await anon.close();
  });
});
