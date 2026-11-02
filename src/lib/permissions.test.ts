import { describe, expect, it } from "vitest";
import { USER_ROLES } from "@/lib/domain";
import {
  PERMISSIONS,
  SECTION_PERMISSIONS,
  assertCan,
  can,
  canAccessSection,
  homePathFor,
  type Section,
} from "./permissions";

describe("permissions", () => {
  it("gives admins everything", () => {
    for (const p of PERMISSIONS) expect(can("admin", p)).toBe(true);
  });

  it("lets dispatchers run operations but not reports or settings", () => {
    for (const p of ["order:create", "order:assign", "order:cancel", "order:advance_any", "exception:resolve"] as const) {
      expect(can("dispatcher", p)).toBe(true);
    }
    for (const p of ["report:view", "report:export", "settings:manage", "user:manage"] as const) {
      expect(can("dispatcher", p)).toBe(false);
    }
  });

  it("lets managers see reports and assign, but not create, cancel or advance deliveries", () => {
    expect(can("manager", "report:export")).toBe(true);
    expect(can("manager", "order:assign")).toBe(true);
    expect(can("manager", "order:create")).toBe(false);
    expect(can("manager", "order:cancel")).toBe(false);
    expect(can("manager", "order:advance_any")).toBe(false);
    expect(can("manager", "settings:manage")).toBe(false);
  });

  it("confines drivers to their own deliveries", () => {
    expect(can("driver", "order:view_own")).toBe(true);
    expect(can("driver", "order:advance_own")).toBe(true);
    for (const p of ["order:view", "order:assign", "order:cancel", "report:view", "driver:view", "board:view"] as const) {
      expect(can("driver", p)).toBe(false);
    }
  });

  it("routes each role to a landing page it can open", () => {
    for (const role of USER_ROLES) expect(canAccessSection(role, homePathFor(role))).toBe(true);
    expect(homePathFor("driver")).toBe("/my-deliveries");
  });

  it("keeps drivers out of every staff section", () => {
    for (const section of Object.keys(SECTION_PERMISSIONS) as Section[]) {
      expect(canAccessSection("driver", section)).toBe(section === "/my-deliveries");
    }
  });

  it("assertCan throws forbidden", () => {
    expect(() => assertCan({ role: "driver" }, "order:assign")).toThrowError(/permission/);
    expect(() => assertCan({ role: "dispatcher" }, "order:assign")).not.toThrow();
  });
});
