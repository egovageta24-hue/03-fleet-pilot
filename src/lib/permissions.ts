import type { UserRole } from "@/lib/domain";
import { forbidden } from "@/lib/errors";

export const PERMISSIONS = [
  "dashboard:view",
  "order:view",
  "order:view_own",
  "order:create",
  "order:assign",
  "order:priority",
  "order:cancel",
  "order:advance_any",
  "order:advance_own",
  "exception:raise",
  "exception:resolve",
  "driver:view",
  "driver:manage",
  "board:view",
  "report:view",
  "report:export",
  "settings:view",
  "settings:manage",
  "user:manage",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  admin: PERMISSIONS,
  dispatcher: [
    "dashboard:view",
    "order:view",
    "order:create",
    "order:assign",
    "order:priority",
    "order:cancel",
    "order:advance_any",
    "exception:raise",
    "exception:resolve",
    "driver:view",
    "driver:manage",
    "board:view",
  ],
  manager: [
    "dashboard:view",
    "order:view",
    "order:assign",
    "order:priority",
    "exception:raise",
    "exception:resolve",
    "driver:view",
    "board:view",
    "report:view",
    "report:export",
    "settings:view",
  ],
  driver: ["order:view_own", "order:advance_own", "exception:raise"],
};

export function can(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/** The authenticated user as seen by services. `driverId` is set for driver-role users. */
export type Actor = {
  userId: string;
  role: UserRole;
  name: string;
  driverId: string | null;
};

/** Throw `forbidden` unless the actor's role holds the permission. */
export function assertCan(actor: Pick<Actor, "role">, permission: Permission): void {
  if (!can(actor.role, permission)) throw forbidden();
}

/** Which permission unlocks each top-level section; drives nav and route guards. */
export const SECTION_PERMISSIONS = {
  "/dashboard": "dashboard:view",
  "/orders": "order:view",
  "/drivers": "driver:view",
  "/board": "board:view",
  "/reports": "report:view",
  "/settings": "settings:view",
  "/my-deliveries": "order:view_own",
} as const satisfies Record<string, Permission>;

export type Section = keyof typeof SECTION_PERMISSIONS;

export function canAccessSection(role: UserRole, section: Section): boolean {
  return can(role, SECTION_PERMISSIONS[section]);
}

/** Landing page after login. */
export function homePathFor(role: UserRole): Section {
  return role === "driver" ? "/my-deliveries" : "/dashboard";
}
