import { AlertTriangleIcon, ChevronsUpIcon, FlagIcon } from "lucide-react";
import type { DriverAvailability, ExceptionSeverity, OrderPriority, OrderStatus } from "@/lib/domain";
import { AVAILABILITY_META, ORDER_STATUS_META, PRIORITY_META, SEVERITY_META } from "@/lib/status";
import { cn } from "@/lib/utils";

const base =
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset";

export function StatusBadge({ status, className }: { status: OrderStatus; className?: string }) {
  const meta = ORDER_STATUS_META[status];
  return (
    <span className={cn(base, meta.badge, className)}>
      <span aria-hidden className={cn("size-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </span>
  );
}

/** Renders nothing for `normal` unless `showNormal` — normal is the unremarkable default. */
export function PriorityBadge({
  priority,
  showNormal = false,
  className,
}: {
  priority: OrderPriority;
  showNormal?: boolean;
  className?: string;
}) {
  if (priority === "normal" && !showNormal) return null;
  const meta = PRIORITY_META[priority];
  const Icon = priority === "urgent" ? ChevronsUpIcon : FlagIcon;
  return (
    <span className={cn(base, meta.badge, className)}>
      {priority !== "normal" && <Icon aria-hidden className="size-3" />}
      {meta.label}
    </span>
  );
}

export function AvailabilityBadge({ availability, className }: { availability: DriverAvailability; className?: string }) {
  const meta = AVAILABILITY_META[availability];
  return (
    <span className={cn(base, meta.badge, className)}>
      <span aria-hidden className={cn("size-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </span>
  );
}

export function SeverityBadge({ severity, className }: { severity: ExceptionSeverity; className?: string }) {
  const meta = SEVERITY_META[severity];
  return <span className={cn(base, meta.badge, className)}>{meta.label}</span>;
}

/** Amber exception marker with the number of open exceptions. */
export function ExceptionFlag({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      title={`${count} open exception${count === 1 ? "" : "s"}`}
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-warning-soft px-1.5 py-0.5 text-xs font-medium text-warning-foreground ring-1 ring-inset ring-warning-border",
        className,
      )}
    >
      <AlertTriangleIcon aria-hidden className="size-3" />
      <span className="sr-only">Open exceptions: </span>
      {count}
    </span>
  );
}
