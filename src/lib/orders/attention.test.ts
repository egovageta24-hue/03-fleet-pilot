import { describe, expect, it } from "vitest";
import { attentionReasons, attentionScore } from "./attention";

const now = new Date("2026-10-15T10:00:00Z");
const at = (m: number) => new Date(now.getTime() + m * 60_000);
type Input = Parameters<typeof attentionReasons>[0];
const base: Input = { status: "assigned", priority: "normal", windowEnd: at(300), openExceptions: 0 };

describe("attentionReasons", () => {
  it("is empty for a healthy order and for finished orders", () => {
    expect(attentionReasons(base, now, 45)).toEqual([]);
    expect(attentionReasons({ ...base, status: "delivered", windowEnd: at(-200), openExceptions: 0 }, now, 45)).toEqual([]);
    expect(attentionReasons({ ...base, status: "cancelled", windowEnd: at(-200) }, now, 45)).toEqual([]);
  });

  it("lists every reason that applies", () => {
    const r = attentionReasons({ status: "unassigned", priority: "high", windowEnd: at(-10), openExceptions: 2 }, now, 45);
    expect(r.map((x) => x.kind)).toEqual(["overdue", "unassigned", "exception"]);
    expect(r[0].label).toBe("Overdue 10m");
    expect(r[2].label).toBe("2 open exceptions");
  });

  it("flags failed deliveries and at-risk windows", () => {
    expect(attentionReasons({ ...base, status: "failed" }, now, 45).map((x) => x.kind)).toEqual(["failed"]);
    expect(attentionReasons({ ...base, windowEnd: at(20) }, now, 45).map((x) => x.kind)).toEqual(["at_risk"]);
  });
});

describe("attentionScore", () => {
  it("ranks overdue above failed above unassigned above exception above at-risk", () => {
    const score = (o: Partial<Input>) => attentionScore({ ...base, ...o }, now, 45);
    const overdue = score({ windowEnd: at(-5) });
    const failed = score({ status: "failed" });
    const unassigned = score({ status: "unassigned" });
    const exception = score({ openExceptions: 1 });
    const risk = score({ windowEnd: at(30) });
    expect(overdue).toBeGreaterThan(failed);
    expect(failed).toBeGreaterThan(unassigned);
    expect(unassigned).toBeGreaterThan(exception);
    expect(exception).toBeGreaterThan(risk);
    expect(risk).toBeGreaterThan(0);
  });

  it("lets priority and deadline break ties between the same reason", () => {
    const urgent = attentionScore({ status: "unassigned", priority: "urgent", windowEnd: at(120), openExceptions: 0 }, now, 45);
    const normal = attentionScore({ status: "unassigned", priority: "normal", windowEnd: at(120), openExceptions: 0 }, now, 45);
    const soon = attentionScore({ status: "unassigned", priority: "normal", windowEnd: at(60), openExceptions: 0 }, now, 45);
    expect(urgent).toBeGreaterThan(normal);
    expect(soon).toBeGreaterThan(normal);
  });

  it("is zero when nothing needs attention", () => {
    expect(attentionScore(base, now, 45)).toBe(0);
  });
});
