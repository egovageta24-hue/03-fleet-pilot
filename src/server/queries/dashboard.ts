import "server-only";
import { and, count, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { schema, type Db } from "@/db";
import { dayRangeInTz } from "@/lib/dates";
import type { OrderPriority, OrderStatus } from "@/lib/domain";
import { attentionReasons, attentionScore, type AttentionReason } from "@/lib/orders/attention";
import type { Actor } from "@/lib/permissions";
import { parseOrderFilters } from "@/lib/validation/filters";
import { getDriverSummaries, type DriverSummary } from "./drivers";
import { listOrders, type OrderListRow, type QueryCtx } from "./orders";

const { orders, addresses, areas, exceptions, customers } = schema;

export type DashboardKpis = {
  /** Orders waiting for a driver right now. */
  unassigned: number;
  failed: number;
  /** Orders currently with a driver: assigned, picked up or out for delivery. */
  active: number;
  deliveredToday: number;
  /** Orders created today, plus anything still open. */
  todayTotal: number;
  /** Open exceptions (rows) and the orders carrying them. */
  openExceptions: number;
  exceptionOrders: number;
  overdue: number;
  atRisk: number;
  /** Share of today's deliveries that arrived inside their window (null until there is one). */
  onTimeRate: number | null;
  /** Mean minutes from creation to first assignment, for orders assigned today. */
  avgAssignMinutes: number | null;
};

export type AttentionItem = {
  order: OrderListRow;
  reasons: AttentionReason[];
  score: number;
};

export type MapOrder = {
  id: string;
  reference: string;
  status: OrderStatus;
  priority: OrderPriority;
  customerName: string;
  windowEnd: Date;
  mapX: number;
  mapY: number;
  areaId: string;
};

export type MapArea = {
  id: string;
  code: string;
  name: string;
  mapX: number;
  mapY: number;
  mapW: number;
  mapH: number;
  openOrders: number;
  unassigned: number;
};

export type DashboardData = {
  asOf: Date;
  tz: string;
  kpis: DashboardKpis;
  /** Most urgent first, capped. `attentionTotal` is the uncapped count. */
  attention: AttentionItem[];
  attentionTotal: number;
  hourly: { hour: number; created: number; delivered: number }[];
  statusMix: { status: OrderStatus; count: number }[];
  drivers: DriverSummary[];
  map: { areas: MapArea[]; orders: MapOrder[] };
};

const OPEN: OrderStatus[] = ["unassigned", "assigned", "picked_up", "out_for_delivery", "failed"];

export async function getDashboard(
  db: Db,
  actor: Actor,
  ctx: QueryCtx & { operatingStart: string; operatingEnd: string },
): Promise<DashboardData> {
  const today = dayRangeInTz(ctx.now, ctx.tz);
  const iso = (d: Date) => sql`${d.toISOString()}::timestamptz`;
  const start = iso(today.start);
  const end = iso(today.end);
  const nowSql = iso(ctx.now);
  const horizon = iso(new Date(ctx.now.getTime() + ctx.atRiskMinutes * 60_000));
  const deliveredToday = sql`${orders.deliveredAt} >= ${start} and ${orders.deliveredAt} < ${end}`;
  const inProgress = sql`${orders.status} in ('assigned','picked_up','out_for_delivery')`;
  const hourOf = (col: typeof orders.createdAt) => sql<number>`extract(hour from ${col} at time zone ${ctx.tz})::int`;

  const attentionFilters = { ...parseOrderFilters({}), attention: true, sort: "window" as const, dir: "asc" as const, page: 1, size: 100 };

  const [[agg], [{ openExceptions }], statusRows, createdRows, deliveredRows, attentionList, drivers, mapOrderRows, areaRows] =
    await Promise.all([
      db
        .select({
          unassigned: sql<number>`count(*) filter (where ${orders.status} = 'unassigned')::int`,
          failed: sql<number>`count(*) filter (where ${orders.status} = 'failed')::int`,
          active: sql<number>`count(*) filter (where ${inProgress})::int`,
          deliveredToday: sql<number>`count(*) filter (where ${deliveredToday})::int`,
          onTimeToday: sql<number>`count(*) filter (where ${deliveredToday} and ${orders.deliveredAt} <= ${orders.windowEnd})::int`,
          todayTotal: sql<number>`count(*) filter (where ${orders.createdAt} >= ${start} or ${orders.status} in ('unassigned','assigned','picked_up','out_for_delivery','failed') or (${deliveredToday}))::int`,
          exceptionOrders: sql<number>`count(*) filter (where ${orders.openExceptions} > 0)::int`,
          overdue: sql<number>`count(*) filter (where ${orders.status} in ('unassigned','assigned','picked_up','out_for_delivery') and ${orders.windowEnd} < ${nowSql})::int`,
          // Same definition as orderTiming(): any open order (unassigned included) whose window ends soon.
          atRisk: sql<number>`count(*) filter (where ${orders.status} in ('unassigned','assigned','picked_up','out_for_delivery') and ${orders.windowEnd} >= ${nowSql} and ${orders.windowEnd} <= ${horizon})::int`,
          avgAssign: sql<number | null>`(avg(extract(epoch from (${orders.firstAssignedAt} - ${orders.createdAt})) / 60) filter (where ${orders.firstAssignedAt} >= ${start} and ${orders.firstAssignedAt} < ${end}))::float8`,
        })
        .from(orders),
      db.select({ openExceptions: count() }).from(exceptions).where(eq(exceptions.status, "open")),
      db
        .select({ status: orders.status, n: sql<number>`count(*)::int` })
        .from(orders)
        .where(
          sql`${orders.createdAt} >= ${start} or ${orders.status} in ('unassigned','assigned','picked_up','out_for_delivery','failed') or (${deliveredToday})`,
        )
        .groupBy(orders.status),
      db
        .select({ h: hourOf(orders.createdAt), n: sql<number>`count(*)::int` })
        .from(orders)
        .where(and(gte(orders.createdAt, today.start), lt(orders.createdAt, today.end)))
        .groupBy(sql`1`),
      db
        .select({ h: hourOf(orders.deliveredAt as never), n: sql<number>`count(*)::int` })
        .from(orders)
        .where(and(gte(orders.deliveredAt, today.start), lt(orders.deliveredAt, today.end)))
        .groupBy(sql`1`),
      listOrders(db, actor, attentionFilters, ctx),
      getDriverSummaries(db, today, ctx.now),
      db
        .select({
          id: orders.id,
          reference: orders.reference,
          status: orders.status,
          priority: orders.priority,
          customerName: customers.name,
          windowEnd: orders.windowEnd,
          mapX: addresses.mapX,
          mapY: addresses.mapY,
          areaId: orders.deliveryAreaId,
        })
        .from(orders)
        .innerJoin(addresses, eq(addresses.id, orders.deliveryAddressId))
        .innerJoin(customers, eq(customers.id, orders.customerId))
        .where(inArray(orders.status, OPEN)),
      db.select().from(areas),
    ]);

  const attentionAll: AttentionItem[] = attentionList.rows
    .map((order) => ({
      order,
      reasons: attentionReasons(order, ctx.now, ctx.atRiskMinutes),
      score: attentionScore(order, ctx.now, ctx.atRiskMinutes),
    }))
    .filter((a) => a.reasons.length > 0)
    .sort((a, b) => b.score - a.score);

  // Hourly buckets over operating hours, widened to include any hour that has data.
  const createdByHour = new Map(createdRows.map((r) => [r.h, r.n]));
  const deliveredByHour = new Map(deliveredRows.map((r) => [r.h, r.n]));
  const dataHours = [...createdByHour.keys(), ...deliveredByHour.keys()];
  const first = Math.min(parseInt(ctx.operatingStart, 10), ...dataHours);
  const last = Math.max(parseInt(ctx.operatingEnd, 10), ...dataHours);
  const hourly = Array.from({ length: last - first + 1 }, (_, i) => {
    const hour = first + i;
    return { hour, created: createdByHour.get(hour) ?? 0, delivered: deliveredByHour.get(hour) ?? 0 };
  });

  const statusCount = new Map(statusRows.map((r) => [r.status, r.n]));
  const statusMix = (["unassigned", "assigned", "picked_up", "out_for_delivery", "delivered", "failed", "cancelled"] as OrderStatus[])
    .map((status) => ({ status, count: statusCount.get(status) ?? 0 }))
    .filter((s) => s.count > 0);

  const openByArea = new Map<string, { open: number; unassigned: number }>();
  for (const o of mapOrderRows) {
    const a = openByArea.get(o.areaId) ?? { open: 0, unassigned: 0 };
    a.open += 1;
    if (o.status === "unassigned") a.unassigned += 1;
    openByArea.set(o.areaId, a);
  }

  const onTimeRate = agg.deliveredToday > 0 ? agg.onTimeToday / agg.deliveredToday : null;

  return {
    asOf: ctx.now,
    tz: ctx.tz,
    kpis: {
      unassigned: agg.unassigned,
      failed: agg.failed,
      active: agg.active,
      deliveredToday: agg.deliveredToday,
      todayTotal: agg.todayTotal,
      openExceptions,
      exceptionOrders: agg.exceptionOrders,
      overdue: agg.overdue,
      atRisk: agg.atRisk,
      onTimeRate,
      avgAssignMinutes: agg.avgAssign,
    },
    attention: attentionAll.slice(0, 10),
    attentionTotal: attentionAll.length,
    hourly,
    statusMix,
    drivers,
    map: {
      areas: areaRows.map((a) => ({
        id: a.id,
        code: a.code,
        name: a.name,
        mapX: a.mapX,
        mapY: a.mapY,
        mapW: a.mapW,
        mapH: a.mapH,
        openOrders: openByArea.get(a.id)?.open ?? 0,
        unassigned: openByArea.get(a.id)?.unassigned ?? 0,
      })),
      orders: mapOrderRows,
    },
  };
}
