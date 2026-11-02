import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema, type Db } from "@/db";
import type { Actor } from "@/lib/permissions";
import { assignOrder } from "@/server/orders/assign";
import { raiseException } from "@/server/orders/exceptions";
import { advanceOrder } from "@/server/orders/transition";
import { createTestDb } from "@/test/db";
import { makeDriver, makeOrder, makeUser } from "@/test/factories";
import { runIntegrityChecks } from "./integrity";

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());

const violations = async () => (await runIntegrityChecks(db)).filter((r) => r.violations.length > 0);

describe("integrity checks", () => {
  it("find nothing after real workflows run through the services", async () => {
    const d = await makeUser(db, "dispatcher");
    const dispatcher: Actor = { userId: d.id, role: "dispatcher", name: d.name, driverId: null };
    const a = await makeDriver(db);
    const b = await makeDriver(db);
    const driverA: Actor = { userId: a.user.id, role: "driver", name: a.user.name, driverId: a.driver.id };

    // delivered
    const o1 = await makeOrder(db);
    // Orders made by the factory have no creation history, so seed that first row like createOrder does.
    for (const o of [o1]) {
      await db.insert(schema.orderStatusHistory).values({ orderId: o.id, fromStatus: null, toStatus: "unassigned" });
    }
    await assignOrder(db, { orderId: o1.id, driverId: a.driver.id, actor: dispatcher });
    for (const to of ["picked_up", "out_for_delivery", "delivered"] as const) {
      await advanceOrder(db, { orderId: o1.id, to, actor: driverA });
    }

    // failed then recovered
    const o2 = await makeOrder(db);
    await db.insert(schema.orderStatusHistory).values({ orderId: o2.id, fromStatus: null, toStatus: "unassigned" });
    await assignOrder(db, { orderId: o2.id, driverId: a.driver.id, actor: dispatcher });
    await advanceOrder(db, { orderId: o2.id, to: "picked_up", actor: driverA });
    await advanceOrder(db, { orderId: o2.id, to: "out_for_delivery", actor: driverA });
    await raiseException(db, { orderId: o2.id, type: "customer_unavailable", markFailed: true, actor: driverA });
    await assignOrder(db, { orderId: o2.id, driverId: b.driver.id, actor: dispatcher });

    // cancelled
    const o3 = await makeOrder(db);
    await db.insert(schema.orderStatusHistory).values({ orderId: o3.id, fromStatus: null, toStatus: "unassigned" });
    await assignOrder(db, { orderId: o3.id, driverId: b.driver.id, actor: dispatcher });
    await advanceOrder(db, { orderId: o3.id, to: "cancelled", actor: dispatcher, note: "Merchant cancelled" });

    expect(await violations()).toEqual([]);
  });

  it("catch corrupted data", async () => {
    const { driver } = await makeDriver(db);

    // status without matching history
    const stale = await makeOrder(db);
    await db.insert(schema.orderStatusHistory).values({ orderId: stale.id, fromStatus: null, toStatus: "unassigned" });
    await db.update(schema.orders).set({ status: "delivered", deliveredAt: new Date() }).where(eq(schema.orders.id, stale.id));

    // driver_id with no assignment, and a counter that disagrees with the exceptions table
    const drifted = await makeOrder(db);
    await db.insert(schema.orderStatusHistory).values({ orderId: drifted.id, fromStatus: null, toStatus: "unassigned" });
    await db.update(schema.orders).set({ driverId: driver.id, openExceptions: 2 }).where(eq(schema.orders.id, drifted.id));

    const names = (await violations()).map((v) => v.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "order.status equals the latest status-history row",
        "unassigned orders have no driver",
        "orders.open_exceptions equals the number of open exceptions",
      ]),
    );
  });
});
