import type { Db } from "@/db";
import { schema } from "@/db";
import type { DriverAvailability, OrderPriority, OrderStatus, UserRole } from "@/lib/domain";

let counter = 0;
const next = () => ++counter;

export async function makeArea(db: Db) {
  const n = next();
  const [area] = await db
    .insert(schema.areas)
    .values({ code: `A${n}`, name: `Area ${n}`, mapX: 10, mapY: 10, mapW: 20, mapH: 20 })
    .returning();
  return area;
}

export async function makeUser(db: Db, role: UserRole = "dispatcher") {
  const n = next();
  const [user] = await db
    .insert(schema.users)
    .values({ email: `user${n}@test.local`, name: `User ${n}`, passwordHash: "x", role })
    .returning();
  return user;
}

export async function makeDriver(
  db: Db,
  opts: { availability?: DriverAvailability; active?: boolean } = {},
) {
  const n = next();
  const [user] = await db
    .insert(schema.users)
    .values({
      email: `driver${n}@test.local`,
      name: `Driver ${n}`,
      passwordHash: "x",
      role: "driver",
      active: opts.active ?? true,
    })
    .returning();
  const [driver] = await db
    .insert(schema.drivers)
    .values({ userId: user.id, phone: `555-01${n}`, availability: opts.availability ?? "available" })
    .returning();
  return { user, driver };
}

export async function makeOrder(
  db: Db,
  opts: { status?: OrderStatus; priority?: OrderPriority; areaId?: string } = {},
) {
  const n = next();
  const areaId = opts.areaId ?? (await makeArea(db)).id;
  const [customer] = await db
    .insert(schema.customers)
    .values({ name: `Customer ${n}`, phone: `555-02${n}` })
    .returning();
  const [pickup] = await db
    .insert(schema.addresses)
    .values({ line1: `${n} Warehouse Rd`, city: "Testville", postcode: "T1 1AA", areaId, mapX: 5, mapY: 5 })
    .returning();
  const [dropoff] = await db
    .insert(schema.addresses)
    .values({
      customerId: customer.id,
      line1: `${n} Main St`,
      city: "Testville",
      postcode: "T1 2BB",
      areaId,
      mapX: 15,
      mapY: 15,
    })
    .returning();
  const now = Date.now();
  const [order] = await db
    .insert(schema.orders)
    .values({
      reference: `FP-T${n}`,
      customerId: customer.id,
      pickupAddressId: pickup.id,
      deliveryAddressId: dropoff.id,
      deliveryAreaId: areaId,
      merchantName: "Test Merchant",
      status: opts.status ?? "unassigned",
      priority: opts.priority ?? "normal",
      windowStart: new Date(now + 60 * 60_000),
      windowEnd: new Date(now + 3 * 60 * 60_000),
    })
    .returning();
  return order;
}
