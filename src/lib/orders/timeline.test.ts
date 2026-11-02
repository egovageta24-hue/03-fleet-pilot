import { describe, expect, it } from "vitest";
import { describeEvent } from "./timeline";

const ev = (type: Parameters<typeof describeEvent>[0]["type"], payload: Record<string, unknown> = {}, driverName: string | null = null) =>
  describeEvent({ type, payload, driverName });

describe("describeEvent", () => {
  it("names the driver on assignment and reassignment", () => {
    expect(ev("assigned", { toDriverName: "Mei Lin" })).toMatchObject({ title: "Assigned to Mei Lin", tone: "info" });
    expect(ev("reassigned", { toDriverName: "Tom Brennan", fromDriverName: "Mei Lin", reason: "Van broke down" })).toEqual({
      title: "Reassigned to Tom Brennan",
      detail: "From Mei Lin · Van broke down",
      tone: "info",
    });
  });

  it("copes with older events that lack newer payload fields", () => {
    expect(ev("reassigned", {}, "Tom Brennan")).toMatchObject({ title: "Reassigned to Tom Brennan", detail: null });
    expect(ev("assigned", {})).toMatchObject({ title: "Assigned to a driver" });
  });

  it("flags failures and critical exceptions as danger, warnings as warn", () => {
    expect(ev("failed", { note: "Nobody home" })).toMatchObject({ tone: "danger", detail: "Nobody home" });
    expect(ev("exception_raised", { exceptionType: "address_issue", severity: "critical", description: "Bad number" })).toEqual({
      title: "Exception: Address issue",
      detail: "Bad number",
      tone: "danger",
    });
    expect(ev("exception_raised", { exceptionType: "delayed", severity: "warning" }).tone).toBe("warn");
  });

  it("describes priority changes and creation", () => {
    expect(ev("priority_changed", { from: "normal", to: "urgent" }).title).toBe("Priority changed: Normal → Urgent");
    expect(ev("created", { merchantName: "Atlas Sports", priority: "high" })).toMatchObject({
      title: "Order created",
      detail: "Atlas Sports · High priority",
    });
  });
});
