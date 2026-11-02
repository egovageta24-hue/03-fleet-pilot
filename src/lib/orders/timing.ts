import { formatDuration, formatTime, minutesUntil } from "@/lib/dates";
import type { OrderStatus } from "@/lib/domain";
import { isTerminal } from "./state-machine";

export type TimingTone = "overdue" | "risk" | "ok" | "done" | "late" | "none";

export type OrderTiming = {
  tone: TimingTone;
  /** Short human label: "Overdue 12m", "Due in 25m", "On time"… */
  label: string;
  /** Minutes until the window ends (negative if past). Only for open orders. */
  minutesLeft: number | null;
};

type Input = {
  status: OrderStatus;
  windowEnd: Date | string;
  deliveredAt?: Date | string | null;
};

/**
 * One definition of lateness for the whole product.
 *  - open order:  overdue (window passed) → at risk (ends within `atRiskMinutes`) → ok
 *  - delivered:   on time / late by N minutes (compared with the window end)
 *  - cancelled:   no timing
 */
export function orderTiming(order: Input, now: Date, atRiskMinutes: number): OrderTiming {
  if (order.status === "cancelled") return { tone: "none", label: "—", minutesLeft: null };

  if (order.status === "delivered") {
    if (!order.deliveredAt) return { tone: "done", label: "Delivered", minutesLeft: null };
    const lateBy = (new Date(order.deliveredAt).getTime() - new Date(order.windowEnd).getTime()) / 60_000;
    return lateBy > 0
      ? { tone: "late", label: `Late ${formatDuration(lateBy)}`, minutesLeft: null }
      : { tone: "done", label: "On time", minutesLeft: null };
  }

  const left = minutesUntil(order.windowEnd, now);
  if (left < 0) return { tone: "overdue", label: `Overdue ${formatDuration(left)}`, minutesLeft: left };
  if (left <= atRiskMinutes) return { tone: "risk", label: `Due in ${formatDuration(left)}`, minutesLeft: left };
  return { tone: "ok", label: `Due in ${formatDuration(left)}`, minutesLeft: left };
}

/** `9:00 AM – 11:00 AM` in the company timezone. */
export function formatWindow(start: Date | string, end: Date | string, tz: string): string {
  return `${formatTime(start, tz)} – ${formatTime(end, tz)}`;
}

export const TIMING_TEXT_CLASS: Record<TimingTone, string> = {
  overdue: "text-red-600 font-medium",
  risk: "text-warning-foreground font-medium",
  ok: "text-muted-foreground",
  done: "text-success",
  late: "text-warning-foreground",
  none: "text-muted-foreground",
};

/** Is an open (not finished) order past, or close to, its deadline? */
export function needsTimingAttention(order: Input, now: Date, atRiskMinutes: number): boolean {
  if (isTerminal(order.status)) return false;
  const t = orderTiming(order, now, atRiskMinutes);
  return t.tone === "overdue" || t.tone === "risk";
}
