import { describe, expect, it } from "vitest";
import { ORDER_STATUSES } from "@/lib/domain";
import {
  ASSIGNMENT_TARGETS,
  OPEN_STATUSES,
  TERMINAL_STATUSES,
  TRANSITIONS,
  canAssignFrom,
  canTransition,
  isDriverTransition,
  nextDriverStep,
} from "./state-machine";

describe("order state machine", () => {
  it("defines transitions for every status", () => {
    expect(Object.keys(TRANSITIONS).sort()).toEqual([...ORDER_STATUSES].sort());
  });

  it("never leaves a terminal status", () => {
    for (const s of TERMINAL_STATUSES) expect(TRANSITIONS[s]).toEqual([]);
  });

  it("only references real statuses", () => {
    for (const targets of Object.values(TRANSITIONS)) {
      for (const t of targets) expect(ORDER_STATUSES).toContain(t);
    }
  });

  it("has the happy path", () => {
    expect(canTransition("unassigned", "assigned")).toBe(true);
    expect(canTransition("assigned", "picked_up")).toBe(true);
    expect(canTransition("picked_up", "out_for_delivery")).toBe(true);
    expect(canTransition("out_for_delivery", "delivered")).toBe(true);
  });

  it("does not allow skipping steps or going backwards", () => {
    expect(canTransition("unassigned", "delivered")).toBe(false);
    expect(canTransition("assigned", "delivered")).toBe(false);
    expect(canTransition("delivered", "out_for_delivery")).toBe(false);
    expect(canTransition("out_for_delivery", "picked_up")).toBe(false);
    expect(canTransition("picked_up", "unassigned")).toBe(false);
  });

  it("allows recovery from failed", () => {
    expect(canTransition("failed", "assigned")).toBe(true);
    expect(canTransition("failed", "unassigned")).toBe(true);
    expect(canTransition("failed", "cancelled")).toBe(true);
    expect(canTransition("failed", "delivered")).toBe(false);
  });

  it("treats finished orders as not open and not assignable", () => {
    for (const s of TERMINAL_STATUSES) {
      expect(OPEN_STATUSES).not.toContain(s);
      expect(canAssignFrom(s)).toBe(false);
    }
    expect(canAssignFrom("assigned")).toBe(true); // reassignment
  });

  it("marks assignment moves so only the assignment services use them", () => {
    expect(ASSIGNMENT_TARGETS).toEqual(["assigned", "unassigned"]);
  });

  it("limits drivers to forward steps plus failing a started delivery", () => {
    expect(isDriverTransition("assigned", "picked_up")).toBe(true);
    expect(isDriverTransition("picked_up", "out_for_delivery")).toBe(true);
    expect(isDriverTransition("out_for_delivery", "delivered")).toBe(true);
    expect(isDriverTransition("picked_up", "failed")).toBe(true);
    expect(isDriverTransition("assigned", "failed")).toBe(false);
    expect(isDriverTransition("assigned", "delivered")).toBe(false);
    expect(isDriverTransition("failed", "assigned")).toBe(false);
    expect(nextDriverStep("assigned")?.to).toBe("picked_up");
    expect(nextDriverStep("delivered")).toBeNull();
  });
});
