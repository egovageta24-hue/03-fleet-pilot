import {
  index,
  integer,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { VEHICLE_STATUSES, VEHICLE_TYPES } from "../../lib/domain";

export const vehicleType = pgEnum("vehicle_type", VEHICLE_TYPES);
export const vehicleStatus = pgEnum("vehicle_status", VEHICLE_STATUSES);

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/** Operational zones. map* are percentages (0-100) on the stylised SVG operations map. */
export const areas = pgTable("areas", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  mapX: real("map_x").notNull(),
  mapY: real("map_y").notNull(),
  mapW: real("map_w").notNull(),
  mapH: real("map_h").notNull(),
});

export const vehicles = pgTable("vehicles", {
  id: uuid("id").primaryKey().defaultRandom(),
  plate: text("plate").notNull().unique(),
  type: vehicleType("type").notNull(),
  make: text("make").notNull(),
  model: text("model").notNull(),
  capacityKg: integer("capacity_kg").notNull(),
  status: vehicleStatus("status").notNull().default("active"),
  createdAt: createdAt(),
});

/** Delivery recipients. */
export const customers = pgTable("customers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  createdAt: createdAt(),
});

/** Delivery addresses (customerId set) and pickup/warehouse addresses (customerId null). */
export const addresses = pgTable(
  "addresses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id").references(() => customers.id),
    label: text("label"),
    line1: text("line1").notNull(),
    line2: text("line2"),
    city: text("city").notNull(),
    postcode: text("postcode").notNull(),
    areaId: uuid("area_id")
      .notNull()
      .references(() => areas.id),
    /** Position on the SVG operations map, percentages (0-100). */
    mapX: real("map_x").notNull(),
    mapY: real("map_y").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("addresses_area_idx").on(t.areaId), index("addresses_customer_idx").on(t.customerId)],
);
