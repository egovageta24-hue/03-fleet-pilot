import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema, type Db } from "@/db";
import { createTestDb } from "@/test/db";
import { makeDriver, makeOrder } from "@/test/factories";

let db: Db;
let close: () => Promise<void>;

/** Drizzle wraps driver errors ("Failed query: …"); the Postgres message is on `.cause`. */
async function pgError(p: PromiseLike<unknown>): Promise<string> {
  try {
    await p;
  } catch (err) {
    const e = err as Error & { cause?: Error };
    return e.cause?.message ?? e.message;
  }
  throw new Error("expected the query to be rejected, but it succeeded");
}

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());

describe("migrations", () => {
  it("create the core tables", async () => {
    const res = (await db.execute(
      sql`select table_name from information_schema.tables where table_schema = 'public'`,
    )) as unknown as { rows: { table_name: string }[] };
    const names = res.rows.map((r) => r.table_name);
    for (const t of [
      "users",
      "drivers",
      "vehicles",
      "customers",
      "addresses",
      "areas",
      "orders",
      "assignments",
      "order_status_history",
      "delivery_events",
      "exceptions",
      "app_settings",
    ]) {
      expect(names).toContain(t);
    }
  });
});

describe("status history is append-only (DB trigger)", () => {
  it("rejects UPDATE and DELETE on order_status_history", async () => {
    const order = await makeOrder(db);
    const [row] = await db
      .insert(schema.orderStatusHistory)
      .values({ orderId: order.id, fromStatus: null, toStatus: "unassigned" })
      .returning();

    expect(
      await pgError(
        db.update(schema.orderStatusHistory).set({ note: "tampered" }).where(eq(schema.orderStatusHistory.id, row.id)),
      ),
    ).toMatch(/order_status_history is append-only: UPDATE/);
    expect(
      await pgError(db.delete(schema.orderStatusHistory).where(eq(schema.orderStatusHistory.id, row.id))),
    ).toMatch(/order_status_history is append-only: DELETE/);

    const [still] = await db
      .select()
      .from(schema.orderStatusHistory)
      .where(eq(schema.orderStatusHistory.id, row.id));
    expect(still.note).toBeNull();
  });

  it("rejects UPDATE and DELETE on delivery_events", async () => {
    const order = await makeOrder(db);
    const [row] = await db
      .insert(schema.deliveryEvents)
      .values({ orderId: order.id, type: "created" })
      .returning();

    expect(
      await pgError(
        db.update(schema.deliveryEvents).set({ type: "note" }).where(eq(schema.deliveryEvents.id, row.id)),
      ),
    ).toMatch(/delivery_events is append-only: UPDATE/);
    expect(
      await pgError(db.delete(schema.deliveryEvents).where(eq(schema.deliveryEvents.id, row.id))),
    ).toMatch(/delivery_events is append-only: DELETE/);
  });
});

describe("assignments", () => {
  it("allows only one active assignment per order", async () => {
    const order = await makeOrder(db);
    const { driver: a } = await makeDriver(db);
    const { driver: b } = await makeDriver(db);

    await db.insert(schema.assignments).values({ orderId: order.id, driverId: a.id, sequence: 1 });
    expect(
      await pgError(db.insert(schema.assignments).values({ orderId: order.id, driverId: b.id, sequence: 1 })),
    ).toMatch(/assignments_one_active_per_order/);

    // A replaced assignment does not count as active, so history rows can accumulate.
    await db
      .update(schema.assignments)
      .set({ status: "replaced" })
      .where(eq(schema.assignments.orderId, order.id));
    await expect(
      db.insert(schema.assignments).values({ orderId: order.id, driverId: b.id, sequence: 1 }),
    ).resolves.toBeDefined();
  });
});
