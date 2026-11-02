import "server-only";
import { and, eq } from "drizzle-orm";
import { schema, type Db } from "@/db";
import type { DeliveryEventType, OrderStatus } from "@/lib/domain";
import { conflict, notFound } from "@/lib/errors";
import { canTransition, eventTypeForTarget, isTerminal } from "@/lib/orders/state-machine";
import type { Actor } from "@/lib/permissions";
import { ORDER_STATUS_META } from "@/lib/status";

const { orders, assignments, orderStatusHistory, deliveryEvents, exceptions } = schema;

export type OrderRow = typeof orders.$inferSelect;
export type OrderUpdate = Partial<typeof orders.$inferInsert>;

/** Read + row-lock an order for the rest of the surrounding transaction. */
export async function lockOrder(tx: Db, orderId: string): Promise<OrderRow> {
  const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
  if (!order) throw notFound("Order");
  return order;
}

/** Append a timeline event. */
export async function recordEvent(
  tx: Db,
  e: {
    orderId: string;
    type: DeliveryEventType;
    actor: Actor | null;
    driverId?: string | null;
    payload?: Record<string, unknown>;
    at?: Date;
  },
) {
  await tx.insert(deliveryEvents).values({
    orderId: e.orderId,
    type: e.type,
    actorUserId: e.actor?.userId ?? null,
    driverId: e.driverId ?? null,
    payload: e.payload ?? {},
    createdAt: e.at ?? new Date(),
  });
}

export type TransitionInput = {
  to: OrderStatus;
  actor: Actor;
  note?: string | null;
  /** Extra order columns written in the same UPDATE (e.g. `driverId`). */
  set?: OrderUpdate;
  /** Overrides for the timeline event written alongside the status history row. */
  event?: { type?: DeliveryEventType; driverId?: string | null; payload?: Record<string, unknown> };
};

/**
 * THE single place an order's status changes. Must run inside a transaction with the
 * order row locked (see `lockOrder`). In one go it:
 *   1. validates the move against the state machine,
 *   2. updates the order (status, lifecycle timestamps, extra columns),
 *   3. appends an `order_status_history` row and a `delivery_events` row,
 *   4. on delivered/cancelled, closes the active assignment and resolves open exceptions.
 */
export async function applyTransition(tx: Db, order: OrderRow, input: TransitionInput): Promise<OrderRow> {
  const { to, actor } = input;
  if (!canTransition(order.status, to)) {
    throw conflict(
      `This order is ${ORDER_STATUS_META[order.status].label.toLowerCase()} and cannot be moved to ` +
        `${ORDER_STATUS_META[to].label.toLowerCase()}.`,
    );
  }

  const now = new Date();
  const set: OrderUpdate = { ...input.set, status: to, updatedAt: now };
  if (to === "picked_up") set.pickedUpAt = now;
  if (to === "delivered") set.deliveredAt = now;
  if (to === "assigned" && !order.firstAssignedAt) set.firstAssignedAt = now;

  if (isTerminal(to)) {
    await tx
      .update(assignments)
      .set({ status: to === "delivered" ? "completed" : "cancelled", endedAt: now })
      .where(and(eq(assignments.orderId, order.id), eq(assignments.status, "active")));

    if (order.openExceptions > 0) {
      await resolveOpenExceptions(
        tx,
        order,
        actor,
        to === "delivered" ? "Resolved: order delivered." : "Resolved: order cancelled.",
        now,
      );
      set.openExceptions = 0;
    }
  }

  const [updated] = await tx.update(orders).set(set).where(eq(orders.id, order.id)).returning();

  await tx.insert(orderStatusHistory).values({
    orderId: order.id,
    fromStatus: order.status,
    toStatus: to,
    changedBy: actor.userId,
    note: input.note ?? null,
    createdAt: now,
  });

  await recordEvent(tx, {
    orderId: order.id,
    type: input.event?.type ?? eventTypeForTarget(to),
    actor,
    driverId: input.event?.driverId !== undefined ? input.event.driverId : (updated.driverId ?? order.driverId),
    payload: { ...(input.note ? { note: input.note } : {}), ...input.event?.payload },
    at: now,
  });

  return updated;
}

/** Close every open exception on an order (used when the order reaches a terminal status). */
async function resolveOpenExceptions(tx: Db, order: OrderRow, actor: Actor, note: string, now: Date) {
  const open = await tx
    .select({ id: exceptions.id })
    .from(exceptions)
    .where(and(eq(exceptions.orderId, order.id), eq(exceptions.status, "open")));

  for (const ex of open) {
    await tx
      .update(exceptions)
      .set({ status: "resolved", resolvedBy: actor.userId, resolvedAt: now, resolutionNote: note })
      .where(eq(exceptions.id, ex.id));
    await recordEvent(tx, {
      orderId: order.id,
      type: "exception_resolved",
      actor,
      driverId: order.driverId,
      payload: { exceptionId: ex.id, note },
      at: now,
    });
  }
}
