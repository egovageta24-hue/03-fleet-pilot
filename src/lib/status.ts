import type {
  DriverAvailability,
  ExceptionSeverity,
  ExceptionType,
  OrderPriority,
  OrderStatus,
  VehicleType,
} from "@/lib/domain";

/**
 * Presentation for every status/priority. One map, used by every badge, chart and map
 * marker, so a status always looks the same everywhere. Amber is reserved for
 * "needs attention" (unassigned, high-priority, exceptions).
 */
type Tone = { label: string; badge: string; dot: string; hex: string };

export const ORDER_STATUS_META: Record<OrderStatus, Tone> = {
  unassigned: {
    label: "Unassigned",
    badge: "bg-warning-soft text-warning-foreground ring-warning-border",
    dot: "bg-amber-500",
    hex: "#f59e0b",
  },
  assigned: {
    label: "Assigned",
    badge: "bg-slate-100 text-slate-700 ring-slate-200",
    dot: "bg-slate-500",
    hex: "#64748b",
  },
  picked_up: {
    label: "Picked up",
    badge: "bg-sky-50 text-sky-800 ring-sky-200",
    dot: "bg-sky-500",
    hex: "#0ea5e9",
  },
  out_for_delivery: {
    label: "Out for delivery",
    badge: "bg-indigo-50 text-indigo-700 ring-indigo-200",
    dot: "bg-indigo-600",
    hex: "#4f46e5",
  },
  delivered: {
    label: "Delivered",
    badge: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    dot: "bg-emerald-500",
    hex: "#10b981",
  },
  failed: {
    label: "Failed",
    badge: "bg-red-50 text-red-700 ring-red-200",
    dot: "bg-red-500",
    hex: "#ef4444",
  },
  cancelled: {
    label: "Cancelled",
    badge: "bg-slate-50 text-slate-500 ring-slate-200",
    dot: "bg-slate-300",
    hex: "#cbd5e1",
  },
};

export const PRIORITY_META: Record<OrderPriority, { label: string; badge: string; rank: number }> = {
  normal: { label: "Normal", badge: "bg-slate-50 text-slate-600 ring-slate-200", rank: 0 },
  high: { label: "High", badge: "bg-warning-soft text-warning-foreground ring-warning-border", rank: 1 },
  urgent: { label: "Urgent", badge: "bg-red-50 text-red-700 ring-red-200", rank: 2 },
};

export const AVAILABILITY_META: Record<DriverAvailability, { label: string; badge: string; dot: string }> = {
  available: {
    label: "Available",
    badge: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    dot: "bg-emerald-500",
  },
  on_break: {
    label: "On break",
    badge: "bg-warning-soft text-warning-foreground ring-warning-border",
    dot: "bg-amber-500",
  },
  off_duty: {
    label: "Off duty",
    badge: "bg-slate-100 text-slate-500 ring-slate-200",
    dot: "bg-slate-400",
  },
};

/** Derived driver activity (from availability + the driver's orders). */
export const DRIVER_STATE_META: Record<
  "on_route" | "loaded" | "assigned" | "idle" | "on_break" | "off_duty",
  { label: string; badge: string; dot: string; rank: number }
> = {
  on_route: { label: "On route", badge: "bg-indigo-50 text-indigo-700 ring-indigo-200", dot: "bg-indigo-600", rank: 0 },
  loaded: { label: "Picked up", badge: "bg-sky-50 text-sky-800 ring-sky-200", dot: "bg-sky-500", rank: 1 },
  assigned: { label: "Assigned", badge: "bg-slate-100 text-slate-700 ring-slate-200", dot: "bg-slate-500", rank: 2 },
  idle: { label: "Available", badge: "bg-emerald-50 text-emerald-700 ring-emerald-200", dot: "bg-emerald-500", rank: 3 },
  on_break: { label: "On break", badge: "bg-warning-soft text-warning-foreground ring-warning-border", dot: "bg-amber-500", rank: 4 },
  off_duty: { label: "Off duty", badge: "bg-slate-100 text-slate-500 ring-slate-200", dot: "bg-slate-400", rank: 5 },
};

export const SEVERITY_META: Record<ExceptionSeverity, { label: string; badge: string }> = {
  warning: { label: "Warning", badge: "bg-warning-soft text-warning-foreground ring-warning-border" },
  critical: { label: "Critical", badge: "bg-red-50 text-red-700 ring-red-200" },
};

export const EXCEPTION_TYPE_LABEL: Record<ExceptionType, string> = {
  address_issue: "Address issue",
  customer_unavailable: "Customer unavailable",
  damaged_package: "Damaged package",
  delayed: "Delayed",
  vehicle_issue: "Vehicle issue",
  delivery_refused: "Delivery refused",
  other: "Other",
};

export const VEHICLE_TYPE_LABEL: Record<VehicleType, string> = {
  bike: "Cargo bike",
  scooter: "Scooter",
  car: "Car",
  van: "Van",
  truck: "Truck",
};

/** Board / filter ordering of statuses. */
export const STATUS_ORDER: readonly OrderStatus[] = [
  "unassigned",
  "assigned",
  "picked_up",
  "out_for_delivery",
  "delivered",
  "failed",
  "cancelled",
];
