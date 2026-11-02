/**
 * Demo data for FleetPilot.  Usage:  npm run db:seed [-- --reset]
 *
 * Builds ~12 drivers, 8 areas and ~500 orders (a busy "today" plus 14 days of history).
 * Every order's status history, timeline events, assignments and exceptions are produced
 * by walking legal state-machine transitions, so the data is internally consistent.
 * Timestamps are relative to "now", so the dashboard is always populated.
 *
 * STOP the dev server first when using the embedded PGlite database: PGlite is
 * single-process and two processes must not open the same data directory.
 */
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { getEnv } from "@/env";
import { dayRangeInTz, systemTimezone, zonedParts } from "@/lib/dates";
import type {
  DeliveryEventType,
  DriverAvailability,
  ExceptionSeverity,
  ExceptionType,
  OrderPriority,
  OrderStatus,
  VehicleType,
} from "@/lib/domain";
import { pointInArea } from "@/lib/geo";
import { canTransition } from "@/lib/orders/state-machine";
import { DEFAULT_SETTINGS, SETTINGS_KEY } from "@/lib/validation/settings";
import { getDb, schema, type Db } from "./index";

// ---------------------------------------------------------------------------------------
// Deterministic randomness
// ---------------------------------------------------------------------------------------
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260101);
const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
const chance = (p: number) => rand() < p;
const letter = () => "ABCDEFGH"[int(0, 7)];
const postcode = () => `RV${int(1, 9)} ${int(1, 9)}${letter()}${letter()}`;
const MIN = 60_000;

// ---------------------------------------------------------------------------------------
// Static reference data
// ---------------------------------------------------------------------------------------
const AREAS = [
  { code: "NH", name: "North Hills", mapX: 4, mapY: 4, mapW: 28, mapH: 40 },
  { code: "HB", name: "Harbor District", mapX: 34, mapY: 4, mapW: 30, mapH: 20 },
  { code: "OT", name: "Old Town", mapX: 34, mapY: 26, mapW: 30, mapH: 18 },
  { code: "EG", name: "Eastgate", mapX: 66, mapY: 4, mapW: 30, mapH: 40 },
  { code: "WE", name: "West End", mapX: 4, mapY: 48, mapW: 28, mapH: 46 },
  { code: "MT", name: "Midtown", mapX: 34, mapY: 48, mapW: 30, mapH: 26 },
  { code: "SS", name: "Southside", mapX: 34, mapY: 76, mapW: 30, mapH: 18 },
  { code: "AP", name: "Airport Park", mapX: 66, mapY: 48, mapW: 30, mapH: 46 },
] as const;

const MERCHANTS = [
  { name: "Northwind Outfitters", area: "HB", street: "12 Dock Road" },
  { name: "Brightside Electronics", area: "MT", street: "88 Central Avenue" },
  { name: "Fernhill Home & Garden", area: "EG", street: "5 Nursery Lane" },
  { name: "Quill & Co Stationery", area: "OT", street: "31 Market Street" },
  { name: "Atlas Sports", area: "AP", street: "200 Terminal Way" },
  { name: "Verde Pantry", area: "WE", street: "9 Orchard Close" },
] as const;

const VEHICLE_SPECS: Record<VehicleType, { make: string; model: string; capacityKg: number }> = {
  bike: { make: "Urban Arrow", model: "Cargo Family", capacityKg: 40 },
  scooter: { make: "Vespa", model: "Primavera 150", capacityKg: 30 },
  car: { make: "Toyota", model: "Corolla Cargo", capacityKg: 350 },
  van: { make: "Ford", model: "Transit Connect", capacityKg: 900 },
  truck: { make: "Isuzu", model: "NPR 75", capacityKg: 2500 },
};

type DriverSeed = {
  name: string;
  vehicle: VehicleType;
  area: string;
  availability: DriverAvailability;
  vehicleInMaintenance?: boolean;
};
const DRIVERS: DriverSeed[] = [
  { name: "Sofia Alvarez", vehicle: "car", area: "NH", availability: "available" },
  { name: "Tom Brennan", vehicle: "van", area: "HB", availability: "available" },
  { name: "Aisha Khan", vehicle: "bike", area: "OT", availability: "available" },
  { name: "Liam O'Connor", vehicle: "scooter", area: "MT", availability: "available" },
  { name: "Mei Lin", vehicle: "van", area: "EG", availability: "available" },
  { name: "Diego Fernandez", vehicle: "car", area: "WE", availability: "available" },
  { name: "Hannah Schultz", vehicle: "truck", area: "AP", availability: "available" },
  { name: "Kwame Mensah", vehicle: "scooter", area: "SS", availability: "on_break" },
  { name: "Olivia Grant", vehicle: "bike", area: "OT", availability: "on_break" },
  { name: "Raj Patel", vehicle: "van", area: "HB", availability: "off_duty" },
  { name: "Chloe Dubois", vehicle: "car", area: "NH", availability: "off_duty" },
  { name: "Ben Carter", vehicle: "van", area: "EG", availability: "available", vehicleInMaintenance: true },
];

const STAFF = [
  { name: "Alex Morgan", email: "admin@fleetpilot.test", role: "admin" as const },
  { name: "Priya Nair", email: "priya@fleetpilot.test", role: "dispatcher" as const },
  { name: "Marcus Webb", email: "marcus@fleetpilot.test", role: "dispatcher" as const },
  { name: "Elena Rossi", email: "elena@fleetpilot.test", role: "manager" as const },
];

const FIRST = ["Jamie", "Taylor", "Morgan", "Casey", "Riley", "Jordan", "Avery", "Quinn", "Harper", "Rowan", "Sasha", "Noor", "Imani", "Mateo", "Lucas", "Zoe", "Ethan", "Nina", "Omar", "Leila", "Felix", "Greta", "Hugo", "Ivy", "Kenji", "Lena", "Mila", "Nico", "Owen", "Petra"];
const LAST = ["Walker", "Hughes", "Bennett", "Foster", "Reyes", "Nguyen", "Okafor", "Silva", "Kowalski", "Haddad", "Larsen", "Moreau", "Tanaka", "Ibrahim", "Fischer", "Costa", "Murphy", "Novak", "Ortiz", "Singh"];
const STREETS = ["Maple Street", "Cedar Avenue", "Harbor View", "Lakeside Drive", "Station Road", "Park Lane", "Willow Court", "Union Street", "Elm Terrace", "Bridge Road", "Garden Walk", "Mill Lane", "Summit Rise", "Canal Street", "Foundry Row"];
const NOTES = ["Leave with concierge", "Ring bell twice", "Fragile — handle with care", "Call on arrival", "Gate code 4471", "Back entrance only", "Signature required", "Leave in porch if no answer"];

const EXCEPTION_FLAVOURS: { type: ExceptionType; severity: ExceptionSeverity; text: string }[] = [
  { type: "customer_unavailable", severity: "critical", text: "Nobody answered at the door after two attempts." },
  { type: "address_issue", severity: "critical", text: "Address not found; building number does not exist." },
  { type: "delivery_refused", severity: "critical", text: "Recipient refused the parcel." },
  { type: "damaged_package", severity: "critical", text: "Box crushed in transit." },
];
const WARNING_FLAVOURS: { type: ExceptionType; severity: ExceptionSeverity; text: string }[] = [
  { type: "delayed", severity: "warning", text: "Heavy traffic on the bridge, running ~25 min late." },
  { type: "vehicle_issue", severity: "warning", text: "Warning light on; heading to depot after this stop." },
  { type: "address_issue", severity: "warning", text: "Unit number missing; customer contacted for details." },
  { type: "delayed", severity: "warning", text: "Waiting at pickup; goods not ready." },
  { type: "customer_unavailable", severity: "warning", text: "Customer asked to come back in 30 minutes." },
];

// ---------------------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------------------
type OrderIns = typeof schema.orders.$inferInsert;
type AssignmentIns = typeof schema.assignments.$inferInsert;
type HistoryIns = typeof schema.orderStatusHistory.$inferInsert;
type EventIns = typeof schema.deliveryEvents.$inferInsert;
type ExceptionIns = typeof schema.exceptions.$inferInsert;

type Ctx = {
  now: Date;
  dispatcherIds: string[];
  drivers: { id: string; userId: string; name: string }[];
  customers: { id: string; name: string; addressId: string; areaId: string }[];
  pickups: { id: string; merchant: string }[];
};

type Path = "unassigned" | "assigned" | "picked_up" | "out_for_delivery" | "delivered" | "failed" | "cancelled";

type Plan = {
  createdAt: Date;
  /** Latest instant a timestamp may take (today's orders cannot be in the future). */
  cap: number;
  path: Path;
  /** Drivers allowed to take this order (first pick is used). */
  driverPool: Ctx["drivers"];
  priority: OrderPriority;
  reassignedBeforePickup?: boolean;
  failRecovery?: boolean;
  cancelAfter?: "none" | "assign" | "fail";
  /** Leave an open warning exception on an in-progress order. */
  openWarning?: boolean;
  /** Fixed delivery window; otherwise derived from the timeline. */
  windowEnd?: Date;
  late?: boolean;
};

type Bundle = {
  order: OrderIns;
  assignments: AssignmentIns[];
  history: HistoryIns[];
  events: EventIns[];
  exceptions: ExceptionIns[];
};

// ---------------------------------------------------------------------------------------
// Order timeline builder: walks legal transitions and emits consistent rows
// ---------------------------------------------------------------------------------------
function buildOrder(ctx: Ctx, plan: Plan): Bundle {
  const id = randomUUID();
  const customer = pick(ctx.customers);
  const pickup = pick(ctx.pickups);
  const dispatcher = pick(ctx.dispatcherIds);

  const history: HistoryIns[] = [];
  const events: EventIns[] = [];
  const assignments: AssignmentIns[] = [];
  const exceptions: ExceptionIns[] = [];

  let t = plan.createdAt;
  const step = (lo: number, hi: number) => {
    t = new Date(Math.min(t.getTime() + int(lo, hi) * MIN, plan.cap));
    return t;
  };

  let status: OrderStatus = "unassigned";
  // Cast so TypeScript does not narrow this to `null` (it is reassigned inside closures).
  let driver = null as Ctx["drivers"][number] | null;
  let openExceptions = 0;
  let firstAssignedAt: Date | null = null;
  let pickedUpAt: Date | null = null;
  let deliveredAt: Date | null = null;

  const move = (to: OrderStatus, at: Date, by: string, note: string | null, event: DeliveryEventType, driverId: string | null, payload: Record<string, unknown> = {}) => {
    if (!canTransition(status, to)) throw new Error(`seed: illegal transition ${status} -> ${to}`);
    history.push({ orderId: id, fromStatus: status, toStatus: to, changedBy: by, note, createdAt: at });
    events.push({ orderId: id, type: event, actorUserId: by, driverId, payload: note ? { note, ...payload } : payload, createdAt: at });
    status = to;
  };
  const logEvent = (type: DeliveryEventType, at: Date, by: string | null, driverId: string | null, payload: Record<string, unknown> = {}) =>
    events.push({ orderId: id, type, actorUserId: by, driverId, payload, createdAt: at });

  const closeActive = (at: Date, as: "replaced" | "completed" | "cancelled") => {
    const a = assignments.find((x) => x.status === "active");
    if (a) {
      a.status = as;
      a.endedAt = at;
    }
  };
  const openAssignment = (d: Ctx["drivers"][number], at: Date) => {
    assignments.push({ id: randomUUID(), orderId: id, driverId: d.id, sequence: 1, status: "active", assignedBy: dispatcher, assignedAt: at });
    driver = d;
  };
  const raise = (flavour: { type: ExceptionType; severity: ExceptionSeverity; text: string }, at: Date, by: string | null, resolveAt?: Date) => {
    const exId = randomUUID();
    exceptions.push({
      id: exId,
      orderId: id,
      type: flavour.type,
      severity: flavour.severity,
      status: resolveAt ? "resolved" : "open",
      description: flavour.text,
      raisedBy: by,
      raisedAt: at,
      resolvedBy: resolveAt ? dispatcher : null,
      resolvedAt: resolveAt ?? null,
      resolutionNote: resolveAt ? "Rebooked and handed to another driver." : null,
    });
    logEvent("exception_raised", at, by, driver?.id ?? null, { exceptionId: exId, exceptionType: flavour.type, severity: flavour.severity, description: flavour.text });
    if (resolveAt) logEvent("exception_resolved", resolveAt, dispatcher, driver?.id ?? null, { exceptionId: exId, note: "Rebooked and handed to another driver." });
    else openExceptions++;
    return exId;
  };

  // created
  history.push({ orderId: id, fromStatus: null, toStatus: "unassigned", changedBy: dispatcher, note: "Order created", createdAt: t });
  logEvent("created", t, dispatcher, null, { merchantName: pickup.merchant, priority: plan.priority });

  const finish = (): Bundle => {
    let windowEnd = plan.windowEnd;
    if (!windowEnd) {
      // Derive a 2-hour-ish window from the timeline so on-time stats look realistic.
      const ref = (deliveredAt ?? t).getTime();
      windowEnd = plan.late ? new Date(ref - int(5, 40) * MIN) : new Date(ref + int(10, 90) * MIN);
    }
    const windowStart = new Date(windowEnd.getTime() - pick([90, 120, 120, 180]) * MIN);
    return {
      order: {
        id,
        reference: "", // numbered after all orders exist, in creation order
        customerId: customer.id,
        pickupAddressId: pickup.id,
        deliveryAddressId: customer.addressId,
        deliveryAreaId: customer.areaId,
        merchantName: pickup.merchant,
        status,
        priority: plan.priority,
        packages: pick([1, 1, 1, 2, 2, 3, 4]),
        weightKg: Math.round((0.5 + rand() * 18) * 10) / 10,
        notes: chance(0.3) ? pick(NOTES) : null,
        windowStart,
        windowEnd,
        driverId: driver?.id ?? null,
        openExceptions,
        createdBy: dispatcher,
        createdAt: plan.createdAt,
        updatedAt: t,
        firstAssignedAt,
        pickedUpAt,
        deliveredAt,
      },
      assignments,
      history,
      events,
      exceptions,
    };
  };

  if (plan.path === "unassigned") return finish();

  // Cancelled before anyone was assigned.
  if (plan.path === "cancelled" && (plan.cancelAfter ?? "none") === "none") {
    const at = step(5, 90);
    move("cancelled", at, dispatcher, pick(["Merchant cancelled the order", "Customer changed their mind", "Duplicate order"]), "cancelled", null);
    return finish();
  }

  const primary = plan.driverPool[0];
  const secondary = plan.driverPool[1] ?? primary;

  // first assignment
  let at = step(2, 25);
  openAssignment(primary, at);
  firstAssignedAt = at;
  move("assigned", at, dispatcher, null, "assigned", primary.id, { toDriverId: primary.id, toDriverName: primary.name });

  if (plan.reassignedBeforePickup && secondary.id !== primary.id) {
    at = step(3, 20);
    closeActive(at, "replaced");
    openAssignment(secondary, at);
    logEvent("reassigned", at, dispatcher, secondary.id, { fromDriverId: primary.id, fromDriverName: primary.name, toDriverId: secondary.id, toDriverName: secondary.name, reason: pick(["Closer to the drop-off", "Balancing workload", "Driver requested swap"]) });
  }
  if (plan.path === "assigned") {
    if (plan.openWarning) raise(pick(WARNING_FLAVOURS), new Date(Math.min(t.getTime() + int(1, 10) * MIN, plan.cap)), dispatcher);
    return finish();
  }

  if (plan.path === "cancelled" && plan.cancelAfter === "assign") {
    at = step(5, 60);
    closeActive(at, "cancelled");
    move("cancelled", at, dispatcher, "Merchant cancelled after assignment", "cancelled", driver!.id);
    return finish();
  }

  const driverUser = () => driver!.userId;

  at = step(8, 45);
  pickedUpAt = at;
  move("picked_up", at, driverUser(), null, "picked_up", driver!.id);
  if (plan.path === "picked_up") {
    if (plan.openWarning) raise(pick(WARNING_FLAVOURS), new Date(Math.min(t.getTime() + int(1, 10) * MIN, plan.cap)), driverUser());
    return finish();
  }

  at = step(5, 25);
  move("out_for_delivery", at, driverUser(), null, "out_for_delivery", driver!.id);
  if (plan.path === "out_for_delivery") {
    if (plan.openWarning) raise(pick(WARNING_FLAVOURS), new Date(Math.min(t.getTime() + int(1, 10) * MIN, plan.cap)), driverUser());
    return finish();
  }

  const needsFailure = plan.path === "failed" || plan.failRecovery || plan.cancelAfter === "fail";
  if (needsFailure) {
    const flavour = pick(EXCEPTION_FLAVOURS);
    at = step(10, 40);
    move("failed", at, driverUser(), flavour.text, "failed", driver!.id);

    if (plan.path === "failed") {
      raise(flavour, at, driverUser());
      return finish();
    }
    if (plan.cancelAfter === "fail") {
      const resolveAt = step(30, 180);
      raise(flavour, at, driverUser(), resolveAt);
      closeActive(resolveAt, "cancelled");
      move("cancelled", resolveAt, dispatcher, "Cancelled after failed delivery", "cancelled", driver!.id);
      return finish();
    }
    // recovery: reassign and try again
    const retryAt = step(20, 120);
    raise(flavour, at, driverUser(), retryAt);
    closeActive(retryAt, "replaced");
    const retryDriver = plan.driverPool[2] ?? secondary;
    openAssignment(retryDriver, retryAt);
    move("assigned", retryAt, dispatcher, "Retry after failed delivery", "reassigned", retryDriver.id, { fromDriverId: primary.id, fromDriverName: primary.name, toDriverId: retryDriver.id, toDriverName: retryDriver.name });
    at = step(20, 90);
    move("picked_up", at, driverUser(), null, "picked_up", driver!.id);
    at = step(5, 25);
    move("out_for_delivery", at, driverUser(), null, "out_for_delivery", driver!.id);
  }

  at = step(10, 50);
  deliveredAt = at;
  closeActive(at, "completed");
  move("delivered", at, driverUser(), null, "delivered", driver!.id);
  return finish();
}

// ---------------------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------------------
async function bulk<T extends PgTable>(db: Db, table: T, rows: T["$inferInsert"][], size = 300) {
  for (let i = 0; i < rows.length; i += size) {
    await db.insert(table).values(rows.slice(i, i + size));
  }
}

function weightedPick<T>(items: readonly T[], weights: readonly number[]): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

async function main() {
  const reset = process.argv.includes("--reset");
  const env = getEnv();
  const db = await getDb();
  const target = env.DATABASE_URL ? `Postgres at ${new URL(env.DATABASE_URL).host}` : "embedded PGlite (.data/pglite)";

  const [{ n }] = (await db.select({ n: sql<number>`count(*)::int` }).from(schema.users)) as { n: number }[];
  if (n > 0 && !reset) {
    console.error(`The database (${target}) already contains data.\nRe-run with --reset to WIPE it and reseed:  npm run db:seed -- --reset`);
    process.exit(1);
  }
  if (reset) {
    console.log(`Resetting ${target} ...`);
    await db.execute(sql`truncate table ${schema.appSettings}, ${schema.exceptions}, ${schema.deliveryEvents}, ${schema.orderStatusHistory}, ${schema.assignments}, ${schema.orders}, ${schema.addresses}, ${schema.customers}, ${schema.drivers}, ${schema.vehicles}, ${schema.users}, ${schema.areas} restart identity cascade`);
    await db.execute(sql`alter sequence order_number_seq restart with 10001`);
  }

  const now = new Date();
  const tz = systemTimezone();
  const password = process.env.SEED_PASSWORD ?? "fleetpilot";
  const passwordHash = await bcrypt.hash(password, 10);

  await db.transaction(async (tx) => {
    const t = tx as unknown as Db;

    // --- areas, vehicles, users, drivers -------------------------------------------------
    const areaRows = AREAS.map((a) => ({ id: randomUUID(), ...a }));
    await bulk(t, schema.areas, areaRows);
    const areaByCode = new Map(areaRows.map((a) => [a.code as string, a]));

    const staffRows = STAFF.map((s) => ({ id: randomUUID(), email: s.email, name: s.name, role: s.role, passwordHash, active: true }));
    const driverUserRows = DRIVERS.map((d) => ({
      id: randomUUID(),
      email: `${d.name.split(" ")[0].toLowerCase().replace(/[^a-z]/g, "")}@fleetpilot.test`,
      name: d.name,
      role: "driver" as const,
      passwordHash,
      active: true,
    }));
    await bulk(t, schema.users, [...staffRows, ...driverUserRows]);

    const vehicleRows = DRIVERS.map((d, i) => ({
      id: randomUUID(),
      plate: `FP-${101 + i}`,
      type: d.vehicle,
      ...VEHICLE_SPECS[d.vehicle],
      status: d.vehicleInMaintenance ? ("maintenance" as const) : ("active" as const),
    }));
    await bulk(t, schema.vehicles, vehicleRows);

    const driverRows = DRIVERS.map((d, i) => ({
      id: randomUUID(),
      userId: driverUserRows[i].id,
      phone: `(555) 010-${String(1000 + i * 37).slice(-4)}`,
      availability: d.availability,
      vehicleId: vehicleRows[i].id,
      homeAreaId: areaByCode.get(d.area)!.id,
      shiftStart: d.availability === "off_duty" ? "06:00" : "08:00",
      shiftEnd: d.availability === "off_duty" ? "14:00" : "17:00",
    }));
    await bulk(t, schema.drivers, driverRows);

    const drivers: Ctx["drivers"] = driverRows.map((d, i) => ({ id: d.id, userId: d.userId, name: DRIVERS[i].name }));
    const availabilityOf = new Map<string, DriverAvailability>(driverRows.map((d) => [d.id, d.availability]));
    // The driver whose van is in the workshop never gets orders (demonstrates the assignment guard).
    const maintenanceDriver = drivers[DRIVERS.findIndex((d) => d.vehicleInMaintenance)];
    const workable = drivers.filter((d) => d.id !== maintenanceDriver.id);
    // Drivers who can currently hold active work (available or on break).
    const onShift = workable.filter((d) => availabilityOf.get(d.id) !== "off_duty");

    // --- pickups, customers, addresses -------------------------------------------------
    const pickupAddrs = MERCHANTS.map((m) => {
      const area = areaByCode.get(m.area)!;
      return { id: randomUUID(), merchant: m.name, row: { id: "", customerId: null, label: m.name, line1: m.street, line2: null, city: "Riverton", postcode: postcode(), areaId: area.id, ...pointInArea(area, m.name) } };
    });
    pickupAddrs.forEach((p) => (p.row.id = p.id));

    const customerRows: (typeof schema.customers.$inferInsert)[] = [];
    const addressRows: (typeof schema.addresses.$inferInsert)[] = [...pickupAddrs.map((p) => p.row)];
    const customers: Ctx["customers"] = [];
    const areaWeights = [1.2, 1, 1.4, 1, 1.1, 1.5, 0.8, 0.9];
    const customerNames = new Set<string>();
    while (customers.length < 150) {
      const name = `${pick(FIRST)} ${pick(LAST)}`;
      if (customerNames.has(name)) continue;
      customerNames.add(name);
      const area = weightedPick(areaRows, areaWeights);
      const customerId = randomUUID();
      const addressId = randomUUID();
      customerRows.push({ id: customerId, name, email: `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@example.com`, phone: `(555) 02${int(0, 9)}-${String(int(0, 9999)).padStart(4, "0")}` });
      addressRows.push({ id: addressId, customerId, line1: `${int(1, 240)} ${pick(STREETS)}`, line2: chance(0.25) ? `Apt ${int(1, 40)}` : null, city: "Riverton", postcode: postcode(), areaId: area.id, ...pointInArea(area, `${customerId}`) });
      customers.push({ id: customerId, name, addressId, areaId: area.id });
    }
    await bulk(t, schema.customers, customerRows);
    await bulk(t, schema.addresses, addressRows);

    const ctx: Ctx = {
      now,
      dispatcherIds: staffRows.filter((s) => s.role === "dispatcher").map((s) => s.id),
      drivers,
      customers,
      pickups: pickupAddrs.map((p) => ({ id: p.id, merchant: p.merchant })),
    };

    // --- plans -------------------------------------------------------------------------
    const plans: Plan[] = [];
    const priorityRoll = (): OrderPriority => weightedPick<OrderPriority>(["normal", "high", "urgent"], [78, 15, 7]);
    const poolFor = (candidates: Ctx["drivers"]) => {
      const first = pick(candidates);
      const rest = candidates.filter((d) => d.id !== first.id);
      return [first, ...[...rest].sort(() => rand() - 0.5)];
    };

    // Today: a busy operational day.
    const today = dayRangeInTz(now, tz);
    const earliest = Math.max(today.start.getTime(), now.getTime() - 10 * 60 * MIN);
    const span = Math.max(now.getTime() - earliest, 5 * MIN);
    const cap = now.getTime() - MIN;
    const createdAt = (lo: number, hi: number) => new Date(now.getTime() - span * (lo + rand() * (hi - lo)));
    const inMin = (lo: number, hi: number) => new Date(now.getTime() + int(lo, hi) * MIN);

    const todayMix: { path: Path; count: number; created: [number, number] }[] = [
      { path: "unassigned", count: 11, created: [0.01, 0.2] },
      { path: "assigned", count: 12, created: [0.05, 0.3] },
      { path: "picked_up", count: 8, created: [0.15, 0.4] },
      { path: "out_for_delivery", count: 14, created: [0.25, 0.6] },
      { path: "delivered", count: 38, created: [0.45, 0.98] },
      { path: "failed", count: 3, created: [0.4, 0.7] },
      { path: "cancelled", count: 4, created: [0.1, 0.9] },
    ];
    for (const { path, count, created } of todayMix) {
      for (let i = 0; i < count; i++) {
        const plan: Plan = {
          createdAt: createdAt(created[0], created[1]),
          cap,
          path,
          driverPool: poolFor(path === "delivered" || path === "cancelled" ? workable : onShift),
          priority: priorityRoll(),
        };
        if (path === "unassigned") {
          // The first few are deliberately "at risk" or overdue so the dashboard has something to flag.
          if (i < 3) {
            plan.priority = i === 0 ? "urgent" : "high";
            plan.windowEnd = inMin(15, 40);
          } else if (i === 3) {
            plan.priority = "high";
            plan.windowEnd = inMin(-25, -10);
          } else {
            plan.priority = i < 6 ? "high" : plan.priority;
            plan.windowEnd = inMin(90, 360);
          }
        } else if (path === "assigned") {
          plan.windowEnd = inMin(60, 300);
          plan.reassignedBeforePickup = i < 2;
          plan.openWarning = i === 5;
        } else if (path === "picked_up") {
          plan.windowEnd = inMin(45, 200);
          plan.openWarning = i === 2;
        } else if (path === "out_for_delivery") {
          plan.windowEnd = i === 0 ? inMin(-12, -5) : inMin(15, 150);
          plan.openWarning = i === 1 || i === 4 || i === 9;
        } else if (path === "failed") {
          plan.windowEnd = inMin(30, 180);
          plan.priority = i === 0 ? "high" : plan.priority;
        } else if (path === "cancelled") {
          plan.cancelAfter = i % 2 === 0 ? "none" : "assign";
          plan.windowEnd = inMin(60, 300);
        } else if (path === "delivered") {
          plan.late = chance(0.12);
          plan.failRecovery = i % 13 === 5;
          plan.reassignedBeforePickup = chance(0.1);
        }
        plans.push(plan);
      }
    }

    // History: previous 14 local days, weekday-heavy.
    const driverWeights = workable.map((_, i) => 1.4 - (i % 5) * 0.18);
    for (let back = 1; back <= 14; back++) {
      const day = dayRangeInTz(now, tz, -back);
      const p = zonedParts(day.start, tz);
      const weekday = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
      const weekend = weekday === 0 || weekday === 6;
      const count = weekend ? int(14, 22) : int(26, 38);
      for (let i = 0; i < count; i++) {
        const created = new Date(day.start.getTime() + (6.5 * 60 + rand() * 11 * 60) * MIN);
        const roll = rand();
        const first = weightedPick(workable, driverWeights);
        const pool = [first, ...workable.filter((d) => d.id !== first.id).sort(() => rand() - 0.5)];
        const plan: Plan = { createdAt: created, cap: Infinity, path: "delivered", driverPool: pool, priority: priorityRoll(), late: chance(0.1) };
        if (roll < 0.04) {
          plan.path = "cancelled";
          plan.cancelAfter = pick(["none", "assign", "fail"] as const);
        } else if (roll < 0.075) plan.failRecovery = true;
        else if (roll < 0.17) plan.reassignedBeforePickup = true;
        plans.push(plan);
      }
    }

    // --- build, number, sequence ---------------------------------------------------------
    const bundles = plans.map((p) => buildOrder(ctx, p));
    bundles.sort((a, b) => a.order.createdAt!.getTime() - b.order.createdAt!.getTime());
    bundles.forEach((b, i) => (b.order.reference = `FP-${10001 + i}`));

    // Active assignments: number each driver's run by delivery window.
    const windowByOrder = new Map<string, number>(bundles.map((b) => [b.order.id!, b.order.windowEnd!.getTime()]));
    const activeByDriver = new Map<string, AssignmentIns[]>();
    for (const b of bundles) {
      for (const a of b.assignments) {
        if (a.status === "active") {
          const list = activeByDriver.get(a.driverId) ?? [];
          list.push(a);
          activeByDriver.set(a.driverId, list);
        }
      }
    }
    for (const list of activeByDriver.values()) {
      list.sort((a, b) => windowByOrder.get(a.orderId)! - windowByOrder.get(b.orderId)!);
      list.forEach((a, i) => (a.sequence = i + 1));
    }

    // --- insert (chronological per order so identity ids follow event order) ---------------
    await bulk(t, schema.orders, bundles.map((b) => b.order));
    await bulk(t, schema.assignments, bundles.flatMap((b) => b.assignments));
    await bulk(t, schema.orderStatusHistory, bundles.flatMap((b) => [...b.history].sort((x, y) => x.createdAt!.getTime() - y.createdAt!.getTime())), 400);
    await bulk(t, schema.deliveryEvents, bundles.flatMap((b) => [...b.events].sort((x, y) => x.createdAt!.getTime() - y.createdAt!.getTime())), 400);
    await bulk(t, schema.exceptions, bundles.flatMap((b) => b.exceptions));

    await t.execute(sql`select setval('order_number_seq', ${10000 + bundles.length})`);
    await t.insert(schema.appSettings).values({ key: SETTINGS_KEY, value: { ...DEFAULT_SETTINGS, timezone: tz } });

    const byStatus = bundles.filter((b) => b.order.createdAt! >= today.start).reduce<Record<string, number>>((acc, b) => ((acc[b.order.status!] = (acc[b.order.status!] ?? 0) + 1), acc), {});
    console.log(`Seeded ${bundles.length} orders, ${drivers.length} drivers, ${areaRows.length} areas, timezone ${tz}.`);
    console.log("Orders created today by status:", byStatus);
  });

  console.log(`\nDemo logins (password: ${password})`);
  for (const s of STAFF) console.log(`  ${s.role.padEnd(10)} ${s.email}`);
  console.log(`  ${"driver".padEnd(10)} sofia@fleetpilot.test  (and every other driver: first name @fleetpilot.test)`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
