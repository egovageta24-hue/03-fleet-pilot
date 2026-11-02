import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { schema, type Db } from "@/db";
import { conflict, invalid, notFound } from "@/lib/errors";
import { canAssignFrom, canTransition } from "@/lib/orders/state-machine";
import { assertCan, type Actor } from "@/lib/permissions";
import { ORDER_STATUS_META } from "@/lib/status";
import { applyTransition, lockOrder, recordEvent } from "./core";

const { assignments, drivers, users, vehicles, orders } = schema;

/** Lock the driver row (serialises sequence numbering) and check they can take work. */
async function lockAssignableDriver(tx: Db, driverId: string) {
  const [row] = await tx
    .select({ driver: drivers, user: users, vehicle: vehicles })
    .from(drivers)
    .innerJoin(users, eq(users.id, drivers.userId))
    .leftJoin(vehicles, eq(vehicles.id, drivers.vehicleId))
    .where(eq(drivers.id, driverId))
    .for("update", { of: drivers });

  if (!row) throw notFound("Driver");
  if (!row.user.active) throw conflict(`${row.user.name}'s account is deactivated.`);
  if (row.driver.availability === "off_duty") throw conflict(`${row.user.name} is off duty.`);
  if (row.vehicle && row.vehicle.status !== "active") {
    throw conflict(`${row.user.name}'s vehicle (${row.vehicle.plate}) is not in service.`);
  }
  return row;
}

/**
 * Assign an unassigned order to a driver, or reassign one that already has a driver.
 *
 * Atomically: locks the order, retires the previous active assignment (kept as `replaced`),
 * appends a new one at the end of the driver's run, resets the order to `assigned`, and
 * writes status history + timeline events. A concurrent assignment of the same order
 * loses the race on the order-row lock and fails the status precondition.
 */
export async function assignOrder(
  db: Db,
  input: {
    orderId: string;
    driverId: string;
    actor: Actor;
    reason?: string | null;
    /**
     * Optimistic-concurrency guard: the driver the caller saw on the order (`null` =
     * unassigned). If someone else changed it meanwhile, the call fails instead of
     * silently overwriting their assignment. Omit to skip the check.
     */
    expectedDriverId?: string | null;
  },
) {
  const { orderId, driverId, actor } = input;
  const reason = input.reason?.trim() || null;
  assertCan(actor, "order:assign");

  return db.transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);

    if (input.expectedDriverId !== undefined && order.driverId !== input.expectedDriverId) {
      let who = "no one";
      if (order.driverId) {
        const [current] = await tx
          .select({ name: users.name })
          .from(drivers)
          .innerJoin(users, eq(users.id, drivers.userId))
          .where(eq(drivers.id, order.driverId));
        who = current?.name ?? "another driver";
      }
      throw conflict(
        `This order was just changed by someone else (now assigned to ${who}). Refresh and try again.`,
      );
    }

    if (!canAssignFrom(order.status)) {
      throw conflict(
        `This order is ${ORDER_STATUS_META[order.status].label.toLowerCase()} and can no longer be assigned.`,
      );
    }
    const inProgress = order.status === "picked_up" || order.status === "out_for_delivery";
    if (order.driverId === driverId && order.status !== "failed" && order.status !== "unassigned") {
      throw conflict("This order is already assigned to that driver.");
    }
    if (inProgress && !reason) {
      throw invalid("A reason is required to reassign an order that is already in progress.");
    }

    const { user: driverUser } = await lockAssignableDriver(tx, driverId);
    const now = new Date();

    const [previous] = await tx
      .select()
      .from(assignments)
      .where(and(eq(assignments.orderId, orderId), eq(assignments.status, "active")));
    if (previous) {
      await tx
        .update(assignments)
        .set({ status: "replaced", endedAt: now })
        .where(eq(assignments.id, previous.id));
    }

    const [{ maxSeq }] = await tx
      .select({ maxSeq: sql<number>`coalesce(max(${assignments.sequence}), 0)::int` })
      .from(assignments)
      .where(and(eq(assignments.driverId, driverId), eq(assignments.status, "active")));

    const [assignment] = await tx
      .insert(assignments)
      .values({
        orderId,
        driverId,
        sequence: maxSeq + 1,
        status: "active",
        assignedBy: actor.userId,
        reason,
        assignedAt: now,
      })
      .returning();

    let fromDriverName: string | null = null;
    if (previous) {
      const [prevDriver] = await tx
        .select({ name: users.name })
        .from(drivers)
        .innerJoin(users, eq(users.id, drivers.userId))
        .where(eq(drivers.id, previous.driverId));
      fromDriverName = prevDriver?.name ?? null;
    }

    const eventType = previous ? "reassigned" : "assigned";
    const payload = {
      toDriverId: driverId,
      toDriverName: driverUser.name,
      fromDriverId: previous?.driverId ?? null,
      fromDriverName,
      sequence: assignment.sequence,
      ...(reason ? { reason } : {}),
    };

    let updated;
    if (order.status === "assigned") {
      // Driver change before pickup: the status stays `assigned`, so there is no status
      // history row — the swap is recorded on the timeline instead.
      [updated] = await tx
        .update(orders)
        .set({ driverId, updatedAt: now })
        .where(eq(orders.id, orderId))
        .returning();
      await recordEvent(tx, { orderId, type: eventType, actor, driverId, payload, at: now });
    } else {
      updated = await applyTransition(tx, order, {
        to: "assigned",
        actor,
        note: reason,
        set: { driverId },
        event: { type: eventType, driverId, payload },
      });
    }

    return { order: updated, assignment };
  });
}

export type BulkAssignResult = { orderId: string; ok: true } | { orderId: string; ok: false; error: string };

/** Assign several orders to one driver. Each order is its own transaction; failures are reported per order. */
export async function bulkAssign(
  db: Db,
  input: { orderIds: string[]; driverId: string; actor: Actor },
): Promise<BulkAssignResult[]> {
  assertCan(input.actor, "order:assign");
  const results: BulkAssignResult[] = [];
  for (const orderId of input.orderIds) {
    try {
      // Bulk assign only ever takes orders from the unassigned pool.
      await assignOrder(db, {
        orderId,
        driverId: input.driverId,
        actor: input.actor,
        expectedDriverId: null,
      });
      results.push({ orderId, ok: true });
    } catch (err) {
      if (err instanceof Error && err.name === "DomainError") {
        results.push({ orderId, ok: false, error: err.message });
      } else {
        throw err;
      }
    }
  }
  return results;
}

/** Return an assigned (or failed) order to the unassigned pool. */
export async function unassignOrder(
  db: Db,
  input: { orderId: string; actor: Actor; reason?: string | null },
) {
  const { orderId, actor } = input;
  const reason = input.reason?.trim() || null;
  assertCan(actor, "order:assign");

  return db.transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    if (!canTransition(order.status, "unassigned")) {
      throw conflict(
        `A ${ORDER_STATUS_META[order.status].label.toLowerCase()} order cannot be returned to the unassigned pool.`,
      );
    }

    const now = new Date();
    const [previous] = await tx
      .select()
      .from(assignments)
      .where(and(eq(assignments.orderId, orderId), eq(assignments.status, "active")));
    if (previous) {
      await tx
        .update(assignments)
        .set({ status: "cancelled", endedAt: now, reason: reason ?? previous.reason })
        .where(eq(assignments.id, previous.id));
    }

    return applyTransition(tx, order, {
      to: "unassigned",
      actor,
      note: reason,
      set: { driverId: null },
      event: { driverId: previous?.driverId ?? null, payload: { fromDriverId: previous?.driverId ?? null } },
    });
  });
}

/** Move a stop up/down within a driver's run by swapping sequence numbers with its neighbour. */
export async function moveStop(
  db: Db,
  input: { assignmentId: string; direction: "up" | "down"; actor: Actor },
) {
  assertCan(input.actor, "order:assign");

  return db.transaction(async (tx) => {
    const [target] = await tx
      .select()
      .from(assignments)
      .where(and(eq(assignments.id, input.assignmentId), eq(assignments.status, "active")));
    if (!target) throw notFound("Stop");

    await tx.select({ id: drivers.id }).from(drivers).where(eq(drivers.id, target.driverId)).for("update");

    const run = await tx
      .select()
      .from(assignments)
      .where(and(eq(assignments.driverId, target.driverId), eq(assignments.status, "active")))
      .orderBy(asc(assignments.sequence), asc(assignments.assignedAt));

    const index = run.findIndex((a) => a.id === target.id);
    const neighbourIndex = input.direction === "up" ? index - 1 : index + 1;
    if (index === -1 || neighbourIndex < 0 || neighbourIndex >= run.length) return false; // at the edge

    // Swap the two stops, then re-number the whole run densely (1..n).
    const ids = run.map((a) => a.id);
    [ids[index], ids[neighbourIndex]] = [ids[neighbourIndex], ids[index]];
    for (let i = 0; i < ids.length; i++) {
      await tx.update(assignments).set({ sequence: i + 1 }).where(eq(assignments.id, ids[i]));
    }
    return true;
  });
}
