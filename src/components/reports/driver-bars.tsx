import { DriverAvatar } from "@/components/shared/driver-avatar";

type Row = { driverId: string; name: string; delivered: number; onTime: number; onTimeRate: number };

/**
 * On-time rate per driver as meters: one hue (the track is a lighter step of the same ramp), the
 * value at the tip. Sorted by volume so the drivers who delivered most are first.
 */
export function DriverBars({ rows }: { rows: Row[] }) {
  if (rows.length === 0) return <p className="py-8 text-center text-sm text-muted-foreground">No deliveries in this range.</p>;

  return (
    <ul className="grid gap-3">
      {rows.map((r) => {
        const pct = Math.round(r.onTimeRate * 100);
        return (
          <li key={r.driverId} className="grid grid-cols-[minmax(0,9.5rem)_1fr_auto] items-center gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <DriverAvatar name={r.name} size="xs" />
              <span className="truncate">{r.name}</span>
            </span>
            <span className="h-2 overflow-hidden rounded-full bg-indigo-100" role="img" aria-label={`${pct}% on time`}>
              <span className="block h-full rounded-full bg-indigo-600" style={{ width: `${pct}%` }} />
            </span>
            <span className="w-28 text-right text-xs tabular-nums text-muted-foreground">
              <span className="font-semibold text-foreground">{pct}%</span> · {r.onTime}/{r.delivered}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
