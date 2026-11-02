import { sql } from "drizzle-orm";
import {
  bigint,
  index,
  integer,
  jsonb,
  pgEnum,
  pgSequence,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  ASSIGNMENT_STATUSES,
  EVENT_TYPES,
  EXCEPTION_SEVERITIES,
  EXCEPTION_STATUSES,
  EXCEPTION_TYPES,
  ORDER_PRIORITIES,
  ORDER_STATUSES,
} from "../../lib/domain";
import { drivers, users } from "./people";
import { addresses, areas, customers } from "./reference";

export const orderStatus = pgEnum("order_status", ORDER_STATUSES);
export const orderPriority = pgEnum("order_priority", ORDER_PRIORITIES);
export const assignmentStatus = pgEnum("assignment_status", ASSIGNMENT_STATUSES);
export const deliveryEventType = pgEnum("delivery_event_type", EVENT_TYPES);
export const exceptionType = pgEnum("exception_type", EXCEPTION_TYPES);
export const exceptionSeverity = pgEnum("exception_severity", EXCEPTION_SEVERITIES);
export const exceptionStatus = pgEnum("exception_status", EXCEPTION_STATUSES);

/** Source of the human-facing order reference (`FP-10001`). A sequence is race-free. */
export const orderNumberSeq = pgSequence("order_number_seq", { startWith: 10001 });

const tstz = (name: string) => timestamp(name, { withTimezone: true });

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reference: text("reference").notNull().unique(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    pickupAddressId: uuid("pickup_address_id")
      .notNull()
      .references(() => addresses.id),
    deliveryAddressId: uuid("delivery_address_id")
      .notNull()
      .references(() => addresses.id),
    /** Denormalised from the delivery address so area filtering needs no join. */
    deliveryAreaId: uuid("delivery_area_id")
      .notNull()
      .references(() => areas.id),
    merchantName: text("merchant_name").notNull(),
    status: orderStatus("status").notNull().default("unassigned"),
    priority: orderPriority("priority").notNull().default("normal"),
    packages: integer("packages").notNull().default(1),
    weightKg: real("weight_kg").notNull().default(1),
    notes: text("notes"),
    windowStart: tstz("window_start").notNull(),
    windowEnd: tstz("window_end").notNull(),
    /**
     * Denormalised driver of the order's latest assignment. Set while the order has an
     * active assignment, kept after delivery/cancellation (reports attribute deliveries to
     * it) and cleared only when the order is returned to the unassigned pool.
     */
    driverId: uuid("driver_id").references(() => drivers.id),
    /** Denormalised count of open exceptions, kept in sync by the exception service. */
    openExceptions: integer("open_exceptions").notNull().default(0),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: tstz("created_at").notNull().defaultNow(),
    updatedAt: tstz("updated_at").notNull().defaultNow(),
    firstAssignedAt: tstz("first_assigned_at"),
    pickedUpAt: tstz("picked_up_at"),
    deliveredAt: tstz("delivered_at"),
  },
  (t) => [
    index("orders_status_idx").on(t.status),
    index("orders_driver_idx").on(t.driverId),
    index("orders_area_idx").on(t.deliveryAreaId),
    index("orders_created_idx").on(t.createdAt),
    index("orders_priority_idx").on(t.priority),
    index("orders_window_end_idx").on(t.windowEnd),
  ],
);

/** One row per (order, driver) assignment. Replaced assignments are kept, never deleted. */
export const assignments = pgTable(
  "assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    driverId: uuid("driver_id")
      .notNull()
      .references(() => drivers.id),
    /** Stop order within the driver's run. */
    sequence: integer("sequence").notNull(),
    status: assignmentStatus("status").notNull().default("active"),
    assignedBy: uuid("assigned_by").references(() => users.id),
    reason: text("reason"),
    assignedAt: tstz("assigned_at").notNull().defaultNow(),
    endedAt: tstz("ended_at"),
  },
  (t) => [
    // At most one active assignment per order.
    uniqueIndex("assignments_one_active_per_order")
      .on(t.orderId)
      .where(sql`${t.status} = 'active'`),
    index("assignments_driver_status_idx").on(t.driverId, t.status),
    index("assignments_order_idx").on(t.orderId),
  ],
);

/** Append-only (enforced by a DB trigger, see migrations). One row per status change. */
export const orderStatusHistory = pgTable(
  "order_status_history",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    fromStatus: orderStatus("from_status"),
    toStatus: orderStatus("to_status").notNull(),
    changedBy: uuid("changed_by").references(() => users.id),
    note: text("note"),
    createdAt: tstz("created_at").notNull().defaultNow(),
  },
  (t) => [index("status_history_order_idx").on(t.orderId, t.createdAt)],
);

/** Append-only (trigger-enforced). Richer than status history; feeds the timeline. */
export const deliveryEvents = pgTable(
  "delivery_events",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    type: deliveryEventType("type").notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    driverId: uuid("driver_id").references(() => drivers.id),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: tstz("created_at").notNull().defaultNow(),
  },
  (t) => [index("delivery_events_order_idx").on(t.orderId, t.createdAt)],
);

export const exceptions = pgTable(
  "exceptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    type: exceptionType("type").notNull(),
    severity: exceptionSeverity("severity").notNull().default("warning"),
    status: exceptionStatus("status").notNull().default("open"),
    description: text("description"),
    raisedBy: uuid("raised_by").references(() => users.id),
    raisedAt: tstz("raised_at").notNull().defaultNow(),
    resolvedBy: uuid("resolved_by").references(() => users.id),
    resolvedAt: tstz("resolved_at"),
    resolutionNote: text("resolution_note"),
  },
  (t) => [index("exceptions_order_idx").on(t.orderId), index("exceptions_status_idx").on(t.status)],
);
