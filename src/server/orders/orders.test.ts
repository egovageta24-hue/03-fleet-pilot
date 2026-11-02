import { and, asc, eq, isNull } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema, type Db } from "@/db";
import type { Actor } from "@/lib/permissions";
import { createTestDb } from "@/test/db";
import { makeDriver, makeOrder, makeUser } from "@/test/factories";
import { assignOrder, bulkAssign, moveStop, unassignOrder } from "./assign";
import { createOrder, setPriority } from "./create";
import { raiseException, resolveException } from "./exceptions";
import { advanceOrder } from "./transition";

const { orders, assignments, orderStatusHistory, deliveryEvents, exceptions } = schema;

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

async function newDriver(opts?: Parameters<typeof makeDriver>[1]) {
  const { user, driver } = await makeDriver(db, opts);
  const actor: Actor = { userId: user.id, role: "driver", name: user.name, driverId: driver.id };
  return { user, driver, actor };
}

const getOrder = async (id: string) => (await db.select().from(orders).where(eq(orders.id, id)))[0];
const history = (id: string) =>
  db.select().from(orderStatusHistory).where(eq(orderStatusHistory.orderId, id)).orderBy(asc(orderStatusHistory.id));
const events = (id: string) =>
  db.select().from(deliveryEvents).where(eq(deliveryEvents.orderId, id)).orderBy(asc(deliveryEvents.id));
const allAssignments = (id: string) =>
  db.select().from(assignments).where(eq(assignments.orderId, id)).orderBy(asc(assignments.assignedAt), asc(assignments.sequence));

/** Error message of a rejected promise (domain errors carry user-facing text). */
async function rejection(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    return e as Error & { code?: string };
  }
  throw new Error("expected rejection");
}

describe("assignment", () => {
  it("moves an unassigned order to assigned and records everything", async () => {
    const order = await makeOrder(db);
    const { driver } = await newDriver();

    const res = await assignOrder(db, { orderId: order.id, driverId: driver.id, actor: dispatcher });

    expect(res.order.status).toBe("assigned");
    expect(res.order.driverId).toBe(driver.id);
    expect(res.order.firstAssignedAt).not.toBeNull();
    expect(res.assignment).toMatchObject({ status: "active", sequence: 1, assignedBy: dispatcher.userId });

    const h = await history(order.id);
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ fromStatus: "unassigned", toStatus: "assigned", changedBy: dispatcher.userId });
    const ev = await events(order.id);
    expect(ev.map((e) => e.type)).toEqual(["assigned"]);
    expect(ev[0].driverId).toBe(driver.id);
  });

  it("appends stops to the end of the driver's run", async () => {
    const { driver } = await newDriver();
    const a = await assignOrder(db, { orderId: (await makeOrder(db)).id, driverId: driver.id, actor: dispatcher });
    const b = await assignOrder(db, { orderId: (await makeOrder(db)).id, driverId: driver.id, actor: dispatcher });
    expect([a.assignment.sequence, b.assignment.sequence]).toEqual([1, 2]);
  });

  it("reassigns before pickup: status stays assigned, old assignment is kept as replaced", async () => {
    const order = await makeOrder(db);
    const { driver: first } = await newDriver();
    const { driver: second } = await newDriver();
    await assignOrder(db, { orderId: order.id, driverId: first.id, actor: dispatcher });

    const res = await assignOrder(db, { orderId: order.id, driverId: second.id, actor: dispatcher });
    expect(res.order).toMatchObject({ status: "assigned", driverId: second.id });

    const rows = await allAssignments(order.id);
    expect(rows.map((r) => [r.driverId, r.status])).toEqual([
      [first.id, "replaced"],
      [second.id, "active"],
    ]);
    expect(rows[0].endedAt).not.toBeNull();
    // Status did not change, so no extra status-history row; the swap is on the timeline.
    expect(await history(order.id)).toHaveLength(1);
    expect((await events(order.id)).map((e) => e.type)).toEqual(["assigned", "reassigned"]);
  });

  it("requires a reason to reassign an in-progress order, then resets it to assigned", async () => {
    const order = await makeOrder(db);
    const { driver: first, actor: firstActor } = await newDriver();
    const { driver: second } = await newDriver();
    await assignOrder(db, { orderId: order.id, driverId: first.id, actor: dispatcher });
    await advanceOrder(db, { orderId: order.id, to: "picked_up", actor: firstActor });

    const err = await rejection(assignOrder(db, { orderId: order.id, driverId: second.id, actor: dispatcher }));
    expect(err.code).toBe("invalid");

    const res = await assignOrder(db, {
      orderId: order.id,
      driverId: second.id,
      actor: dispatcher,
      reason: "Van broke down",
    });
    expect(res.order.status).toBe("assigned");
    const h = await history(order.id);
    expect(h.map((r) => [r.fromStatus, r.toStatus])).toEqual([
      ["unassigned", "assigned"],
      ["assigned", "picked_up"],
      ["picked_up", "assigned"],
    ]);
    expect(h[2].note).toBe("Van broke down");
  });

  it("refuses off-duty drivers, deactivated accounts and finished orders", async () => {
    const order = await makeOrder(db);
    const off = await newDriver({ availability: "off_duty" });
    const inactive = await newDriver({ active: false });
    expect((await rejection(assignOrder(db, { orderId: order.id, driverId: off.driver.id, actor: dispatcher }))).message)
      .toMatch(/off duty/);
    expect((await rejection(assignOrder(db, { orderId: order.id, driverId: inactive.driver.id, actor: dispatcher }))).message)
      .toMatch(/deactivated/);

    const done = await makeOrder(db, { status: "delivered" });
    const ok = await newDriver();
    expect((await rejection(assignOrder(db, { orderId: done.id, driverId: ok.driver.id, actor: dispatcher }))).code)
      .toBe("conflict");
    // Failed assignments leave nothing behind.
    expect(await history(order.id)).toHaveLength(0);
    expect(await allAssignments(order.id)).toHaveLength(0);
  });

  it("does not let two dispatchers silently overwrite each other (optimistic check)", async () => {
    const order = await makeOrder(db);
    const { driver: a } = await newDriver();
    const { driver: b } = await newDriver();

    // Both dispatchers loaded the order while it was unassigned.
    const results = await Promise.allSettled([
      assignOrder(db, { orderId: order.id, driverId: a.id, actor: dispatcher, expectedDriverId: null }),
      assignOrder(db, { orderId: order.id, driverId: b.id, actor: manager, expectedDriverId: null }),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const loser = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(loser.reason.message).toMatch(/just changed by someone else/);
    const active = await db
      .select()
      .from(assignments)
      .where(and(eq(assignments.orderId, order.id), eq(assignments.status, "active")));
    expect(active).toHaveLength(1);
    expect((await getOrder(order.id)).driverId).toBe(active[0].driverId);
  });

  it("returns an assigned order to the pool", async () => {
    const order = await makeOrder(db);
    const { driver } = await newDriver();
    await assignOrder(db, { orderId: order.id, driverId: driver.id, actor: dispatcher });

    const res = await unassignOrder(db, { orderId: order.id, actor: dispatcher, reason: "Wrong zone" });
    expect(res).toMatchObject({ status: "unassigned", driverId: null });
    expect((await allAssignments(order.id))[0]).toMatchObject({ status: "cancelled" });
    expect((await history(order.id)).map((r) => r.toStatus)).toEqual(["assigned", "unassigned"]);
  });

  it("cannot unassign once the driver has picked up", async () => {
    const order = await makeOrder(db);
    const { driver, actor } = await newDriver();
    await assignOrder(db, { orderId: order.id, driverId: driver.id, actor: dispatcher });
    await advanceOrder(db, { orderId: order.id, to: "picked_up", actor });
    expect((await rejection(unassignOrder(db, { orderId: order.id, actor: dispatcher }))).code).toBe("conflict");
  });

  it("bulk assign reports per-order outcomes", async () => {
    const { driver } = await newDriver();
    const ok1 = await makeOrder(db);
    const ok2 = await makeOrder(db);
    const taken = await makeOrder(db);
    const other = await newDriver();
    await assignOrder(db, { orderId: taken.id, driverId: other.driver.id, actor: dispatcher });

    const res = await bulkAssign(db, { orderIds: [ok1.id, taken.id, ok2.id], driverId: driver.id, actor: dispatcher });
    expect(res.map((r) => r.ok)).toEqual([true, false, true]);
    expect((await getOrder(taken.id)).driverId).toBe(other.driver.id);
    expect((await getOrder(ok2.id)).driverId).toBe(driver.id);
  });

  it("moves stops up and down within a run", async () => {
    const { driver } = await newDriver();
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const o = await makeOrder(db);
      ids.push(o.id);
      await assignOrder(db, { orderId: o.id, driverId: driver.id, actor: dispatcher });
    }
    const run = async () =>
      (
        await db
          .select()
          .from(assignments)
          .where(and(eq(assignments.driverId, driver.id), eq(assignments.status, "active")))
          .orderBy(asc(assignments.sequence))
      ).map((a) => a.orderId);

    const first = (await allAssignments(ids[0]))[0];
    expect(await moveStop(db, { assignmentId: first.id, direction: "down", actor: dispatcher })).toBe(true);
    expect(await run()).toEqual([ids[1], ids[0], ids[2]]);
    expect(await moveStop(db, { assignmentId: first.id, direction: "up", actor: dispatcher })).toBe(true);
    expect(await run()).toEqual(ids);
    expect(await moveStop(db, { assignmentId: first.id, direction: "up", actor: dispatcher })).toBe(false);
  });
});

describe("driver lifecycle & permissions", () => {
  it("lets a driver walk their own order to delivered, preserving every step", async () => {
    const order = await makeOrder(db);
    const { driver, actor } = await newDriver();
    await assignOrder(db, { orderId: order.id, driverId: driver.id, actor: dispatcher });

    for (const to of ["picked_up", "out_for_delivery", "delivered"] as const) {
      await advanceOrder(db, { orderId: order.id, to, actor });
    }

    const final = await getOrder(order.id);
    expect(final.status).toBe("delivered");
    expect(final.pickedUpAt).not.toBeNull();
    expect(final.deliveredAt).not.toBeNull();
    expect(final.driverId).toBe(driver.id); // kept for reporting
    expect((await allAssignments(order.id))[0].status).toBe("completed");
    expect((await history(order.id)).map((r) => [r.fromStatus, r.toStatus, r.changedBy])).toEqual([
      ["unassigned", "assigned", dispatcher.userId],
      ["assigned", "picked_up", actor.userId],
      ["picked_up", "out_for_delivery", actor.userId],
      ["out_for_delivery", "delivered", actor.userId],
    ]);
    expect((await events(order.id)).map((e) => e.type)).toEqual([
      "assigned",
      "picked_up",
      "out_for_delivery",
      "delivered",
    ]);
  });

  it("blocks illegal jumps, other drivers, cancelling and edits to finished orders", async () => {
    const order = await makeOrder(db);
    const { driver, actor } = await newDriver();
    const stranger = await newDriver();
    await assignOrder(db, { orderId: order.id, driverId: driver.id, actor: dispatcher });

    // assigned -> delivered skips steps
    expect((await rejection(advanceOrder(db, { orderId: order.id, to: "delivered", actor }))).code).toBe("forbidden");
    // someone else's delivery
    expect((await rejection(advanceOrder(db, { orderId: order.id, to: "picked_up", actor: stranger.actor }))).code)
      .toBe("forbidden");
    // drivers cannot cancel; managers cannot advance deliveries
    expect((await rejection(advanceOrder(db, { orderId: order.id, to: "cancelled", actor, note: "x" }))).code)
      .toBe("forbidden");
    expect((await rejection(advanceOrder(db, { orderId: order.id, to: "picked_up", actor: manager }))).code)
      .toBe("forbidden");
    // assignment moves must use the assignment services
    expect((await rejection(advanceOrder(db, { orderId: order.id, to: "assigned" as never, actor: dispatcher }))).code)
      .toBe("invalid");
    expect((await getOrder(order.id)).status).toBe("assigned");

    const done = await makeOrder(db, { status: "delivered" });
    expect((await rejection(advanceOrder(db, { orderId: done.id, to: "cancelled", actor: dispatcher, note: "x" }))).code)
      .toBe("forbidden");
  });

  it("cancelling needs a reason, closes the assignment and keeps the trail", async () => {
    const order = await makeOrder(db);
    const { driver } = await newDriver();
    await assignOrder(db, { orderId: order.id, driverId: driver.id, actor: dispatcher });

    expect((await rejection(advanceOrder(db, { orderId: order.id, to: "cancelled", actor: dispatcher }))).code)
      .toBe("invalid");
    await advanceOrder(db, { orderId: order.id, to: "cancelled", actor: dispatcher, note: "Merchant cancelled" });

    expect((await getOrder(order.id)).status).toBe("cancelled");
    expect((await allAssignments(order.id))[0].status).toBe("cancelled");
    const h = await history(order.id);
    expect(h.at(-1)).toMatchObject({ fromStatus: "assigned", toStatus: "cancelled", note: "Merchant cancelled" });
  });
});

describe("exceptions", () => {
  it("a driver can fail a delivery with an exception; dispatcher recovers it by reassigning", async () => {
    const order = await makeOrder(db);
    const { driver, actor } = await newDriver();
    const { driver: next } = await newDriver();
    await assignOrder(db, { orderId: order.id, driverId: driver.id, actor: dispatcher });
    await advanceOrder(db, { orderId: order.id, to: "picked_up", actor });
    await advanceOrder(db, { orderId: order.id, to: "out_for_delivery", actor });

    const { order: failed, exception } = await raiseException(db, {
      orderId: order.id,
      type: "customer_unavailable",
      description: "Nobody home",
      markFailed: true,
      actor,
    });
    expect(failed).toMatchObject({ status: "failed", openExceptions: 1 });
    expect(exception).toMatchObject({ status: "open", severity: "critical" });
    expect((await history(order.id)).at(-1)).toMatchObject({ toStatus: "failed" });

    const retry = await assignOrder(db, { orderId: order.id, driverId: next.id, actor: dispatcher });
    expect(retry.order).toMatchObject({ status: "assigned", driverId: next.id, openExceptions: 1 });

    const resolved = await resolveException(db, {
      exceptionId: exception.id,
      resolutionNote: "Rebooked for tomorrow",
      actor: dispatcher,
    });
    expect(resolved.order.openExceptions).toBe(0);
    expect(resolved.exception).toMatchObject({ status: "resolved", resolvedBy: dispatcher.userId });
    expect((await rejection(resolveException(db, { exceptionId: exception.id, resolutionNote: "again", actor: dispatcher }))).code)
      .toBe("conflict");
  });

  it("only the assigned driver can flag their order, and only started orders can fail", async () => {
    const order = await makeOrder(db);
    const { driver, actor } = await newDriver();
    const stranger = await newDriver();
    await assignOrder(db, { orderId: order.id, driverId: driver.id, actor: dispatcher });

    expect((await rejection(raiseException(db, { orderId: order.id, type: "delayed", actor: stranger.actor }))).code)
      .toBe("forbidden");
    expect((await rejection(raiseException(db, { orderId: order.id, type: "delayed", markFailed: true, actor }))).code)
      .toBe("invalid");
    expect((await getOrder(order.id)).openExceptions).toBe(0);
  });

  it("delivering an order resolves its open exceptions", async () => {
    const order = await makeOrder(db);
    const { driver, actor } = await newDriver();
    await assignOrder(db, { orderId: order.id, driverId: driver.id, actor: dispatcher });
    await advanceOrder(db, { orderId: order.id, to: "picked_up", actor });
    await raiseException(db, { orderId: order.id, type: "delayed", actor });
    expect((await getOrder(order.id)).openExceptions).toBe(1);

    await advanceOrder(db, { orderId: order.id, to: "out_for_delivery", actor });
    await advanceOrder(db, { orderId: order.id, to: "delivered", actor });

    expect((await getOrder(order.id)).openExceptions).toBe(0);
    const open = await db
      .select()
      .from(exceptions)
      .where(and(eq(exceptions.orderId, order.id), eq(exceptions.status, "open")));
    expect(open).toHaveLength(0);
    expect((await events(order.id)).map((e) => e.type)).toContain("exception_resolved");
  });
});

describe("creating orders & priority", () => {
  it("creates an unassigned order with a unique reference and a first history row", async () => {
    const seedOrder = await makeOrder(db);
    const [pickup] = await db
      .select()
      .from(schema.addresses)
      .where(and(eq(schema.addresses.id, seedOrder.pickupAddressId), isNull(schema.addresses.customerId)));
    const input = {
      merchantName: "Acme Store",
      pickupAddressId: pickup.id,
      customer: { name: "Jo Bloggs", phone: "555-0100", email: undefined },
      delivery: { line1: "1 High St", line2: undefined, city: "Testville", postcode: "T1 1AA", areaId: seedOrder.deliveryAreaId },
      priority: "high" as const,
      packages: 2,
      weightKg: 3.5,
      notes: undefined,
      windowStart: new Date(Date.now() + 3_600_000),
      windowEnd: new Date(Date.now() + 7_200_000),
    };

    const a = await createOrder(db, input, dispatcher);
    const b = await createOrder(db, input, dispatcher);

    expect(a.reference).toMatch(/^FP-\d+$/);
    expect(a.reference).not.toBe(b.reference);
    expect(a).toMatchObject({ status: "unassigned", priority: "high", createdBy: dispatcher.userId });
    expect((await history(a.id)).map((r) => [r.fromStatus, r.toStatus])).toEqual([[null, "unassigned"]]);
    expect((await events(a.id)).map((e) => e.type)).toEqual(["created"]);

    expect((await rejection(createOrder(db, input, manager))).code).toBe("forbidden");
    expect(
      (await rejection(createOrder(db, { ...input, windowEnd: input.windowStart }, dispatcher))).code,
    ).toBe("invalid");
  });

  it("records priority changes on the timeline", async () => {
    const order = await makeOrder(db);
    const updated = await setPriority(db, { orderId: order.id, priority: "urgent", actor: manager });
    expect(updated.priority).toBe("urgent");
    const ev = await events(order.id);
    expect(ev[0]).toMatchObject({ type: "priority_changed", payload: { from: "normal", to: "urgent" } });
    // no-op when unchanged
    await setPriority(db, { orderId: order.id, priority: "urgent", actor: manager });
    expect(await events(order.id)).toHaveLength(1);
  });
});
