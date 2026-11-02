import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { schema, type Db } from "@/db";
import type { DriverAvailability } from "@/lib/domain";
import { conflict, forbidden, notFound } from "@/lib/errors";
import { can, type Actor } from "@/lib/permissions";

const { drivers, orders } = schema;

/**
 * Change a driver's availability. Dispatchers/admins (`driver:manage`) can change anyone's;
 * a driver can change their own. Going off duty is refused while the driver is physically
 * carrying orders (picked up / out for delivery): those must be completed or reassigned first.
 */
export async function setDriverAvailability(
  db: Db,
  input: { driverId: string; availability: DriverAvailability; actor: Actor },
) {
  const { driverId, availability, actor } = input;
  const isSelf = actor.role === "driver" && actor.driverId === driverId;
  if (!can(actor.role, "driver:manage") && !isSelf) throw forbidden();

  return db.transaction(async (tx) => {
    const [driver] = await tx.select().from(drivers).where(eq(drivers.id, driverId)).for("update");
    if (!driver) throw notFound("Driver");
    if (driver.availability === availability) return driver;

    if (availability === "off_duty") {
      const [{ n }] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(orders)
        .where(and(eq(orders.driverId, driverId), inArray(orders.status, ["picked_up", "out_for_delivery"])));
      if (n > 0) {
        throw conflict(
          `${n} order${n === 1 ? " is" : "s are"} still in progress with this driver. Complete or reassign ${n === 1 ? "it" : "them"} before going off duty.`,
        );
      }
    }

    const [updated] = await tx.update(drivers).set({ availability }).where(eq(drivers.id, driverId)).returning();
    return updated;
  });
}
