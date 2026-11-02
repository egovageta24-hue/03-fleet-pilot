import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema, type Db } from "@/db";
import type { Actor } from "@/lib/permissions";
import { DEFAULT_SETTINGS } from "@/lib/validation/settings";
import { assignOrder } from "@/server/orders/assign";
import { getGeneralSettings } from "@/server/queries/settings";
import { createTestDb } from "@/test/db";
import { makeDriver, makeOrder, makeUser } from "@/test/factories";
import { updateGeneralSettings } from "./settings";
import { createUser, listUsers, resetPassword, updateUser } from "./users";

let db: Db;
let close: () => Promise<void>;
let admin: Actor;
let dispatcher: Actor;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  const a = await makeUser(db, "admin");
  admin = { userId: a.id, role: "admin", name: a.name, driverId: null };
  const d = await makeUser(db, "dispatcher");
  dispatcher = { userId: d.id, role: "dispatcher", name: d.name, driverId: null };
});
afterAll(() => close());

describe("settings", () => {
  it("falls back to defaults, then stores validated changes (admin only)", async () => {
    expect(await getGeneralSettings(db)).toEqual(DEFAULT_SETTINGS);

    const saved = await updateGeneralSettings(db, admin, { ...DEFAULT_SETTINGS, companyName: "Acme Couriers", timezone: "Asia/Karachi", atRiskMinutes: 30 });
    expect(saved.companyName).toBe("Acme Couriers");
    expect(await getGeneralSettings(db)).toMatchObject({ companyName: "Acme Couriers", timezone: "Asia/Karachi", atRiskMinutes: 30 });

    await expect(updateGeneralSettings(db, dispatcher, DEFAULT_SETTINGS)).rejects.toThrow(/permission/);
    await expect(updateGeneralSettings(db, admin, { ...DEFAULT_SETTINGS, timezone: "Mars/Olympus" })).rejects.toThrow(/timezone/i);
    await expect(updateGeneralSettings(db, admin, { ...DEFAULT_SETTINGS, operatingStart: "18:00", operatingEnd: "09:00" })).rejects.toThrow(/after they start/);
  });
});

describe("users", () => {
  it("creates staff and driver accounts with hashed passwords and a driver profile", async () => {
    const staff = await createUser(db, admin, { name: "New Dispatcher", email: "  New.Dispatcher@Example.com ", role: "dispatcher", password: "correct horse battery" });
    expect(staff.email).toBe("new.dispatcher@example.com");
    expect(staff.passwordHash).not.toContain("correct horse");
    expect(await bcrypt.compare("correct horse battery", staff.passwordHash)).toBe(true);

    const driver = await createUser(db, admin, { name: "New Driver", email: "driver.new@example.com", role: "driver", password: "another long password", phone: "555-0101" });
    const [profile] = await db.select().from(schema.drivers).where(eq(schema.drivers.userId, driver.id));
    expect(profile).toMatchObject({ phone: "555-0101", availability: "off_duty" });

    await expect(createUser(db, admin, { name: "Dup", email: "NEW.DISPATCHER@example.com", role: "manager", password: "whatever long" })).rejects.toThrow(/already exists/);
    await expect(createUser(db, admin, { name: "No Phone", email: "np@example.com", role: "driver", password: "whatever long" })).rejects.toThrow(/phone/);
    await expect(createUser(db, dispatcher, { name: "X", email: "x@example.com", role: "manager", password: "whatever long" })).rejects.toThrow(/permission/);

    const all = await listUsers(db, admin);
    expect(all.find((u) => u.email === "driver.new@example.com")?.driverId).toBe(profile.id);
  });

  it("protects against locking everyone out", async () => {
    const other = await makeUser(db, "admin");

    // cannot touch yourself
    await expect(updateUser(db, admin, { userId: admin.userId, active: false })).rejects.toThrow(/your own/);
    await expect(updateUser(db, admin, { userId: admin.userId, role: "manager" })).rejects.toThrow(/your own/);

    // another admin can be demoted while a second active admin remains
    await updateUser(db, admin, { userId: other.id, role: "manager" });
    // ...but the last active admin can never be removed by someone else (simulate: only `other` is admin)
    const solo = await makeUser(db, "admin");
    await db.update(schema.users).set({ active: false }).where(eq(schema.users.id, admin.userId));
    const soloActor: Actor = { userId: other.id, role: "admin", name: "x", driverId: null };
    await expect(updateUser(db, soloActor, { userId: solo.id, active: false })).rejects.toThrow(/at least one active administrator/);
    await db.update(schema.users).set({ active: true }).where(eq(schema.users.id, admin.userId));
  });

  it("keeps the driver role fixed and blocks deactivating a driver who holds orders", async () => {
    const { user, driver } = await makeDriver(db);
    await expect(updateUser(db, admin, { userId: user.id, role: "manager" })).rejects.toThrow(/Driver accounts/);

    const order = await makeOrder(db);
    await assignOrder(db, { orderId: order.id, driverId: driver.id, actor: dispatcher });
    await expect(updateUser(db, admin, { userId: user.id, active: false })).rejects.toThrow(/still holds 1 order/);
  });

  it("resets a password", async () => {
    const u = await makeUser(db, "manager");
    await resetPassword(db, admin, { userId: u.id, password: "brand new password" });
    const [row] = await db.select().from(schema.users).where(eq(schema.users.id, u.id));
    expect(await bcrypt.compare("brand new password", row.passwordHash)).toBe(true);
    await expect(resetPassword(db, dispatcher, { userId: u.id, password: "nope nope nope" })).rejects.toThrow(/permission/);
  });
});
