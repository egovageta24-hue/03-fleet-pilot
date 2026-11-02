import "server-only";
import { and, asc, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { schema, type Db } from "@/db";
import { dayRangeInTz, isoDateInTz } from "@/lib/dates";
import type { DriverAvailability, OrderPriority, OrderStatus, VehicleType } from "@/lib/domain";

const { drivers, users, vehicles, areas, orders, addresses } = schema;

/** Statuses in which a driver is still responsible for an order. */
export const HELD_STATUS_SQL = sql`('assigned','picked_up','out_for_delivery','failed')`;

export type AssignableDriver = {
  id: string;
  name: string;
  availability: DriverAvailability;
  vehicleType: VehicleType | null;
  vehiclePlate: string | null;
  homeAreaId: string | null;
  homeAreaCode: string | null;
  /** Orders currently held (assigned / picked up / out for delivery / failed). */
  activeCount: number;
  /** Why this driver cannot take work right now, or null if they can. */
  blockedReason: string | null;
};

/** Every driver with what the assign dialog needs: load, availability and whether they can be assigned. */
export async function listAssignableDrivers(db: Db): Promise<AssignableDriver[]> {
  const rows = await db
    .select({
      id: drivers.id,
      name: users.name,
      userActive: users.active,
      availability: drivers.availability,
      vehicleType: vehicles.type,
      vehiclePlate: vehicles.plate,
      vehicleStatus: vehicles.status,
      homeAreaId: drivers.homeAreaId,
      homeAreaCode: areas.code,
      activeCount: sql<number>`(select count(*)::int from ${orders} where ${orders.driverId} = ${drivers.id} and ${orders.status} in ${HELD_STATUS_SQL})`,
    })
    .from(drivers)
    .innerJoin(users, eq(users.id, drivers.userId))
    .leftJoin(vehicles, eq(vehicles.id, drivers.vehicleId))
    .leftJoin(areas, eq(areas.id, drivers.homeAreaId))
    .orderBy(asc(users.name));

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    availability: r.availability,
    vehicleType: r.vehicleType,
    vehiclePlate: r.vehiclePlate,
    homeAreaId: r.homeAreaId,
    homeAreaCode: r.homeAreaCode,
    activeCount: r.activeCount,
    blockedReason: !r.userActive
      ? "Account deactivated"
      : r.availability === "off_duty"
        ? "Off duty"
        : r.vehicleStatus && r.vehicleStatus !== "active"
          ? "Vehicle not in service"
          : null,
  }));
}

export type DriverState = "on_route" | "loaded" | "assigned" | "idle" | "on_break" | "off_duty";

export type DriverSummary = {
  id: string;
  userId: string;
  name: string;
  phone: string;
  availability: DriverAvailability;
  vehicle: { type: VehicleType; plate: string; make: string; model: string; status: string } | null;
  homeAreaId: string | null;
  homeAreaCode: string | null;
  homeAreaName: string | null;
  assigned: number;
  pickedUp: number;
  outForDelivery: number;
  failed: number;
  /** Orders currently held. */
  active: number;
  deliveredToday: number;
  /** Held orders whose delivery window has already passed. */
  overdue: number;
  /** Derived from the driver's orders + availability; never stored. */
  state: DriverState;
  /** First stop in the driver's run that is still to be delivered. */
  nextStop: {
    orderId: string;
    reference: string;
    status: OrderStatus;
    areaCode: string;
    windowEnd: Date;
    mapX: number;
    mapY: number;
  } | null;
};

export function deriveDriverState(
  availability: DriverAvailability,
  counts: { assigned: number; pickedUp: number; outForDelivery: number },
): DriverState {
  if (availability === "off_duty") return "off_duty";
  if (availability === "on_break") return "on_break";
  if (counts.outForDelivery > 0) return "on_route";
  if (counts.pickedUp > 0) return "loaded";
  if (counts.assigned > 0) return "assigned";
  return "idle";
}

/** Every driver with load, derived state and next stop. `todayStart/End` bound "delivered today". */
export async function getDriverSummaries(
  db: Db,
  range: { start: Date; end: Date },
  now: Date,
): Promise<DriverSummary[]> {
  const nextStopOrder = alias(orders, "next_stop_order");
  const nextStopAddr = alias(addresses, "next_stop_addr");
  const nextStopArea = alias(areas, "next_stop_area");
  const homeArea = alias(areas, "home_area");

  const [driverRows, heldRows, deliveredRows, stopRows] = await Promise.all([
    db
      .select({
        id: drivers.id,
        userId: drivers.userId,
        name: users.name,
        phone: drivers.phone,
        availability: drivers.availability,
        vehicleType: vehicles.type,
        vehiclePlate: vehicles.plate,
        vehicleMake: vehicles.make,
        vehicleModel: vehicles.model,
        vehicleStatus: vehicles.status,
        homeAreaId: drivers.homeAreaId,
        homeAreaCode: homeArea.code,
        homeAreaName: homeArea.name,
      })
      .from(drivers)
      .innerJoin(users, eq(users.id, drivers.userId))
      .leftJoin(vehicles, eq(vehicles.id, drivers.vehicleId))
      .leftJoin(homeArea, eq(homeArea.id, drivers.homeAreaId))
      .orderBy(asc(users.name)),
    db
      .select({
        driverId: orders.driverId,
        status: orders.status,
        n: sql<number>`count(*)::int`,
        overdue: sql<number>`count(*) filter (where ${orders.windowEnd} < ${now.toISOString()}::timestamptz and ${orders.status} <> 'failed')::int`,
      })
      .from(orders)
      .where(sql`${orders.status} in ${HELD_STATUS_SQL} and ${orders.driverId} is not null`)
      .groupBy(orders.driverId, orders.status),
    db
      .select({ driverId: orders.driverId, n: sql<number>`count(*)::int` })
      .from(orders)
      .where(
        and(
          eq(orders.status, "delivered"),
          gte(orders.deliveredAt, range.start),
          lt(orders.deliveredAt, range.end),
        ),
      )
      .groupBy(orders.driverId),
    db
      .select({
        driverId: schema.assignments.driverId,
        sequence: schema.assignments.sequence,
        orderId: nextStopOrder.id,
        reference: nextStopOrder.reference,
        status: nextStopOrder.status,
        windowEnd: nextStopOrder.windowEnd,
        areaCode: nextStopArea.code,
        mapX: nextStopAddr.mapX,
        mapY: nextStopAddr.mapY,
      })
      .from(schema.assignments)
      .innerJoin(nextStopOrder, eq(nextStopOrder.id, schema.assignments.orderId))
      .innerJoin(nextStopAddr, eq(nextStopAddr.id, nextStopOrder.deliveryAddressId))
      .innerJoin(nextStopArea, eq(nextStopArea.id, nextStopOrder.deliveryAreaId))
      .where(
        and(
          eq(schema.assignments.status, "active"),
          inArray(nextStopOrder.status, ["assigned", "picked_up", "out_for_delivery"]),
        ),
      )
      .orderBy(asc(schema.assignments.sequence)),
  ]);

  type Counts = { assigned: number; pickedUp: number; outForDelivery: number; failed: number; overdue: number };
  const counts = new Map<string, Counts>();
  for (const r of heldRows) {
    if (!r.driverId) continue;
    const c = counts.get(r.driverId) ?? { assigned: 0, pickedUp: 0, outForDelivery: 0, failed: 0, overdue: 0 };
    if (r.status === "assigned") c.assigned = r.n;
    if (r.status === "picked_up") c.pickedUp = r.n;
    if (r.status === "out_for_delivery") c.outForDelivery = r.n;
    if (r.status === "failed") c.failed = r.n;
    c.overdue += r.overdue;
    counts.set(r.driverId, c);
  }
  const delivered = new Map(deliveredRows.filter((r) => r.driverId).map((r) => [r.driverId as string, r.n]));
  const nextStops = new Map<string, DriverSummary["nextStop"]>();
  for (const s of stopRows) {
    if (!nextStops.has(s.driverId)) {
      nextStops.set(s.driverId, {
        orderId: s.orderId,
        reference: s.reference,
        status: s.status,
        areaCode: s.areaCode,
        windowEnd: s.windowEnd,
        mapX: s.mapX,
        mapY: s.mapY,
      });
    }
  }

  return driverRows.map((d) => {
    const c = counts.get(d.id) ?? { assigned: 0, pickedUp: 0, outForDelivery: 0, failed: 0, overdue: 0 };
    return {
      id: d.id,
      userId: d.userId,
      name: d.name,
      phone: d.phone,
      availability: d.availability,
      vehicle: d.vehicleType
        ? {
            type: d.vehicleType,
            plate: d.vehiclePlate!,
            make: d.vehicleMake!,
            model: d.vehicleModel!,
            status: d.vehicleStatus!,
          }
        : null,
      homeAreaId: d.homeAreaId,
      homeAreaCode: d.homeAreaCode,
      homeAreaName: d.homeAreaName,
      assigned: c.assigned,
      pickedUp: c.pickedUp,
      outForDelivery: c.outForDelivery,
      failed: c.failed,
      active: c.assigned + c.pickedUp + c.outForDelivery + c.failed,
      deliveredToday: delivered.get(d.id) ?? 0,
      overdue: c.overdue,
      state: deriveDriverState(d.availability, c),
      nextStop: nextStops.get(d.id) ?? null,
    };
  });
}

export type RunStop = {
  assignmentId: string;
  sequence: number;
  orderId: string;
  reference: string;
  status: OrderStatus;
  priority: OrderPriority;
  customerName: string;
  customerPhone: string | null;
  addressLine: string;
  postcode: string;
  areaCode: string;
  windowStart: Date;
  windowEnd: Date;
  openExceptions: number;
  notes: string | null;
};

export type DriverDetail = {
  summary: DriverSummary;
  /** Orders the driver currently holds, in stop order. */
  run: RunStop[];
  stats: {
    windowDays: number;
    delivered: number;
    onTime: number;
    onTimeRate: number | null;
    avgDeliveryMinutes: number | null;
    failedAttempts: number;
    exceptionsRaised: number;
    perDay: { date: string; delivered: number }[];
  };
  recent: {
    orderId: string;
    reference: string;
    status: OrderStatus;
    customerName: string;
    areaCode: string;
    windowEnd: Date;
    deliveredAt: Date | null;
    updatedAt: Date;
  }[];
};

const STATS_DAYS = 14;

export async function getDriverDetail(
  db: Db,
  driverId: string,
  ctx: { tz: string; now: Date },
): Promise<DriverDetail | null> {
  const today = dayRangeInTz(ctx.now, ctx.tz);
  const summaries = await getDriverSummaries(db, today, ctx.now);
  const summary = summaries.find((s) => s.id === driverId);
  if (!summary) return null;

  const since = dayRangeInTz(ctx.now, ctx.tz, -(STATS_DAYS - 1)).start;
  const dayExpr = sql<string>`to_char(${orders.deliveredAt} at time zone ${ctx.tz}, 'YYYY-MM-DD')`;

  const [run, [agg], perDayRows, [failed], [raised], recentRows] = await Promise.all([
    getDriverRun(db, driverId),
    db
      .select({
        delivered: sql<number>`count(*)::int`,
        onTime: sql<number>`count(*) filter (where ${orders.deliveredAt} <= ${orders.windowEnd})::int`,
        avgMinutes: sql<number | null>`(avg(extract(epoch from (${orders.deliveredAt} - ${orders.pickedUpAt})) / 60))::float8`,
      })
      .from(orders)
      .where(and(eq(orders.driverId, driverId), eq(orders.status, "delivered"), gte(orders.deliveredAt, since))),
    db
      .select({ date: dayExpr, n: sql<number>`count(*)::int` })
      .from(orders)
      .where(and(eq(orders.driverId, driverId), eq(orders.status, "delivered"), gte(orders.deliveredAt, since)))
      .groupBy(sql`1`),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.deliveryEvents)
      .where(and(eq(schema.deliveryEvents.driverId, driverId), eq(schema.deliveryEvents.type, "failed"), gte(schema.deliveryEvents.createdAt, since))),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.exceptions)
      .where(and(eq(schema.exceptions.raisedBy, summary.userId), gte(schema.exceptions.raisedAt, since))),
    db
      .select({
        orderId: orders.id,
        reference: orders.reference,
        status: orders.status,
        customerName: schema.customers.name,
        areaCode: areas.code,
        windowEnd: orders.windowEnd,
        deliveredAt: orders.deliveredAt,
        updatedAt: orders.updatedAt,
      })
      .from(orders)
      .innerJoin(schema.customers, eq(schema.customers.id, orders.customerId))
      .innerJoin(areas, eq(areas.id, orders.deliveryAreaId))
      .where(and(eq(orders.driverId, driverId), inArray(orders.status, ["delivered", "cancelled"])))
      .orderBy(desc(orders.updatedAt))
      .limit(10),
  ]);

  const perDayMap = new Map(perDayRows.map((r) => [r.date, r.n]));
  const perDay = Array.from({ length: STATS_DAYS }, (_, i) => {
    const date = isoDateInTz(dayRangeInTz(ctx.now, ctx.tz, -(STATS_DAYS - 1 - i)).start, ctx.tz);
    return { date, delivered: perDayMap.get(date) ?? 0 };
  });

  return {
    summary,
    run,
    stats: {
      windowDays: STATS_DAYS,
      delivered: agg.delivered,
      onTime: agg.onTime,
      onTimeRate: agg.delivered > 0 ? agg.onTime / agg.delivered : null,
      avgDeliveryMinutes: agg.avgMinutes,
      failedAttempts: failed.n,
      exceptionsRaised: raised.n,
      perDay,
    },
    recent: recentRows,
  };
}

/**
 * The orders a driver currently holds, in stop order (assigned, picked up, out for delivery, and
 * failed-awaiting-dispatch). Used by the driver detail view and the driver's own "My deliveries".
 */
export async function getDriverRun(db: Db, driverId: string): Promise<RunStop[]> {
  const rows = await db
    .select({
      assignmentId: schema.assignments.id,
      sequence: schema.assignments.sequence,
      order: orders,
      customerName: schema.customers.name,
      customerPhone: schema.customers.phone,
      addressLine: addresses.line1,
      postcode: addresses.postcode,
      areaCode: areas.code,
    })
    .from(schema.assignments)
    .innerJoin(orders, eq(orders.id, schema.assignments.orderId))
    .innerJoin(schema.customers, eq(schema.customers.id, orders.customerId))
    .innerJoin(addresses, eq(addresses.id, orders.deliveryAddressId))
    .innerJoin(areas, eq(areas.id, orders.deliveryAreaId))
    .where(
      and(
        eq(schema.assignments.driverId, driverId),
        eq(schema.assignments.status, "active"),
        sql`${orders.status} in ${HELD_STATUS_SQL}`,
      ),
    )
    .orderBy(asc(schema.assignments.sequence));

  return rows.map((r) => ({
    assignmentId: r.assignmentId,
    sequence: r.sequence,
    orderId: r.order.id,
    reference: r.order.reference,
    status: r.order.status,
    priority: r.order.priority,
    customerName: r.customerName,
    customerPhone: r.customerPhone,
    addressLine: r.addressLine,
    postcode: r.postcode,
    areaCode: r.areaCode,
    windowStart: r.order.windowStart,
    windowEnd: r.order.windowEnd,
    openExceptions: r.order.openExceptions,
    notes: r.order.notes,
  }));
}

/** Orders this driver delivered inside `range` (normally "today"), newest first. */
export async function getDeliveredInRange(db: Db, driverId: string, range: { start: Date; end: Date }) {
  return db
    .select({
      orderId: orders.id,
      reference: orders.reference,
      customerName: schema.customers.name,
      areaCode: areas.code,
      windowEnd: orders.windowEnd,
      deliveredAt: orders.deliveredAt,
    })
    .from(orders)
    .innerJoin(schema.customers, eq(schema.customers.id, orders.customerId))
    .innerJoin(areas, eq(areas.id, orders.deliveryAreaId))
    .where(
      and(
        eq(orders.driverId, driverId),
        eq(orders.status, "delivered"),
        gte(orders.deliveredAt, range.start),
        lt(orders.deliveredAt, range.end),
      ),
    )
    .orderBy(desc(orders.deliveredAt));
}

export type AreaOption = { id: string; code: string; name: string };

export async function listAreas(db: Db): Promise<AreaOption[]> {
  return db.select({ id: areas.id, code: areas.code, name: areas.name }).from(areas).orderBy(asc(areas.name));
}

export type PickupOption = { id: string; label: string };

/** Pickup (warehouse) addresses used when creating an order. */
export async function listPickupLocations(db: Db): Promise<PickupOption[]> {
  const rows = await db
    .select({ id: schema.addresses.id, label: schema.addresses.label, line1: schema.addresses.line1 })
    .from(schema.addresses)
    .where(sql`${schema.addresses.customerId} is null`)
    .orderBy(asc(schema.addresses.label));
  return rows.map((r) => ({ id: r.id, label: r.label ? `${r.label} — ${r.line1}` : r.line1 }));
}
