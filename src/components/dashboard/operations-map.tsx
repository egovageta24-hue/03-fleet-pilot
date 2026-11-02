import Link from "next/link";
import { initials } from "@/components/shared/driver-avatar";
import { ORDER_STATUS_META, DRIVER_STATE_META } from "@/lib/status";
import type { OrderStatus } from "@/lib/domain";
import type { MapArea, MapOrder } from "@/server/queries/dashboard";
import type { DriverSummary } from "@/server/queries/drivers";

/**
 * Stylised operational map (no map API in Phase 1). Zones come from the `areas` table, open
 * orders sit at their delivery address, and each working driver's pin sits at their next stop.
 * Pins are therefore approximate: real positions arrive with GPS in Phase 2.
 */
export function OperationsMap({
  areas,
  orders,
  drivers,
  canOpenOrders,
}: {
  areas: MapArea[];
  orders: MapOrder[];
  drivers: DriverSummary[];
  canOpenOrders: boolean;
}) {
  const areaById = new Map(areas.map((a) => [a.id, a]));
  const counts = orders.reduce<Partial<Record<OrderStatus, number>>>((acc, o) => ((acc[o.status] = (acc[o.status] ?? 0) + 1), acc), {});

  // Draw the urgent things last so they are never hidden under routine dots.
  const rank: Record<OrderStatus, number> = { delivered: 0, cancelled: 0, assigned: 1, picked_up: 2, out_for_delivery: 3, failed: 4, unassigned: 5 };
  const dots = [...orders].sort((a, b) => rank[a.status] - rank[b.status]);

  const pins = drivers
    .filter((d) => d.availability !== "off_duty")
    .map((d) => {
      if (d.nextStop) return { d, x: d.nextStop.mapX, y: d.nextStop.mapY - 3.4, live: true };
      const home = d.homeAreaId ? areaById.get(d.homeAreaId) : undefined;
      return home ? { d, x: home.mapX + home.mapW / 2, y: home.mapY + home.mapH - 4, live: false } : null;
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  return (
    <div>
      <div className="mx-auto aspect-square w-full max-w-lg overflow-hidden rounded-xl border bg-slate-100">
        <svg viewBox="0 0 100 100" className="size-full" role="group" aria-label="Operations map: open orders and drivers by zone">
          {/* river, purely decorative */}
          <path d="M-2 46 C 22 42, 46 50, 102 45.5" fill="none" stroke="#bae6fd" strokeWidth="2.4" strokeLinecap="round" opacity=".7" />

          {areas.map((a) => {
            const hot = a.unassigned > 0;
            return (
              <g key={a.id}>
                <rect
                  x={a.mapX}
                  y={a.mapY}
                  width={a.mapW}
                  height={a.mapH}
                  rx="1.6"
                  fill={hot ? "#fffbeb" : "#ffffff"}
                  stroke={hot ? "#fcd34d" : "#e2e8f0"}
                  strokeWidth=".4"
                >
                  <title>{`${a.name}: ${a.openOrders} open order${a.openOrders === 1 ? "" : "s"}${hot ? `, ${a.unassigned} unassigned` : ""}`}</title>
                </rect>
                <text x={a.mapX + 1.6} y={a.mapY + 3.7} fontSize="2.7" fontWeight="700" fill="#64748b">
                  {a.code}
                </text>
                <text x={a.mapX + 1.6} y={a.mapY + 6.5} fontSize="1.9" fill="#94a3b8">
                  {a.name}
                </text>
                {hot && (
                  <g>
                    <circle cx={a.mapX + a.mapW - 3} cy={a.mapY + 3.2} r="2.1" fill="#f59e0b" />
                    <text x={a.mapX + a.mapW - 3} y={a.mapY + 3.95} fontSize="2.2" fontWeight="700" textAnchor="middle" fill="#451a03">
                      {a.unassigned}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {dots.map((o) => {
            const urgent = o.status === "unassigned" || o.status === "failed";
            const circle = (
              <g>
                {urgent && (
                  <circle cx={o.mapX} cy={o.mapY} r="2.4" fill="none" stroke={ORDER_STATUS_META[o.status].hex} strokeWidth=".4" opacity=".6" />
                )}
                <circle cx={o.mapX} cy={o.mapY} r={urgent ? 1.5 : 1.15} fill={ORDER_STATUS_META[o.status].hex} stroke="#fff" strokeWidth=".45" />
                <title>{`${o.reference} · ${o.customerName} · ${ORDER_STATUS_META[o.status].label}`}</title>
              </g>
            );
            return canOpenOrders ? (
              <Link key={o.id} href={`/orders/${o.id}`} aria-label={`${o.reference}, ${ORDER_STATUS_META[o.status].label}`}>
                {circle}
              </Link>
            ) : (
              <g key={o.id}>{circle}</g>
            );
          })}

          {pins.map(({ d, x, y, live }) => (
            <g key={d.id} opacity={live ? 1 : 0.55}>
              <circle cx={x} cy={y} r="2.9" fill="#312e81" stroke="#fff" strokeWidth=".7" />
              <text x={x} y={y + 0.8} fontSize="2.2" fontWeight="700" textAnchor="middle" fill="#fff">
                {initials(d.name)}
              </text>
              <title>{`${d.name} · ${DRIVER_STATE_META[d.state].label}${d.nextStop ? ` · next stop ${d.nextStop.reference}` : " · waiting in home area"}`}</title>
            </g>
          ))}
        </svg>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        {(["unassigned", "assigned", "picked_up", "out_for_delivery", "failed"] as OrderStatus[])
          .filter((s) => counts[s])
          .map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5">
              <span aria-hidden className="size-2.5 rounded-full" style={{ background: ORDER_STATUS_META[s].hex }} />
              {ORDER_STATUS_META[s].label}
              <span className="font-medium text-foreground">{counts[s]}</span>
            </span>
          ))}
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="flex size-4 items-center justify-center rounded-full bg-indigo-900 text-[8px] font-bold text-white ring-2 ring-white">
            AB
          </span>
          Driver at next stop
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="flex size-4 items-center justify-center rounded-full bg-indigo-900 text-[8px] font-bold text-white opacity-55 ring-2 ring-white">
            AB
          </span>
          Waiting in home zone
        </span>
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">Approximate positions. Live GPS tracking is planned for Phase 2.</p>
    </div>
  );
}
