import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema, type Db } from "@/db";
import { toCsv } from "@/lib/csv";
import { dayRangeInTz } from "@/lib/dates";
import type { OrderStatus } from "@/lib/domain";
import type { Actor } from "@/lib/permissions";
import { reportCsvColumns } from "@/lib/reports";
import { parseOrderFilters } from "@/lib/validation/filters";
import { assignOrder } from "@/server/orders/assign";
import { raiseException } from "@/server/orders/exceptions";
import { advanceOrder } from "@/server/orders/transition";
import { createTestDb } from "@/test/db";
import { makeDriver, makeOrder, makeUser } from "@/test/factories";
import { getBoard } from "./board";
import { getDashboard } from "./dashboard";
import { getDriverSummaries } from "./drivers";
import { listOrders } from "./orders";
import { getReportSummary, queryReportRows, withReportDefaults } from "./reports";

const TZ = "UTC";
const MIN = 60_000;
let db: Db;
let close: () => Promise<void>;
let dispatcher: Actor;
let manager: Actor;
let drvA: Awaited<ReturnType<typeof makeDriver>>;
let drvB: Awaited<ReturnType<typeof makeDriver>>;
const now = new Date();
const at = (m: number) => new Date(now.getTime() + m * MIN);
const ctx = { tz: TZ, now, atRiskMinutes: 45 };

const patch = (id: string, p: Partial<typeof schema.orders.$inferInsert>) => db.update(schema.orders).set(p).where(eq(schema.orders.id, id));
const asDriver = (d: typeof drvA): Actor => ({ userId: d.user.id, role: "driver", name: d.user.name, driverId: d.driver.id });

/*
 * Scenario (everything relative to "now", UTC day):
 *   U1 unassigned, window passed 15m ago  -> overdue
 *   U2 unassigned, window ends in 20m     -> at risk (any open order counts, assigned or not)
 *   U3 unassigned, window in 3h
 *   P1 assigned to A, window in 30m       -> at risk
 *   P2 assigned to A, window in 3h
 *   D1 delivered by A just now, window in 10m  -> on time   (assigned after 10m)
 *   D2 delivered by B just now, window 10m ago -> late      (assigned after 20m)
 *   F1 failed (driver B) with an open exception
 *   Y1 delivered yesterday by A (must not count as "today")
 */
const ids: Record<string, string> = {};

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  const d = await makeUser(db, "dispatcher");
  dispatcher = { userId: d.id, role: "dispatcher", name: d.name, driverId: null };
  const m = await makeUser(db, "manager");
  manager = { userId: m.id, role: "manager", name: m.name, driverId: null };
  drvA = await makeDriver(db);
  drvB = await makeDriver(db);

  const mk = async (key: string, status: OrderStatus = "unassigned") => (ids[key] = (await makeOrder(db, { status })).id);
  await mk("U1");
  await mk("U2");
  await mk("U3");
  await mk("P1");
  await mk("P2");
  await mk("D1");
  await mk("D2");
  await mk("F1");
  await mk("Y1");

  await patch(ids.U1, { windowStart: at(-135), windowEnd: at(-15) });
  await patch(ids.U2, { windowStart: at(-100), windowEnd: at(20) });
  await patch(ids.U3, { windowStart: at(60), windowEnd: at(180) });

  for (const [key, drv] of [["P1", drvA], ["P2", drvA], ["D1", drvA], ["D2", drvB], ["F1", drvB], ["Y1", drvA]] as const) {
    await assignOrder(db, { orderId: ids[key], driverId: drv.driver.id, actor: dispatcher });
  }
  await patch(ids.P1, { windowStart: at(-90), windowEnd: at(30) });
  await patch(ids.P2, { windowStart: at(60), windowEnd: at(180) });

  for (const key of ["D1", "D2", "Y1"]) {
    const drv = key === "D2" ? drvB : drvA;
    for (const to of ["picked_up", "out_for_delivery", "delivered"] as const) {
      await advanceOrder(db, { orderId: ids[key], to, actor: asDriver(drv) });
    }
  }
  await patch(ids.D1, { windowStart: at(-110), windowEnd: at(10), createdAt: at(-11), firstAssignedAt: at(-1), deliveredAt: now });
  await patch(ids.D2, { windowStart: at(-130), windowEnd: at(-10), createdAt: at(-21), firstAssignedAt: at(-1), deliveredAt: now });
  // Y1 lived entirely yesterday: created, assigned and delivered before today began.
  const dayStart = dayRangeInTz(now, TZ).start.getTime();
  await patch(ids.Y1, {
    createdAt: new Date(dayStart - 180 * MIN),
    firstAssignedAt: new Date(dayStart - 170 * MIN),
    deliveredAt: new Date(dayStart - 60 * MIN),
    windowStart: new Date(dayStart - 150 * MIN),
    windowEnd: new Date(dayStart - 30 * MIN),
  });

  await advanceOrder(db, { orderId: ids.F1, to: "picked_up", actor: asDriver(drvB) });
  await advanceOrder(db, { orderId: ids.F1, to: "out_for_delivery", actor: asDriver(drvB) });
  await raiseException(db, { orderId: ids.F1, type: "customer_unavailable", markFailed: true, actor: asDriver(drvB) });
  await patch(ids.F1, { windowStart: at(30), windowEnd: at(150) });
});
afterAll(() => close());

describe("dashboard", () => {
  it("computes the daily KPIs exactly", async () => {
    const data = await getDashboard(db, dispatcher, { ...ctx, operatingStart: "07:00", operatingEnd: "20:00" });
    const k = data.kpis;
    expect(k.unassigned).toBe(3);
    expect(k.failed).toBe(1);
    expect(k.active).toBe(2); // P1, P2 (assigned)
    expect(k.deliveredToday).toBe(2); // D1, D2 — Y1 was yesterday
    expect(k.onTimeRate).toBe(0.5); // D1 on time, D2 late
    expect(k.exceptionOrders).toBe(1);
    expect(k.openExceptions).toBe(1);
    expect(k.overdue).toBe(1); // U1 only (open + window passed)
    expect(k.atRisk).toBe(2); // U2 (unassigned, ends in 20m) and P1 (assigned, ends in 30m)
    // Mean over every order first assigned today: D1 took 10m, D2 took 20m and P1, P2, F1 were
    // assigned immediately (~0m); Y1 was assigned yesterday and is excluded. (10 + 20 + 0 + 0 + 0) / 5 = 6.
    expect(k.avgAssignMinutes).toBeCloseTo(6, 0);
  });

  it("ranks attention: overdue first, then failed, then unassigned, then at-risk", async () => {
    const data = await getDashboard(db, dispatcher, { ...ctx, operatingStart: "07:00", operatingEnd: "20:00" });
    const order = data.attention.map((a) => a.order.id);
    expect(order[0]).toBe(ids.U1); // overdue + unassigned
    expect(order.indexOf(ids.F1)).toBeLessThan(order.indexOf(ids.U2));
    expect(order.indexOf(ids.U2)).toBeLessThan(order.indexOf(ids.P1)); // unassigned outranks merely at-risk
    expect(order).not.toContain(ids.P2); // healthy
    expect(order).not.toContain(ids.D1);
    expect(data.attentionTotal).toBe(order.length);
  });

  it("covers today's orders and open work in the status mix", async () => {
    const data = await getDashboard(db, dispatcher, { ...ctx, operatingStart: "07:00", operatingEnd: "20:00" });
    const mix = Object.fromEntries(data.statusMix.map((s) => [s.status, s.count]));
    expect(mix).toMatchObject({ unassigned: 3, assigned: 2, delivered: 2, failed: 1 });
  });
});

describe("drivers", () => {
  it("derives state and load from orders, not from stored flags", async () => {
    const summaries = await getDriverSummaries(db, dayRangeInTz(now, TZ), now);
    const a = summaries.find((s) => s.id === drvA.driver.id)!;
    const b = summaries.find((s) => s.id === drvB.driver.id)!;
    expect(a).toMatchObject({ assigned: 2, active: 2, deliveredToday: 1, state: "assigned" });
    expect(b).toMatchObject({ failed: 1, active: 1, deliveredToday: 1 });
    expect(a.overdue).toBe(0);
    expect(a.nextStop?.orderId).toBeDefined();
  });
});

describe("orders list filters", () => {
  const list = (params: Record<string, string>) => listOrders(db, dispatcher, parseOrderFilters(params), ctx);

  it("filters by status, by 'no driver', and by driver", async () => {
    expect((await list({ status: "unassigned" })).rows.map((r) => r.id).sort()).toEqual([ids.U1, ids.U2, ids.U3].sort());
    expect((await list({ driver: "none" })).total).toBe(3);
    expect((await list({ driver: drvB.driver.id })).rows.map((r) => r.id).sort()).toEqual([ids.D2, ids.F1].sort());
  });

  it("searches customer names without treating % or _ as wildcards", async () => {
    const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, ids.U3));
    const [customer] = await db.select().from(schema.customers).where(eq(schema.customers.id, order.customerId));
    expect((await list({ q: customer.name })).rows.map((r) => r.id)).toContain(ids.U3);
    expect((await list({ q: "%" })).total).toBe(0); // literal percent sign, not "match everything"
  });

  it("applies the attention filter and paginates", async () => {
    const attention = await list({ attention: "1" });
    expect(attention.rows.map((r) => r.id)).toEqual(expect.arrayContaining([ids.U1, ids.U2, ids.U3, ids.F1, ids.P1]));
    expect(attention.rows.map((r) => r.id)).not.toContain(ids.P2);

    const page1 = await list({ size: "10", page: "1", sort: "reference", dir: "asc" });
    expect(page1.pageSize).toBe(10);
    expect(page1.total).toBe(9);
    expect(page1.pageCount).toBe(1);
  });

  it("refuses roles without order:view", async () => {
    const driver: Actor = asDriver(drvA);
    await expect(listOrders(db, driver, parseOrderFilters({}), ctx)).rejects.toThrow(/permission/);
  });
});

describe("board", () => {
  it("shows today's work and open orders but not yesterday's deliveries", async () => {
    const board = await getBoard(db, dispatcher, parseOrderFilters({}), ctx);
    const boardIds = board.orders.map((o) => o.id);
    expect(boardIds).toEqual(expect.arrayContaining([ids.U1, ids.P1, ids.D1, ids.D2, ids.F1]));
    expect(boardIds).not.toContain(ids.Y1);
  });
});

describe("reports", () => {
  const filters = (params: Record<string, string> = {}) => withReportDefaults(parseOrderFilters(params), TZ, now);

  it("defaults to the last 7 days and agrees with its own rows", async () => {
    const f = filters();
    expect(f.to).toBe(now.toISOString().slice(0, 10));
    const summary = await getReportSummary(db, manager, f, ctx);
    const rows = await queryReportRows(db, manager, f, ctx, { limit: 1000, offset: 0 });

    expect(summary.total).toBe(rows.length);
    expect(summary.delivered).toBe(rows.filter((r) => r.status === "delivered").length);
    expect(summary.onTime).toBe(rows.filter((r) => r.onTime === true).length);
    expect(summary.notCompleted).toBe(rows.filter((r) => r.status === "failed" || r.status === "cancelled").length);
    expect(summary.perDay.reduce((n, d) => n + d.delivered + d.other, 0)).toBe(summary.total);
    expect(summary.byDriver.reduce((n, d) => n + d.delivered, 0)).toBe(summary.delivered);
  });

  it("filters by driver and status, and the CSV carries exactly those rows", async () => {
    const f = filters({ driver: drvA.driver.id, status: "delivered" });
    const rows = await queryReportRows(db, manager, f, ctx, { limit: 1000, offset: 0 });
    expect(rows.map((r) => r.id).sort()).toEqual([ids.D1, ids.Y1].sort());

    const csv = toCsv(reportCsvColumns(TZ), rows);
    const lines = csv.trim().split("\r\n");
    expect(lines).toHaveLength(rows.length + 1);
    expect(lines[0]).toContain("Order,Delivery date");
    expect(lines.slice(1).every((l) => l.includes("Delivered"))).toBe(true);
    expect(lines.slice(1).every((l) => l.includes(drvA.user.name))).toBe(true);
  });

  it("is limited to roles that may view reports", async () => {
    await expect(getReportSummary(db, dispatcher, filters(), ctx)).rejects.toThrow(/permission/);
    await expect(queryReportRows(db, dispatcher, filters(), ctx, { limit: 10, offset: 0 })).rejects.toThrow(/permission/);
  });
});
