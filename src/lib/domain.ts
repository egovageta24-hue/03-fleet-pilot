// Single source of truth for domain enums. Plain TS (no DB / server imports) so it
// can be shared by the Drizzle schema, Zod validation and client components.

export const USER_ROLES = ["admin", "dispatcher", "manager", "driver"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const DRIVER_AVAILABILITIES = ["available", "on_break", "off_duty"] as const;
export type DriverAvailability = (typeof DRIVER_AVAILABILITIES)[number];

export const VEHICLE_TYPES = ["bike", "scooter", "car", "van", "truck"] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];

export const VEHICLE_STATUSES = ["active", "maintenance", "retired"] as const;
export type VehicleStatus = (typeof VEHICLE_STATUSES)[number];

export const ORDER_STATUSES = [
  "unassigned",
  "assigned",
  "picked_up",
  "out_for_delivery",
  "delivered",
  "failed",
  "cancelled",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_PRIORITIES = ["normal", "high", "urgent"] as const;
export type OrderPriority = (typeof ORDER_PRIORITIES)[number];

export const ASSIGNMENT_STATUSES = ["active", "replaced", "completed", "cancelled"] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

export const EVENT_TYPES = [
  "created",
  "assigned",
  "reassigned",
  "unassigned",
  "picked_up",
  "out_for_delivery",
  "delivered",
  "failed",
  "cancelled",
  "exception_raised",
  "exception_resolved",
  "priority_changed",
  "note",
] as const;
export type DeliveryEventType = (typeof EVENT_TYPES)[number];

export const EXCEPTION_TYPES = [
  "address_issue",
  "customer_unavailable",
  "damaged_package",
  "delayed",
  "vehicle_issue",
  "delivery_refused",
  "other",
] as const;
export type ExceptionType = (typeof EXCEPTION_TYPES)[number];

export const EXCEPTION_SEVERITIES = ["warning", "critical"] as const;
export type ExceptionSeverity = (typeof EXCEPTION_SEVERITIES)[number];

export const EXCEPTION_STATUSES = ["open", "resolved"] as const;
export type ExceptionStatus = (typeof EXCEPTION_STATUSES)[number];
