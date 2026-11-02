import { describe, expect, it } from "vitest";
import { needsTimingAttention, orderTiming } from "./timing";

const now = new Date("2026-10-15T10:00:00Z");
const at = (mins: number) => new Date(now.getTime() + mins * 60_000);

describe("orderTiming", () => {
  it("flags an open order whose window has passed as overdue", () => {
    expect(orderTiming({ status: "out_for_delivery", windowEnd: at(-12) }, now, 45)).toMatchObject({
      tone: "overdue",
      label: "Overdue 12m",
    });
  });

  it("flags an open order ending within the threshold as at risk, and later ones as ok", () => {
    expect(orderTiming({ status: "assigned", windowEnd: at(30) }, now, 45)).toMatchObject({ tone: "risk", label: "Due in 30m" });
    expect(orderTiming({ status: "assigned", windowEnd: at(45) }, now, 45).tone).toBe("risk"); // boundary is inclusive
    expect(orderTiming({ status: "assigned", windowEnd: at(46) }, now, 45).tone).toBe("ok");
    expect(orderTiming({ status: "unassigned", windowEnd: at(135) }, now, 45).label).toBe("Due in 2h 15m");
  });

  it("compares delivered orders with their window end", () => {
    const windowEnd = at(-60);
    expect(orderTiming({ status: "delivered", windowEnd, deliveredAt: at(-75) }, now, 45)).toMatchObject({ tone: "done", label: "On time" });
    expect(orderTiming({ status: "delivered", windowEnd, deliveredAt: at(-35) }, now, 45)).toMatchObject({ tone: "late", label: "Late 25m" });
  });

  it("ignores cancelled orders", () => {
    expect(orderTiming({ status: "cancelled", windowEnd: at(-500) }, now, 45).tone).toBe("none");
  });
});

describe("needsTimingAttention", () => {
  it("is true only for open orders that are overdue or at risk", () => {
    expect(needsTimingAttention({ status: "assigned", windowEnd: at(10) }, now, 45)).toBe(true);
    expect(needsTimingAttention({ status: "assigned", windowEnd: at(200) }, now, 45)).toBe(false);
    expect(needsTimingAttention({ status: "delivered", windowEnd: at(-100) }, now, 45)).toBe(false);
    expect(needsTimingAttention({ status: "cancelled", windowEnd: at(-100) }, now, 45)).toBe(false);
  });
});
