import {
  AlertTriangleIcon,
  ArrowLeftRightIcon,
  BanIcon,
  CheckCircle2Icon,
  CircleDotIcon,
  FlagIcon,
  PackageCheckIcon,
  PackagePlusIcon,
  RouteIcon,
  StickyNoteIcon,
  TruckIcon,
  UserCheckIcon,
  UserMinusIcon,
  XCircleIcon,
  type LucideIcon,
} from "lucide-react";
import { formatDateTime } from "@/lib/dates";
import type { DeliveryEventType } from "@/lib/domain";
import { describeEvent, type TimelineTone } from "@/lib/orders/timeline";
import { cn } from "@/lib/utils";
import type { OrderDetail } from "@/server/queries/orders";

const ICONS: Record<DeliveryEventType, LucideIcon> = {
  created: PackagePlusIcon,
  assigned: UserCheckIcon,
  reassigned: ArrowLeftRightIcon,
  unassigned: UserMinusIcon,
  picked_up: PackageCheckIcon,
  out_for_delivery: TruckIcon,
  delivered: CheckCircle2Icon,
  failed: XCircleIcon,
  cancelled: BanIcon,
  exception_raised: AlertTriangleIcon,
  exception_resolved: CheckCircle2Icon,
  priority_changed: FlagIcon,
  note: StickyNoteIcon,
};

const TONE: Record<TimelineTone, string> = {
  neutral: "bg-slate-100 text-slate-600 ring-slate-200",
  info: "bg-indigo-50 text-indigo-600 ring-indigo-200",
  success: "bg-emerald-50 text-emerald-600 ring-emerald-200",
  warn: "bg-warning-soft text-warning-foreground ring-warning-border",
  danger: "bg-red-50 text-red-600 ring-red-200",
};

/** Vertical delivery timeline, newest first. */
export function OrderTimeline({ events, tz }: { events: OrderDetail["events"]; tz: string }) {
  if (events.length === 0) {
    return (
      <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <RouteIcon className="size-4" /> Nothing has happened to this order yet.
      </p>
    );
  }

  const items = [...events].reverse();
  return (
    <ol aria-label="Delivery timeline" className="relative space-y-0">
      {items.map((e, i) => {
        const d = describeEvent(e);
        const Icon = ICONS[e.type] ?? CircleDotIcon;
        const last = i === items.length - 1;
        return (
          <li key={e.id} className="relative flex gap-3 pb-5 last:pb-0">
            {!last && <span aria-hidden className="absolute left-[15px] top-8 bottom-0 w-px bg-border" />}
            <span className={cn("z-10 flex size-8 shrink-0 items-center justify-center rounded-full ring-1 ring-inset", TONE[d.tone])}>
              <Icon className="size-4" />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <p className="text-sm font-medium">{d.title}</p>
                <time dateTime={e.at.toISOString()} className="text-xs tabular-nums text-muted-foreground">
                  {formatDateTime(e.at, tz)}
                </time>
              </div>
              {d.detail && <p className="mt-0.5 text-sm text-muted-foreground">{d.detail}</p>}
              {e.byName && <p className="mt-0.5 text-xs text-muted-foreground">by {e.byName}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
