import {
  boolean,
  pgEnum,
  pgTable,
  text,
  time,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { DRIVER_AVAILABILITIES, USER_ROLES } from "../../lib/domain";
import { areas, vehicles } from "./reference";

export const userRole = pgEnum("user_role", USER_ROLES);
export const driverAvailability = pgEnum("driver_availability", DRIVER_AVAILABILITIES);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: userRole("role").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Driver profile (1:1 with a `driver`-role user). "On route" is intentionally NOT
 * stored here — it is derived from the driver's active orders so it can never drift.
 */
export const drivers = pgTable("drivers", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id),
  phone: text("phone").notNull(),
  availability: driverAvailability("availability").notNull().default("available"),
  vehicleId: uuid("vehicle_id").references(() => vehicles.id),
  homeAreaId: uuid("home_area_id").references(() => areas.id),
  shiftStart: time("shift_start").notNull().default("08:00"),
  shiftEnd: time("shift_end").notNull().default("17:00"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
