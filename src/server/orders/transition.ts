import "server-only";
import type { Db } from "@/db";
import type { OrderStatus } from "@/lib/domain";
import { forbidden, invalid } from "@/lib/errors";
import {
  ASSIGNMENT_TARGETS,
  isDriverTransition,
  isTerminal,
} from "@/lib/orders/state-machine";
import { assertCan, type Actor } from "@/lib/permissions";
import { applyTransition, lockOrder } from "./core";

/**
 * Move an order along its lifecycle (pickup → out for delivery → delivered, fail, cancel).
 * Assignment moves (`assigned` / `unassigned`) are rejected here; use the assignment services.
 *
 * - Drivers: only the forward steps on an order currently assigned to them.
 * - Dispatchers/admins: any legal move (`order:advance_any`); cancelling needs `order:cancel`.
 */
export async function advanceOrder(
  db: Db,
  input: { orderId: string; to: OrderStatus; actor: Actor; note?: string | null },
) {
  const { orderId, to, actor } = input;
  const note = input.note?.trim() || null;

  if (ASSIGNMENT_TARGETS.includes(to)) {
    throw invalid("Use assign / unassign to change who holds an order.");
  }
  if ((to === "failed" || to === "cancelled") && !note) {
    throw invalid(to === "failed" ? "Say why the delivery failed." : "A reason is required to cancel an order.");
  }

  return db.transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);

    if (isTerminal(order.status)) {
      throw forbidden(`This order is already ${order.status}; it can no longer be changed.`);
    }

    if (to === "cancelled") {
      assertCan(actor, "order:cancel");
    } else if (actor.role === "driver") {
      assertCan(actor, "order:advance_own");
      if (!actor.driverId || order.driverId !== actor.driverId) {
        throw forbidden("This delivery is not assigned to you.");
      }
      if (!isDriverTransition(order.status, to)) {
        throw forbidden("That status change is not available to drivers.");
      }
    } else {
      assertCan(actor, "order:advance_any");
    }

    return applyTransition(tx, order, { to, actor, note });
  });
}
