import { expect, type Page } from "@playwright/test";

export const PASSWORD = process.env.SEED_PASSWORD ?? "fleetpilot";

export const USERS = {
  dispatcher: "priya@fleetpilot.test",
  manager: "elena@fleetpilot.test",
  admin: "admin@fleetpilot.test",
  driver: "sofia@fleetpilot.test",
} as const;

/** Sign in through the real login form. */
export async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}
