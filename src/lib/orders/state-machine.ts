import type { DeliveryEventType, OrderStatus } from "@/lib/domain";

/**
 * Allowed order status transitions. Pure data: the only place lifecycle rules live.
 *
 * Moves that touch assignments (`→ assigned`, `→ unassigned`) must go through the
 * assignment services so the `assignments` table and `orders.driver_id` stay in sync;
 * `transitionOrder` refuses them when called directly (see `ASSIGNMENT_TARGETS`).
 */
export const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  unassigned: ["assigned", "cancelled"],
  assigned: ["picked_up", "unassigned", "cancelled"],
  // `→ assigned` below is a hand-over (reassignment) after pickup or a failed attempt.
  picked_up: ["out_for_delivery", "failed", "assigned"],
  out_for_delivery: ["delivered", "failed", "assigned"],
  failed: ["assigned", "unassigned", "cancelled"],
  delivered: [],
  cancelled: [],
};

/** Targets that change who holds the order; only the assignment services may use them. */
export const ASSIGNMENT_TARGETS: readonly OrderStatus[] = ["assigned", "unassigned"];

export const TERMINAL_STATUSES: readonly OrderStatus[] = ["delivered", "cancelled"];
/** Statuses where a driver currently holds the order. */
export const ACTIVE_STATUSES: readonly OrderStatus[] = ["assigned", "picked_up", "out_for_delivery"];
/** Everything that is not finished. */
export const OPEN_STATUSES: readonly OrderStatus[] = [
  "unassigned",
  "assigned",
  "picked_up",
  "out_for_delivery",
  "failed",
];

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function isTerminal(status: OrderStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/** Statuses from which an order can be (re)assigned to a driver. */
export function canAssignFrom(status: OrderStatus): boolean {
  return canTransition(status, "assigned") || status === "assigned";
}

/** The forward steps a driver performs on their own order. */
export const DRIVER_STEPS: Partial<Record<OrderStatus, { to: OrderStatus; label: string }>> = {
  assigned: { to: "picked_up", label: "Mark picked up" },
  picked_up: { to: "out_for_delivery", label: "Start delivery" },
  out_for_delivery: { to: "delivered", label: "Mark delivered" },
};

export function nextDriverStep(status: OrderStatus) {
  return DRIVER_STEPS[status] ?? null;
}

/** Whether a driver may move an order they hold from `from` to `to` (forward steps + failing it). */
export function isDriverTransition(from: OrderStatus, to: OrderStatus): boolean {
  if (DRIVER_STEPS[from]?.to === to) return true;
  return to === "failed" && (from === "picked_up" || from === "out_for_delivery");
}

const EVENT_FOR_TARGET: Record<OrderStatus, DeliveryEventType> = {
  unassigned: "unassigned",
  assigned: "assigned",
  picked_up: "picked_up",
  out_for_delivery: "out_for_delivery",
  delivered: "delivered",
  failed: "failed",
  cancelled: "cancelled",
};

export function eventTypeForTarget(to: OrderStatus): DeliveryEventType {
  return EVENT_FOR_TARGET[to];
}
