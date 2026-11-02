import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { schema, type Db } from "@/db";
import type { OrderPriority } from "@/lib/domain";
import { conflict, invalid, notFound } from "@/lib/errors";
import { pointInArea } from "@/lib/geo";
import { isTerminal } from "@/lib/orders/state-machine";
import { assertCan, type Actor } from "@/lib/permissions";
import type { CreateOrderInput } from "@/lib/validation/orders";
import { lockOrder, recordEvent } from "./core";

const { orders, customers, addresses, areas, orderStatusHistory } = schema;

/** Create an order in the unassigned pool, with its first history row and timeline event. */
export async function createOrder(db: Db, input: CreateOrderInput, actor: Actor) {
  assertCan(actor, "order:create");
  if (input.windowEnd <= input.windowStart) throw invalid("Delivery window must end after it starts.");

  return db.transaction(async (tx) => {
    const [pickup] = await tx
      .select({ id: addresses.id })
      .from(addresses)
      .where(and(eq(addresses.id, input.pickupAddressId), isNull(addresses.customerId)));
    if (!pickup) throw notFound("Pickup location");

    const [area] = await tx.select().from(areas).where(eq(areas.id, input.delivery.areaId));
    if (!area) throw notFound("Delivery area");

    const now = new Date();
    const [customer] = await tx
      .insert(customers)
      .values({
        name: input.customer.name,
        phone: input.customer.phone ?? null,
        email: input.customer.email ?? null,
      })
      .returning();

    const seed = `${input.delivery.line1}|${input.delivery.postcode}`;
    const [dropoff] = await tx
      .insert(addresses)
      .values({
        customerId: customer.id,
        line1: input.delivery.line1,
        line2: input.delivery.line2 ?? null,
        city: input.delivery.city,
        postcode: input.delivery.postcode,
        areaId: area.id,
        ...pointInArea(area, seed),
      })
      .returning();

    const [order] = await tx
      .insert(orders)
      .values({
        reference: sql`'FP-' || nextval('order_number_seq')`,
        customerId: customer.id,
        pickupAddressId: pickup.id,
        deliveryAddressId: dropoff.id,
        deliveryAreaId: area.id,
        merchantName: input.merchantName,
        priority: input.priority,
        packages: input.packages,
        weightKg: input.weightKg,
        notes: input.notes ?? null,
        windowStart: input.windowStart,
        windowEnd: input.windowEnd,
        createdBy: actor.userId,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    await tx.insert(orderStatusHistory).values({
      orderId: order.id,
      fromStatus: null,
      toStatus: "unassigned",
      changedBy: actor.userId,
      note: "Order created",
      createdAt: now,
    });
    await recordEvent(tx, {
      orderId: order.id,
      type: "created",
      actor,
      payload: { merchantName: input.merchantName, priority: input.priority },
      at: now,
    });

    return order;
  });
}

/** Change an order's priority (timeline event only — priority is not a status). */
export async function setPriority(
  db: Db,
  input: { orderId: string; priority: OrderPriority; actor: Actor },
) {
  assertCan(input.actor, "order:priority");

  return db.transaction(async (tx) => {
    const order = await lockOrder(tx, input.orderId);
    if (isTerminal(order.status)) throw conflict("This order is already finished.");
    if (order.priority === input.priority) return order;

    const now = new Date();
    const [updated] = await tx
      .update(orders)
      .set({ priority: input.priority, updatedAt: now })
      .where(eq(orders.id, order.id))
      .returning();
    await recordEvent(tx, {
      orderId: order.id,
      type: "priority_changed",
      actor: input.actor,
      driverId: order.driverId,
      payload: { from: order.priority, to: input.priority },
      at: now,
    });
    return updated;
  });
}
