import Link from "next/link";
import { DriverAvatar } from "@/components/shared/driver-avatar";
import { VehicleIcon } from "@/components/shared/vehicle-icon";
import { DRIVER_STATE_META } from "@/lib/status";
import { cn } from "@/lib/utils";
import type { DriverSummary } from "@/server/queries/drivers";

/** Compact "who is doing what" list. Sorted by activity so working drivers come first. */
export function DriverPanel({ drivers, canOpen }: { drivers: DriverSummary[]; canOpen: boolean }) {
  const sorted = [...drivers].sort(
    (a, b) => DRIVER_STATE_META[a.state].rank - DRIVER_STATE_META[b.state].rank || b.active - a.active || a.name.localeCompare(b.name),
  );

  const counts = sorted.reduce<Record<string, number>>((acc, d) => ((acc[d.state] = (acc[d.state] ?? 0) + 1), acc), {});
  const working = (counts.on_route ?? 0) + (counts.loaded ?? 0) + (counts.assigned ?? 0);

  return (
    <div>
      <p className="border-b px-4 py-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{working}</span> working ·{" "}
        <span className="font-medium text-foreground">{counts.idle ?? 0}</span> available ·{" "}
        <span className="font-medium text-foreground">{(counts.on_break ?? 0) + (counts.off_duty ?? 0)}</span> away
      </p>
      <ul className="divide-y">
        {sorted.map((d) => {
          const meta = DRIVER_STATE_META[d.state];
          const inner = (
            <div className="flex items-center gap-3 px-4 py-2.5">
              <DriverAvatar name={d.name} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{d.name}</span>
                  {d.vehicle && <VehicleIcon type={d.vehicle.type} className="size-3.5 shrink-0 text-muted-foreground" />}
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {d.active > 0 ? `${d.active} active` : "No active orders"}
                  {d.deliveredToday > 0 ? ` · ${d.deliveredToday} delivered` : ""}
                  {d.nextStop ? ` · next ${d.nextStop.areaCode}` : ""}
                </p>
              </div>
              {d.overdue > 0 && (
                <span className="rounded-full bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-200">
                  {d.overdue} late
                </span>
              )}
              <span
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
                  meta.badge,
                )}
              >
                <span aria-hidden className={cn("size-1.5 rounded-full", meta.dot)} />
                {meta.label}
              </span>
            </div>
          );
          return (
            <li key={d.id}>
              {canOpen ? (
                <Link href={`/drivers/${d.id}`} className="block transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none">
                  {inner}
                </Link>
              ) : (
                inner
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
