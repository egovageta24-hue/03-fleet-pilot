import "server-only";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  isNull,
  lt,
  or,
  type SQL,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { schema, type Db } from "@/db";
import { dayRangeInTz, parseIsoDateInTz } from "@/lib/dates";
import type {
  AssignmentStatus,
  DeliveryEventType,
  DriverAvailability,
  ExceptionSeverity,
  ExceptionStatus,
  ExceptionType,
  OrderPriority,
  OrderStatus,
  VehicleType,
} from "@/lib/domain";
import { assertCan, type Actor } from "@/lib/permissions";
import type { OrderFilters } from "@/lib/validation/filters";

const { orders, customers, addresses, areas, drivers, users, vehicles, assignments, orderStatusHistory, deliveryEvents, exceptions } =
  schema;

/** Context needed to interpret "today" and "at risk". */
export type QueryCtx = { tz: string; now: Date; atRiskMinutes: number };

/** Escape LIKE wildcards in user input. */
export const likePattern = (s: string) => `%${s.replace(/[\\%_]/g, "\\$&")}%`;

/**
 * Orders that need a human right now: unassigned or failed, carrying an open exception, or
 * in progress with a delivery window that ends within the at-risk threshold (or already passed).
 */
export function attentionCondition(ctx: QueryCtx): SQL {
  const horizon = new Date(ctx.now.getTime() + ctx.atRiskMinutes * 60_000);
  return or(
    inArray(orders.status, ["unassigned", "failed"]),
    gt(orders.openExceptions, 0),
    and(inArray(orders.status, ["assigned", "picked_up", "out_for_delivery"]), lt(orders.windowEnd, horizon)),
  )!;
}

export const driverUser = alias(users, "driver_user");

/** WHERE conditions shared by the Orders table, Board and Reports. Requires the standard joins. */
export function orderConditions(f: OrderFilters, ctx: QueryCtx): SQL[] {
  const c: (SQL | undefined)[] = [];

  if (f.q) {
    const p = likePattern(f.q);
    c.push(
      or(
        ilike(orders.reference, p),
        ilike(customers.name, p),
        ilike(orders.merchantName, p),
        ilike(driverUser.name, p),
        ilike(addresses.line1, p),
        ilike(addresses.postcode, p),
      ),
    );
  }
  if (f.status?.length) c.push(inArray(orders.status, f.status));
  if (f.priority?.length) c.push(inArray(orders.priority, f.priority));
  if (f.area?.length) c.push(inArray(orders.deliveryAreaId, f.area));
  if (f.driver?.length) {
    const ids = f.driver.filter((d) => d !== "none");
    c.push(or(ids.length ? inArray(orders.driverId, ids) : undefined, f.driver.includes("none") ? isNull(orders.driverId) : undefined));
  }
  if (f.from) c.push(gte(orders.windowEnd, parseIsoDateInTz(f.from, ctx.tz)));
  if (f.to) c.push(lt(orders.windowEnd, dayRangeInTz(parseIsoDateInTz(f.to, ctx.tz), ctx.tz).end));
  if (f.attention) c.push(attentionCondition(ctx));

  return c.filter((x): x is SQL => x !== undefined);
}

const SORT_COLUMNS = {
  created: orders.createdAt,
  window: orders.windowEnd,
  status: orders.status,
  priority: orders.priority,
  reference: orders.reference,
  updated: orders.updatedAt,
} as const;

export type OrderListRow = {
  id: string;
  reference: string;
  status: OrderStatus;
  priority: OrderPriority;
  merchantName: string;
  customerName: string;
  customerPhone: string | null;
  addressLine: string;
  postcode: string;
  areaId: string;
  areaCode: string;
  areaName: string;
  driverId: string | null;
  driverName: string | null;
  windowStart: Date;
  windowEnd: Date;
  openExceptions: number;
  packages: number;
  createdAt: Date;
  updatedAt: Date;
};

export type OrderList = { rows: OrderListRow[]; total: number; page: number; pageSize: number; pageCount: number };

/**
 * Staff-facing order table: filtered, sorted and paginated in SQL.
 * `extraWhere` lets other views (the delivery board) add their own scope on top of the filters.
 */
export async function listOrders(
  db: Db,
  actor: Actor,
  f: OrderFilters,
  ctx: QueryCtx,
  opts: { extraWhere?: SQL } = {},
): Promise<OrderList> {
  assertCan(actor, "order:view");
  const where = and(...orderConditions(f, ctx), opts.extraWhere);
  const sortCol = SORT_COLUMNS[f.sort];
  const dir = f.dir === "asc" ? asc : desc;

  const rowsQuery = db
    .select({
      id: orders.id,
      reference: orders.reference,
      status: orders.status,
      priority: orders.priority,
      merchantName: orders.merchantName,
      customerName: customers.name,
      customerPhone: customers.phone,
      addressLine: addresses.line1,
      postcode: addresses.postcode,
      areaId: areas.id,
      areaCode: areas.code,
      areaName: areas.name,
      driverId: orders.driverId,
      driverName: driverUser.name,
      windowStart: orders.windowStart,
      windowEnd: orders.windowEnd,
      openExceptions: orders.openExceptions,
      packages: orders.packages,
      createdAt: orders.createdAt,
      updatedAt: orders.updatedAt,
    })
    .from(orders)
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .innerJoin(addresses, eq(addresses.id, orders.deliveryAddressId))
    .innerJoin(areas, eq(areas.id, orders.deliveryAreaId))
    .leftJoin(drivers, eq(drivers.id, orders.driverId))
    .leftJoin(driverUser, eq(driverUser.id, drivers.userId))
    .where(where)
    .orderBy(dir(sortCol), asc(orders.windowEnd), asc(orders.id))
    .limit(f.size)
    .offset((f.page - 1) * f.size);

  const countQuery = db
    .select({ n: count() })
    .from(orders)
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .innerJoin(addresses, eq(addresses.id, orders.deliveryAddressId))
    .leftJoin(drivers, eq(drivers.id, orders.driverId))
    .leftJoin(driverUser, eq(driverUser.id, drivers.userId))
    .where(where);

  const [rows, [{ n }]] = await Promise.all([rowsQuery, countQuery]);
  return { rows, total: n, page: f.page, pageSize: f.size, pageCount: Math.max(1, Math.ceil(n / f.size)) };
}

// ---------------------------------------------------------------------------------------
// Order detail
// ---------------------------------------------------------------------------------------

export type AddressView = {
  id: string;
  line1: string;
  line2: string | null;
  city: string;
  postcode: string;
  label: string | null;
  areaId: string;
  areaCode: string;
  areaName: string;
  mapX: number;
  mapY: number;
};

export type OrderDetail = {
  order: {
    id: string;
    reference: string;
    status: OrderStatus;
    priority: OrderPriority;
    merchantName: string;
    packages: number;
    weightKg: number;
    notes: string | null;
    windowStart: Date;
    windowEnd: Date;
    driverId: string | null;
    openExceptions: number;
    createdAt: Date;
    updatedAt: Date;
    firstAssignedAt: Date | null;
    pickedUpAt: Date | null;
    deliveredAt: Date | null;
    createdByName: string | null;
  };
  customer: { id: string; name: string; email: string | null; phone: string | null };
  pickup: AddressView;
  delivery: AddressView;
  driver: {
    id: string;
    name: string;
    phone: string;
    availability: DriverAvailability;
    vehicle: { plate: string; type: VehicleType; make: string; model: string } | null;
  } | null;
  assignments: {
    id: string;
    driverId: string;
    driverName: string;
    sequence: number;
    status: AssignmentStatus;
    reason: string | null;
    assignedByName: string | null;
    assignedAt: Date;
    endedAt: Date | null;
  }[];
  history: { id: number; from: OrderStatus | null; to: OrderStatus; note: string | null; byName: string | null; at: Date }[];
  events: {
    id: number;
    type: DeliveryEventType;
    byName: string | null;
    driverName: string | null;
    payload: Record<string, unknown>;
    at: Date;
  }[];
  exceptions: {
    id: string;
    type: ExceptionType;
    severity: ExceptionSeverity;
    status: ExceptionStatus;
    description: string | null;
    raisedByName: string | null;
    raisedAt: Date;
    resolvedByName: string | null;
    resolvedAt: Date | null;
    resolutionNote: string | null;
  }[];
};

/**
 * Everything the order page shows. Drivers only ever see orders currently assigned to them
 * (anything else is reported as not found, so existence is not leaked).
 */
export async function getOrderDetail(db: Db, actor: Actor, orderId: string): Promise<OrderDetail | null> {
  if (actor.role === "driver") assertCan(actor, "order:view_own");
  else assertCan(actor, "order:view");

  const pickupAddr = alias(addresses, "pickup_addr");
  const pickupArea = alias(areas, "pickup_area");
  const creator = alias(users, "creator");

  const [o] = await db
    .select({
      order: orders,
      customer: customers,
      delivery: addresses,
      deliveryArea: areas,
      pickup: pickupAddr,
      pickupArea,
      creatorName: creator.name,
      driver: drivers,
      driverName: driverUser.name,
      vehicle: vehicles,
    })
    .from(orders)
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .innerJoin(addresses, eq(addresses.id, orders.deliveryAddressId))
    .innerJoin(areas, eq(areas.id, addresses.areaId))
    .innerJoin(pickupAddr, eq(pickupAddr.id, orders.pickupAddressId))
    .innerJoin(pickupArea, eq(pickupArea.id, pickupAddr.areaId))
    .leftJoin(creator, eq(creator.id, orders.createdBy))
    .leftJoin(drivers, eq(drivers.id, orders.driverId))
    .leftJoin(driverUser, eq(driverUser.id, drivers.userId))
    .leftJoin(vehicles, eq(vehicles.id, drivers.vehicleId))
    .where(eq(orders.id, orderId));

  if (!o) return null;
  if (actor.role === "driver" && (!actor.driverId || o.order.driverId !== actor.driverId)) return null;

  const assigner = alias(users, "assigner");
  const histActor = alias(users, "hist_actor");
  const evActor = alias(users, "ev_actor");
  const evDriver = alias(drivers, "ev_driver");
  const evDriverUser = alias(users, "ev_driver_user");
  const raiser = alias(users, "raiser");
  const resolver = alias(users, "resolver");
  const assignedDriverUser = alias(users, "assigned_driver_user");
  const assignedDriver = alias(drivers, "assigned_driver");

  const [assignmentRows, historyRows, eventRows, exceptionRows] = await Promise.all([
    db
      .select({ a: assignments, driverName: assignedDriverUser.name, byName: assigner.name })
      .from(assignments)
      .innerJoin(assignedDriver, eq(assignedDriver.id, assignments.driverId))
      .innerJoin(assignedDriverUser, eq(assignedDriverUser.id, assignedDriver.userId))
      .leftJoin(assigner, eq(assigner.id, assignments.assignedBy))
      .where(eq(assignments.orderId, orderId))
      .orderBy(asc(assignments.assignedAt), asc(assignments.sequence)),
    db
      .select({ h: orderStatusHistory, byName: histActor.name })
      .from(orderStatusHistory)
      .leftJoin(histActor, eq(histActor.id, orderStatusHistory.changedBy))
      .where(eq(orderStatusHistory.orderId, orderId))
      .orderBy(asc(orderStatusHistory.id)),
    db
      .select({ e: deliveryEvents, byName: evActor.name, driverName: evDriverUser.name })
      .from(deliveryEvents)
      .leftJoin(evActor, eq(evActor.id, deliveryEvents.actorUserId))
      .leftJoin(evDriver, eq(evDriver.id, deliveryEvents.driverId))
      .leftJoin(evDriverUser, eq(evDriverUser.id, evDriver.userId))
      .where(eq(deliveryEvents.orderId, orderId))
      .orderBy(asc(deliveryEvents.id)),
    db
      .select({ x: exceptions, raisedByName: raiser.name, resolvedByName: resolver.name })
      .from(exceptions)
      .leftJoin(raiser, eq(raiser.id, exceptions.raisedBy))
      .leftJoin(resolver, eq(resolver.id, exceptions.resolvedBy))
      .where(eq(exceptions.orderId, orderId))
      .orderBy(desc(exceptions.raisedAt)),
  ]);

  const addr = (a: typeof addresses.$inferSelect, area: typeof areas.$inferSelect): AddressView => ({
    id: a.id,
    line1: a.line1,
    line2: a.line2,
    city: a.city,
    postcode: a.postcode,
    label: a.label,
    areaId: area.id,
    areaCode: area.code,
    areaName: area.name,
    mapX: a.mapX,
    mapY: a.mapY,
  });

  return {
    order: {
      id: o.order.id,
      reference: o.order.reference,
      status: o.order.status,
      priority: o.order.priority,
      merchantName: o.order.merchantName,
      packages: o.order.packages,
      weightKg: o.order.weightKg,
      notes: o.order.notes,
      windowStart: o.order.windowStart,
      windowEnd: o.order.windowEnd,
      driverId: o.order.driverId,
      openExceptions: o.order.openExceptions,
      createdAt: o.order.createdAt,
      updatedAt: o.order.updatedAt,
      firstAssignedAt: o.order.firstAssignedAt,
      pickedUpAt: o.order.pickedUpAt,
      deliveredAt: o.order.deliveredAt,
      createdByName: o.creatorName,
    },
    customer: { id: o.customer.id, name: o.customer.name, email: o.customer.email, phone: o.customer.phone },
    pickup: addr(o.pickup, o.pickupArea),
    delivery: addr(o.delivery, o.deliveryArea),
    driver:
      o.driver && o.driverName
        ? {
            id: o.driver.id,
            name: o.driverName,
            phone: o.driver.phone,
            availability: o.driver.availability,
            vehicle: o.vehicle
              ? { plate: o.vehicle.plate, type: o.vehicle.type, make: o.vehicle.make, model: o.vehicle.model }
              : null,
          }
        : null,
    assignments: assignmentRows.map(({ a, driverName, byName }) => ({
      id: a.id,
      driverId: a.driverId,
      driverName,
      sequence: a.sequence,
      status: a.status,
      reason: a.reason,
      assignedByName: byName,
      assignedAt: a.assignedAt,
      endedAt: a.endedAt,
    })),
    history: historyRows.map(({ h, byName }) => ({
      id: h.id,
      from: h.fromStatus,
      to: h.toStatus,
      note: h.note,
      byName,
      at: h.createdAt,
    })),
    events: eventRows.map(({ e, byName, driverName }) => ({
      id: e.id,
      type: e.type,
      byName,
      driverName,
      payload: e.payload,
      at: e.createdAt,
    })),
    exceptions: exceptionRows.map(({ x, raisedByName, resolvedByName }) => ({
      id: x.id,
      type: x.type,
      severity: x.severity,
      status: x.status,
      description: x.description,
      raisedByName,
      raisedAt: x.raisedAt,
      resolvedByName,
      resolvedAt: x.resolvedAt,
      resolutionNote: x.resolutionNote,
    })),
  };
}
