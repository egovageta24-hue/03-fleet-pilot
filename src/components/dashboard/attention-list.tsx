"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2Icon, UserPlusIcon } from "lucide-react";
import { AssignDriverDialog, type AssignTarget } from "@/components/orders/assign-driver-dialog";
import { PriorityBadge, StatusBadge } from "@/components/shared/badges";
import { Button } from "@/components/ui/button";
import { formatWindow, orderTiming, TIMING_TEXT_CLASS } from "@/lib/orders/timing";
import { cn } from "@/lib/utils";
import type { AttentionItem } from "@/server/queries/dashboard";
import type { AssignableDriver } from "@/server/queries/drivers";

type Props = {
  items: AttentionItem[];
  total: number;
  drivers: AssignableDriver[];
  canAssign: boolean;
  tz: string;
  nowIso: string;
  atRiskMinutes: number;
};

export function AttentionList({ items, total, drivers, canAssign, tz, nowIso, atRiskMinutes }: Props) {
  const now = new Date(nowIso);
  const [target, setTarget] = useState<AssignTarget | null>(null);

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
        <CheckCircle2Icon className="size-8 text-success" />
        <p className="font-medium">Nothing needs attention</p>
        <p className="text-sm text-muted-foreground">Every open order is assigned and on schedule.</p>
      </div>
    );
  }

  return (
    <>
      <ul className="divide-y">
        {items.map(({ order: o, reasons }) => {
          const worst = reasons.some((r) => r.tone === "danger") ? "danger" : "warn";
          const timing = orderTiming({ status: o.status, windowEnd: o.windowEnd }, now, atRiskMinutes);
          const needsDriver = o.status === "unassigned" || o.status === "failed";
          return (
            <li
              key={o.id}
              className={cn(
                "flex flex-wrap items-center gap-x-4 gap-y-2 border-l-4 px-3 py-3 sm:px-4",
                worst === "danger" ? "border-l-red-500" : "border-l-amber-400",
              )}
            >
              <div className="min-w-0 flex-1 basis-60">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/orders/${o.id}`} className="font-mono text-[13px] font-semibold hover:text-primary hover:underline">
                    {o.reference}
                  </Link>
                  <PriorityBadge priority={o.priority} />
                  <StatusBadge status={o.status} />
                </div>
                <p className="mt-0.5 truncate text-sm">
                  {o.customerName} <span className="text-muted-foreground">· {o.areaName}</span>
                </p>
                <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label="Reasons">
                  {reasons.map((r) => (
                    <li
                      key={r.kind}
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
                        r.tone === "danger"
                          ? "bg-red-50 text-red-700 ring-red-200"
                          : "bg-warning-soft text-warning-foreground ring-warning-border",
                      )}
                    >
                      {r.label}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="text-right text-xs tabular-nums">
                <p>{formatWindow(o.windowStart, o.windowEnd, tz)}</p>
                {/* overdue / at-risk are already shown as reason pills; only add the countdown when on schedule */}
                {timing.tone === "ok" && <p className={TIMING_TEXT_CLASS[timing.tone]}>{timing.label}</p>}
              </div>

              <div className="flex w-24 justify-end">
                {needsDriver && canAssign ? (
                  <Button
                    size="sm"
                    onClick={() =>
                      setTarget({
                        id: o.id,
                        reference: o.reference,
                        status: o.status,
                        driverId: o.driverId,
                        driverName: o.driverName,
                        areaId: o.areaId,
                      })
                    }
                  >
                    <UserPlusIcon /> {o.driverId ? "Reassign" : "Assign"}
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" asChild>
                    <Link href={`/orders/${o.id}`}>Open</Link>
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {total > items.length && (
        <div className="border-t px-4 py-2.5 text-center text-sm">
          <Link href="/orders?attention=1&sort=window&dir=asc" className="font-medium text-primary hover:underline">
            View all {total} orders needing attention
          </Link>
        </div>
      )}
      {target && (
        <AssignDriverDialog open onOpenChange={(o) => !o && setTarget(null)} targets={[target]} drivers={drivers} />
      )}
    </>
  );
}
