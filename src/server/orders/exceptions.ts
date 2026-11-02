import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { schema, type Db } from "@/db";
import type { ExceptionSeverity, ExceptionType } from "@/lib/domain";
import { conflict, forbidden, invalid, notFound } from "@/lib/errors";
import { canTransition, isDriverTransition, isTerminal } from "@/lib/orders/state-machine";
import { assertCan, type Actor } from "@/lib/permissions";
import { EXCEPTION_TYPE_LABEL } from "@/lib/status";
import { applyTransition, lockOrder, recordEvent } from "./core";

const { exceptions, orders } = schema;

/**
 * Flag a problem on an order. Optionally fails the delivery in the same transaction
 * (the driver's "couldn't deliver" path). Drivers can only flag their own orders.
 */
export async function raiseException(
  db: Db,
  input: {
    orderId: string;
    type: ExceptionType;
    severity?: ExceptionSeverity;
    description?: string | null;
    markFailed?: boolean;
    actor: Actor;
  },
) {
  const { orderId, actor } = input;
  assertCan(actor, "exception:raise");
  const description = input.description?.trim() || null;

  return db.transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    if (isTerminal(order.status)) throw conflict("This order is already finished.");
    if (actor.role === "driver" && (!actor.driverId || order.driverId !== actor.driverId)) {
      throw forbidden("This delivery is not assigned to you.");
    }
    if (input.markFailed) {
      const allowed =
        canTransition(order.status, "failed") &&
        (actor.role !== "driver" || isDriverTransition(order.status, "failed"));
      if (!allowed) throw invalid("Only an order that has been picked up can be marked failed.");
    }

    const now = new Date();
    const severity = input.severity ?? (input.markFailed ? "critical" : "warning");
    const [exception] = await tx
      .insert(exceptions)
      .values({
        orderId,
        type: input.type,
        severity,
        description,
        raisedBy: actor.userId,
        raisedAt: now,
      })
      .returning();

    const [withCount] = await tx
      .update(orders)
      .set({ openExceptions: sql`${orders.openExceptions} + 1`, updatedAt: now })
      .where(eq(orders.id, orderId))
      .returning();

    await recordEvent(tx, {
      orderId,
      type: "exception_raised",
      actor,
      driverId: order.driverId,
      payload: { exceptionId: exception.id, exceptionType: input.type, severity, description },
      at: now,
    });

    const updated = input.markFailed
      ? await applyTransition(tx, withCount, {
          to: "failed",
          actor,
          note: `${EXCEPTION_TYPE_LABEL[input.type]}${description ? `: ${description}` : ""}`,
        })
      : withCount;

    return { order: updated, exception };
  });
}

/** Resolve an open exception with a note. */
export async function resolveException(
  db: Db,
  input: { exceptionId: string; resolutionNote: string; actor: Actor },
) {
  const { exceptionId, actor } = input;
  assertCan(actor, "exception:resolve");
  const resolutionNote = input.resolutionNote.trim();
  if (!resolutionNote) throw invalid("Add a short resolution note.");

  return db.transaction(async (tx) => {
    // Lock the order first (same order as the terminal-transition path) to avoid deadlocks.
    const [found] = await tx
      .select({ orderId: exceptions.orderId })
      .from(exceptions)
      .where(eq(exceptions.id, exceptionId));
    if (!found) throw notFound("Exception");
    const order = await lockOrder(tx, found.orderId);

    const [ex] = await tx.select().from(exceptions).where(eq(exceptions.id, exceptionId)).for("update");
    if (ex.status === "resolved") throw conflict("This exception is already resolved.");

    const now = new Date();
    const [resolved] = await tx
      .update(exceptions)
      .set({ status: "resolved", resolvedBy: actor.userId, resolvedAt: now, resolutionNote })
      .where(and(eq(exceptions.id, exceptionId), eq(exceptions.status, "open")))
      .returning();

    const [updated] = await tx
      .update(orders)
      .set({ openExceptions: sql`greatest(${orders.openExceptions} - 1, 0)`, updatedAt: now })
      .where(eq(orders.id, order.id))
      .returning();

    await recordEvent(tx, {
      orderId: order.id,
      type: "exception_resolved",
      actor,
      driverId: order.driverId,
      payload: { exceptionId, note: resolutionNote },
      at: now,
    });

    return { order: updated, exception: resolved };
  });
}
