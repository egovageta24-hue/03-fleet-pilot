"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangleIcon, UserPlusIcon } from "lucide-react";
import { AssignDriverDialog, type AssignTarget } from "@/components/orders/assign-driver-dialog";
import { ExceptionFlag, PriorityBadge } from "@/components/shared/badges";
import { DriverAvatar } from "@/components/shared/driver-avatar";
import { Button } from "@/components/ui/button";
import type { OrderStatus } from "@/lib/domain";
import { formatWindow, orderTiming, TIMING_TEXT_CLASS } from "@/lib/orders/timing";
import { ORDER_STATUS_META } from "@/lib/status";
import { cn } from "@/lib/utils";
import type { AssignableDriver } from "@/server/queries/drivers";
import type { OrderListRow } from "@/server/queries/orders";

const COLUMNS: OrderStatus[] = ["unassigned", "assigned", "picked_up", "out_for_delivery", "failed", "delivered"];

type Props = {
  orders: OrderListRow[];
  drivers: AssignableDriver[];
  view: "status" | "driver";
  canAssign: boolean;
  tz: string;
  nowIso: string;
  atRiskMinutes: number;
};

function toTarget(o: OrderListRow): AssignTarget {
  return { id: o.id, reference: o.reference, status: o.status, driverId: o.driverId, driverName: o.driverName, areaId: o.areaId };
}

type CardProps = {
  o: OrderListRow;
  showDriver: boolean;
  now: Date;
  tz: string;
  atRiskMinutes: number;
  canAssign: boolean;
  onAssign: (t: AssignTarget) => void;
};

function BoardCard({ o, showDriver, now, tz, atRiskMinutes, canAssign, onAssign }: CardProps) {
  const t = orderTiming({ status: o.status, windowEnd: o.windowEnd }, now, atRiskMinutes);
  const hot = o.status === "unassigned" || o.status === "failed" || o.openExceptions > 0;
  const canAct = canAssign && (o.status === "unassigned" || o.status === "failed");
  return (
    <article
      className={cn(
        "rounded-lg border bg-card p-2.5 shadow-xs transition-shadow hover:shadow-sm",
        hot && "border-l-4",
        o.status === "failed" ? "border-l-red-500" : hot && "border-l-amber-400",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <Link href={`/orders/${o.id}`} className="font-mono text-[13px] font-semibold hover:text-primary hover:underline">
          {o.reference}
        </Link>
        <div className="flex items-center gap-1">
          <PriorityBadge priority={o.priority} />
          <ExceptionFlag count={o.openExceptions} />
        </div>
      </div>
      <p className="mt-1 truncate text-sm font-medium">{o.customerName}</p>
      <p className="truncate text-xs text-muted-foreground">
        {o.addressLine} · {o.areaCode}
      </p>
      <div className="mt-2 flex items-end justify-between gap-2">
        <div className="text-xs tabular-nums">
          <p>{formatWindow(o.windowStart, o.windowEnd, tz)}</p>
          {t.tone !== "none" && t.tone !== "done" && <p className={TIMING_TEXT_CLASS[t.tone]}>{t.label}</p>}
        </div>
        {canAct ? (
          <Button size="xs" onClick={() => onAssign(toTarget(o))}>
            <UserPlusIcon /> {o.driverId ? "Reassign" : "Assign"}
          </Button>
        ) : showDriver && o.driverName ? (
          <span className="inline-flex items-center gap-1.5 text-xs">
            <DriverAvatar name={o.driverName} size="xs" />
            <span className="max-w-24 truncate">{o.driverName}</span>
          </span>
        ) : null}
      </div>
    </article>
  );
}

export function BoardView({ orders, drivers, view, canAssign, tz, nowIso, atRiskMinutes }: Props) {
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const [target, setTarget] = useState<AssignTarget | null>(null);
  const shared = { now, tz, atRiskMinutes, canAssign, onAssign: setTarget };

  const byStatus = useMemo(() => {
    const map = new Map<OrderStatus, OrderListRow[]>();
    for (const o of orders) map.set(o.status, [...(map.get(o.status) ?? []), o]);
    return map;
  }, [orders]);

  const lanes = useMemo(() => {
    const held = orders.filter((o) => o.driverId && o.status !== "delivered" && o.status !== "cancelled");
    const done = new Map<string, number>();
    for (const o of orders) if (o.driverId && o.status === "delivered") done.set(o.driverId, (done.get(o.driverId) ?? 0) + 1);
    return drivers
      .map((d) => ({ driver: d, cards: held.filter((o) => o.driverId === d.id), delivered: done.get(d.id) ?? 0 }))
      .filter((l) => l.cards.length > 0 || (!l.driver.blockedReason && l.driver.availability !== "off_duty"))
      .sort((a, b) => b.cards.length - a.cards.length || a.driver.name.localeCompare(b.driver.name));
  }, [orders, drivers]);

  const lane = "flex w-72 shrink-0 snap-start flex-col rounded-xl bg-slate-100/80 p-2";

  return (
    <>
      {/* `relative` so absolutely positioned descendants (sr-only text) are clipped here too, not the page. */}
      <div className="relative -mx-3 overflow-x-auto px-3 pb-3 sm:-mx-4 sm:px-4 lg:mx-0 lg:px-0" tabIndex={0} role="region" aria-label={view === "status" ? "Delivery board by status" : "Delivery board by driver"}>
        <div className="flex snap-x snap-mandatory items-start gap-3">
          {view === "status" &&
            COLUMNS.map((status) => {
              const cards = byStatus.get(status) ?? [];
              const meta = ORDER_STATUS_META[status];
              return (
                <section key={status} className={lane} aria-label={`${meta.label}, ${cards.length} orders`}>
                  <header className="flex items-center gap-2 px-1.5 pb-2 pt-1">
                    <span aria-hidden className={cn("size-2.5 rounded-full", meta.dot)} />
                    <h2 className="text-sm font-semibold">{meta.label}</h2>
                    <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-xs font-medium tabular-nums">{cards.length}</span>
                  </header>
                  <div className="flex max-h-[70vh] flex-col gap-2 overflow-y-auto">
                    {cards.length === 0 ? (
                      <p className="px-2 py-6 text-center text-xs text-muted-foreground">Nothing here</p>
                    ) : (
                      cards.map((o) => <BoardCard key={o.id} o={o} showDriver {...shared} />)
                    )}
                  </div>
                </section>
              );
            })}

          {view === "driver" && (
            <>
              <section className={cn(lane, "bg-warning-soft ring-1 ring-warning-border")} aria-label="Unassigned orders">
                <header className="flex items-center gap-2 px-1.5 pb-2 pt-1">
                  <AlertTriangleIcon aria-hidden className="size-4 text-warning-foreground" />
                  <h2 className="text-sm font-semibold text-warning-foreground">Unassigned</h2>
                  <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-xs font-medium tabular-nums">{(byStatus.get("unassigned") ?? []).length}</span>
                </header>
                <div className="flex max-h-[70vh] flex-col gap-2 overflow-y-auto">
                  {(byStatus.get("unassigned") ?? []).map((o) => (
                    <BoardCard key={o.id} o={o} showDriver={false} {...shared} />
                  ))}
                  {(byStatus.get("unassigned") ?? []).length === 0 && <p className="px-2 py-6 text-center text-xs text-muted-foreground">All orders have a driver</p>}
                </div>
              </section>
              {lanes.map(({ driver, cards, delivered }) => (
                <section key={driver.id} className={lane} aria-label={`${driver.name}, ${cards.length} orders`}>
                  <header className="flex items-center gap-2 px-1.5 pb-2 pt-1">
                    <DriverAvatar name={driver.name} size="xs" />
                    <h2 className="truncate text-sm font-semibold">{driver.name}</h2>
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">{delivered} done</span>
                    <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-xs font-medium tabular-nums">{cards.length}</span>
                  </header>
                  <div className="flex max-h-[70vh] flex-col gap-2 overflow-y-auto">
                    {cards.length === 0 ? <p className="px-2 py-6 text-center text-xs text-muted-foreground">No active orders</p> : cards.map((o) => <BoardCard key={o.id} o={o} showDriver={false} {...shared} />)}
                  </div>
                </section>
              ))}
            </>
          )}
        </div>
      </div>

      {target && <AssignDriverDialog open onOpenChange={(o) => !o && setTarget(null)} targets={[target]} drivers={drivers} />}
    </>
  );
}
