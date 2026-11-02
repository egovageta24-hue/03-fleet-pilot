import type { OrderPriority, OrderStatus } from "@/lib/domain";
import { PRIORITY_META } from "@/lib/status";
import { isTerminal } from "./state-machine";
import { orderTiming } from "./timing";

export type AttentionReason = {
  kind: "overdue" | "at_risk" | "unassigned" | "failed" | "exception";
  label: string;
  tone: "danger" | "warn";
};

type Input = {
  status: OrderStatus;
  priority: OrderPriority;
  windowEnd: Date;
  openExceptions: number;
};

/** Why an order needs a human right now (empty = it does not). */
export function attentionReasons(o: Input, now: Date, atRiskMinutes: number): AttentionReason[] {
  if (isTerminal(o.status)) return [];
  const out: AttentionReason[] = [];

  const timing = orderTiming({ status: o.status, windowEnd: o.windowEnd }, now, atRiskMinutes);
  if (timing.tone === "overdue") out.push({ kind: "overdue", label: timing.label, tone: "danger" });
  if (o.status === "failed") out.push({ kind: "failed", label: "Delivery failed", tone: "danger" });
  if (o.status === "unassigned") out.push({ kind: "unassigned", label: "Unassigned", tone: "warn" });
  if (o.openExceptions > 0) {
    out.push({
      kind: "exception",
      label: `${o.openExceptions} open exception${o.openExceptions === 1 ? "" : "s"}`,
      tone: "warn",
    });
  }
  if (timing.tone === "risk") out.push({ kind: "at_risk", label: timing.label, tone: "warn" });
  return out;
}

const KIND_WEIGHT: Record<AttentionReason["kind"], number> = {
  overdue: 1000,
  failed: 600,
  unassigned: 400,
  exception: 300,
  at_risk: 200,
};

/** Higher = more urgent. Priority and an earlier deadline break ties. */
export function attentionScore(o: Input, now: Date, atRiskMinutes: number): number {
  const reasons = attentionReasons(o, now, atRiskMinutes);
  if (reasons.length === 0) return 0;
  const base = reasons.reduce((sum, r) => sum + KIND_WEIGHT[r.kind], 0);
  const minutesToDeadline = (o.windowEnd.getTime() - now.getTime()) / 60_000;
  // Earlier deadline => slightly higher; bounded so it never outweighs a reason.
  const urgency = Math.max(0, Math.min(99, 99 - minutesToDeadline / 10));
  return base + PRIORITY_META[o.priority].rank * 100 + urgency;
}
