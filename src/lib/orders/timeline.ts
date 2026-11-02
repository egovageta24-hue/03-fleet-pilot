import type { DeliveryEventType, ExceptionType, OrderPriority } from "@/lib/domain";
import { EXCEPTION_TYPE_LABEL, PRIORITY_META } from "@/lib/status";

export type TimelineTone = "neutral" | "info" | "success" | "warn" | "danger";

export type TimelineEvent = {
  type: DeliveryEventType;
  driverName: string | null;
  payload: Record<string, unknown>;
};

export type TimelineEntry = { title: string; detail: string | null; tone: TimelineTone };

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

/** Human wording for one delivery event. Tolerant of older events missing newer payload fields. */
export function describeEvent(e: TimelineEvent): TimelineEntry {
  const p = e.payload;
  const note = str(p.note);
  const who = str(p.toDriverName) ?? e.driverName;

  switch (e.type) {
    case "created": {
      const merchant = str(p.merchantName);
      const priority = str(p.priority) as OrderPriority | null;
      const bits = [merchant, priority && priority !== "normal" ? `${PRIORITY_META[priority].label} priority` : null];
      return { title: "Order created", detail: bits.filter(Boolean).join(" · ") || null, tone: "neutral" };
    }
    case "assigned":
      return { title: who ? `Assigned to ${who}` : "Assigned to a driver", detail: str(p.reason) ?? note, tone: "info" };
    case "reassigned": {
      const from = str(p.fromDriverName);
      return {
        title: who ? `Reassigned to ${who}` : "Reassigned to another driver",
        detail: [from ? `From ${from}` : null, str(p.reason) ?? note].filter(Boolean).join(" · ") || null,
        tone: "info",
      };
    }
    case "unassigned":
      return { title: "Returned to the unassigned pool", detail: note, tone: "warn" };
    case "picked_up":
      return { title: e.driverName ? `Picked up by ${e.driverName}` : "Picked up", detail: note, tone: "info" };
    case "out_for_delivery":
      return { title: "Out for delivery", detail: note, tone: "info" };
    case "delivered":
      return { title: "Delivered", detail: note, tone: "success" };
    case "failed":
      return { title: "Delivery failed", detail: note, tone: "danger" };
    case "cancelled":
      return { title: "Order cancelled", detail: note, tone: "neutral" };
    case "exception_raised": {
      const type = str(p.exceptionType) as ExceptionType | null;
      return {
        title: `Exception: ${type ? EXCEPTION_TYPE_LABEL[type] : "problem reported"}`,
        detail: str(p.description),
        tone: p.severity === "critical" ? "danger" : "warn",
      };
    }
    case "exception_resolved":
      return { title: "Exception resolved", detail: note, tone: "success" };
    case "priority_changed": {
      const from = str(p.from) as OrderPriority | null;
      const to = str(p.to) as OrderPriority | null;
      return {
        title: from && to ? `Priority changed: ${PRIORITY_META[from].label} → ${PRIORITY_META[to].label}` : "Priority changed",
        detail: null,
        tone: "neutral",
      };
    }
    case "note":
      return { title: "Note added", detail: note, tone: "neutral" };
  }
}
