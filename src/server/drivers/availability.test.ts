import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import type { Actor } from "@/lib/permissions";
import { assignOrder } from "@/server/orders/assign";
import { advanceOrder } from "@/server/orders/transition";
import { createTestDb } from "@/test/db";
import { makeDriver, makeOrder, makeUser } from "@/test/factories";
import { setDriverAvailability } from "./availability";

let db: Db;
let close: () => Promise<void>;
let dispatcher: Actor;
let manager: Actor;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  const d = await makeUser(db, "dispatcher");
  dispatcher = { userId: d.id, role: "dispatcher", name: d.name, driverId: null };
  const m = await makeUser(db, "manager");
  manager = { userId: m.id, role: "manager", name: m.name, driverId: null };
});
afterAll(() => close());

const driverActor = (u: { id: string; name: string }, driverId: string): Actor => ({ userId: u.id, role: "driver", name: u.name, driverId });

describe("setDriverAvailability", () => {
  it("lets dispatchers change anyone's availability and drivers change their own", async () => {
    const a = await makeDriver(db);
    const b = await makeDriver(db);

    expect((await setDriverAvailability(db, { driverId: a.driver.id, availability: "on_break", actor: dispatcher })).availability).toBe("on_break");
    expect((await setDriverAvailability(db, { driverId: a.driver.id, availability: "available", actor: driverActor(a.user, a.driver.id) })).availability).toBe("available");

    // a driver cannot change a colleague; a manager has no driver:manage
    await expect(setDriverAvailability(db, { driverId: b.driver.id, availability: "off_duty", actor: driverActor(a.user, a.driver.id) })).rejects.toThrow(/permission/);
    await expect(setDriverAvailability(db, { driverId: b.driver.id, availability: "off_duty", actor: manager })).rejects.toThrow(/permission/);
  });

  it("refuses off duty while the driver is carrying orders, but allows it once they are done", async () => {
    const { user, driver } = await makeDriver(db);
    const order = await makeOrder(db);
    await assignOrder(db, { orderId: order.id, driverId: driver.id, actor: dispatcher });

    // merely assigned (nothing picked up yet): fine to go off duty
    await setDriverAvailability(db, { driverId: driver.id, availability: "off_duty", actor: dispatcher });
    await setDriverAvailability(db, { driverId: driver.id, availability: "available", actor: dispatcher });

    await advanceOrder(db, { orderId: order.id, to: "picked_up", actor: driverActor(user, driver.id) });
    await expect(setDriverAvailability(db, { driverId: driver.id, availability: "off_duty", actor: dispatcher })).rejects.toThrow(/in progress/);
    // a break is always allowed
    await setDriverAvailability(db, { driverId: driver.id, availability: "on_break", actor: dispatcher });

    await advanceOrder(db, { orderId: order.id, to: "out_for_delivery", actor: driverActor(user, driver.id) });
    await advanceOrder(db, { orderId: order.id, to: "delivered", actor: driverActor(user, driver.id) });
    expect((await setDriverAvailability(db, { driverId: driver.id, availability: "off_duty", actor: dispatcher })).availability).toBe("off_duty");
  });
});
