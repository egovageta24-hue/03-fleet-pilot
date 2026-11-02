import "server-only";
import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import { schema, type Db } from "@/db";
import { dayRangeInTz, isoDateInTz } from "@/lib/dates";
import type { OrderPriority, OrderStatus } from "@/lib/domain";
import { assertCan, type Actor } from "@/lib/permissions";
import type { OrderFilters } from "@/lib/validation/filters";
import { driverUser, orderConditions, type QueryCtx } from "./orders";

const { orders, customers, addresses, areas, drivers, vehicles } = schema;

/** Hard ceiling for one export, to keep a single request bounded. */
export const EXPORT_ROW_LIMIT = 50_000;

/** Reports default to the last 7 days (today included) when no date range is chosen. */
export function withReportDefaults(f: OrderFilters, tz: string, now: Date): OrderFilters {
  if (f.from || f.to) return f;
  return {
    ...f,
    from: isoDateInTz(dayRangeInTz(now, tz, -6).start, tz),
    to: isoDateInTz(now, tz),
  };
}

export type ReportRow = {
  id: string;
  reference: string;
  /** Local delivery date (the day the delivery window ends), YYYY-MM-DD. */
  deliveryDate: string;
  windowStart: Date;
  windowEnd: Date;
  status: OrderStatus;
  priority: OrderPriority;
  merchantName: string;
  customerName: string;
  addressLine: string;
  postcode: string;
  areaName: string;
  driverName: string | null;
  vehiclePlate: string | null;
  createdAt: Date;
  firstAssignedAt: Date | null;
  pickedUpAt: Date | null;
  deliveredAt: Date | null;
  openExceptions: number;
  /** Delivered inside its window? null until delivered. */
  onTime: boolean | null;
  assignMinutes: number | null;
  deliveryMinutes: number | null;
};

const minutesBetween = (a: Date | null, b: Date | null) => (a && b ? Math.max(0, (b.getTime() - a.getTime()) / 60_000) : null);

/** Rows for the Reports table (paginated) and the CSV export (all rows, up to the limit). */
export async function queryReportRows(
  db: Db,
  actor: Actor,
  f: OrderFilters,
  ctx: QueryCtx,
  page: { limit: number; offset: number },
): Promise<ReportRow[]> {
  assertCan(actor, "report:view");
  const rows = await db
    .select({
      id: orders.id,
      reference: orders.reference,
      windowStart: orders.windowStart,
      windowEnd: orders.windowEnd,
      status: orders.status,
      priority: orders.priority,
      merchantName: orders.merchantName,
      customerName: customers.name,
      addressLine: addresses.line1,
      postcode: addresses.postcode,
      areaName: areas.name,
      driverName: driverUser.name,
      vehiclePlate: vehicles.plate,
      createdAt: orders.createdAt,
      firstAssignedAt: orders.firstAssignedAt,
      pickedUpAt: orders.pickedUpAt,
      deliveredAt: orders.deliveredAt,
      openExceptions: orders.openExceptions,
    })
    .from(orders)
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .innerJoin(addresses, eq(addresses.id, orders.deliveryAddressId))
    .innerJoin(areas, eq(areas.id, orders.deliveryAreaId))
    .leftJoin(drivers, eq(drivers.id, orders.driverId))
    .leftJoin(driverUser, eq(driverUser.id, drivers.userId))
    .leftJoin(vehicles, eq(vehicles.id, drivers.vehicleId))
    .where(and(...orderConditions(f, ctx)))
    .orderBy(desc(orders.windowEnd), asc(orders.id))
    .limit(page.limit)
    .offset(page.offset);

  return rows.map((r) => ({
    ...r,
    deliveryDate: isoDateInTz(r.windowEnd, ctx.tz),
    onTime: r.deliveredAt ? r.deliveredAt <= r.windowEnd : null,
    assignMinutes: minutesBetween(r.createdAt, r.firstAssignedAt),
    deliveryMinutes: minutesBetween(r.pickedUpAt, r.deliveredAt),
  }));
}

export type ReportSummary = {
  total: number;
  delivered: number;
  /** Failed or cancelled. */
  notCompleted: number;
  /** Everything else: still in progress. */
  open: number;
  onTime: number;
  onTimeRate: number | null;
  avgAssignMinutes: number | null;
  avgDeliveryMinutes: number | null;
  perDay: { date: string; delivered: number; other: number }[];
  byDriver: { driverId: string; name: string; delivered: number; onTime: number; onTimeRate: number }[];
  statusMix: { status: OrderStatus; count: number }[];
};

export async function getReportSummary(db: Db, actor: Actor, f: OrderFilters, ctx: QueryCtx): Promise<ReportSummary> {
  assertCan(actor, "report:view");
  const where = and(...orderConditions(f, ctx));
  const dayExpr = sql<string>`to_char(${orders.windowEnd} at time zone ${ctx.tz}, 'YYYY-MM-DD')`;

  // Every query needs the same joins because the filters can reference customer, address and driver.
  const [[agg], perDayRows, byDriverRows, statusRows] = await Promise.all([
    db
      .select({
        total: count(),
        delivered: sql<number>`count(*) filter (where ${orders.status} = 'delivered')::int`,
        notCompleted: sql<number>`count(*) filter (where ${orders.status} in ('failed','cancelled'))::int`,
        onTime: sql<number>`count(*) filter (where ${orders.status} = 'delivered' and ${orders.deliveredAt} <= ${orders.windowEnd})::int`,
        avgAssign: sql<number | null>`(avg(extract(epoch from (${orders.firstAssignedAt} - ${orders.createdAt})) / 60))::float8`,
        avgDelivery: sql<number | null>`(avg(extract(epoch from (${orders.deliveredAt} - ${orders.pickedUpAt})) / 60) filter (where ${orders.status} = 'delivered'))::float8`,
      })
      .from(orders)
      .innerJoin(customers, eq(customers.id, orders.customerId))
      .innerJoin(addresses, eq(addresses.id, orders.deliveryAddressId))
      .leftJoin(drivers, eq(drivers.id, orders.driverId))
      .leftJoin(driverUser, eq(driverUser.id, drivers.userId))
      .where(where),
    db
      .select({
        date: dayExpr,
        delivered: sql<number>`count(*) filter (where ${orders.status} = 'delivered')::int`,
        other: sql<number>`count(*) filter (where ${orders.status} <> 'delivered')::int`,
      })
      .from(orders)
      .innerJoin(customers, eq(customers.id, orders.customerId))
      .innerJoin(addresses, eq(addresses.id, orders.deliveryAddressId))
      .leftJoin(drivers, eq(drivers.id, orders.driverId))
      .leftJoin(driverUser, eq(driverUser.id, drivers.userId))
      .where(where)
      .groupBy(sql`1`)
      .orderBy(sql`1`),
    db
      .select({
        driverId: drivers.id,
        name: driverUser.name,
        delivered: sql<number>`count(*)::int`,
        onTime: sql<number>`count(*) filter (where ${orders.deliveredAt} <= ${orders.windowEnd})::int`,
      })
      .from(orders)
      .innerJoin(customers, eq(customers.id, orders.customerId))
      .innerJoin(addresses, eq(addresses.id, orders.deliveryAddressId))
      .innerJoin(drivers, eq(drivers.id, orders.driverId))
      .innerJoin(driverUser, eq(driverUser.id, drivers.userId))
      .where(and(where, eq(orders.status, "delivered")))
      .groupBy(drivers.id, driverUser.name)
      .orderBy(desc(sql`count(*)`), asc(driverUser.name))
      .limit(20),
    db
      .select({ status: orders.status, n: sql<number>`count(*)::int` })
      .from(orders)
      .innerJoin(customers, eq(customers.id, orders.customerId))
      .innerJoin(addresses, eq(addresses.id, orders.deliveryAddressId))
      .leftJoin(drivers, eq(drivers.id, orders.driverId))
      .leftJoin(driverUser, eq(driverUser.id, drivers.userId))
      .where(where)
      .groupBy(orders.status),
  ]);

  const order: OrderStatus[] = ["unassigned", "assigned", "picked_up", "out_for_delivery", "delivered", "failed", "cancelled"];
  const statusCount = new Map(statusRows.map((r) => [r.status, r.n]));

  return {
    total: agg.total,
    delivered: agg.delivered,
    notCompleted: agg.notCompleted,
    open: agg.total - agg.delivered - agg.notCompleted,
    onTime: agg.onTime,
    onTimeRate: agg.delivered > 0 ? agg.onTime / agg.delivered : null,
    avgAssignMinutes: agg.avgAssign,
    avgDeliveryMinutes: agg.avgDelivery,
    perDay: perDayRows,
    byDriver: byDriverRows.map((d) => ({ ...d, onTimeRate: d.delivered > 0 ? d.onTime / d.delivered : 0 })),
    statusMix: order.map((status) => ({ status, count: statusCount.get(status) ?? 0 })).filter((s) => s.count > 0),
  };
}
