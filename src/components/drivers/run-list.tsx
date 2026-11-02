"use client";

import { useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowDownIcon, ArrowUpIcon, PhoneIcon, RouteIcon } from "lucide-react";
import { moveStopAction } from "@/app/(app)/orders/actions";
import { ExceptionFlag, PriorityBadge, StatusBadge } from "@/components/shared/badges";
import { Button } from "@/components/ui/button";
import { formatWindow, orderTiming, TIMING_TEXT_CLASS } from "@/lib/orders/timing";
import { cn } from "@/lib/utils";
import type { RunStop } from "@/server/queries/drivers";

export function RunList({
  stops,
  canReorder,
  tz,
  nowIso,
  atRiskMinutes,
}: {
  stops: RunStop[];
  canReorder: boolean;
  tz: string;
  nowIso: string;
  atRiskMinutes: number;
}) {
  const now = new Date(nowIso);
  const [pending, startTransition] = useTransition();

  function move(assignmentId: string, direction: "up" | "down") {
    startTransition(async () => {
      const res = await moveStopAction({ assignmentId, direction });
      if (!res.ok) toast.error(res.error);
    });
  }

  if (stops.length === 0) {
    return (
      <p className="flex items-center gap-2 px-4 py-8 text-sm text-muted-foreground">
        <RouteIcon className="size-4" /> No orders in this driver&rsquo;s run right now.
      </p>
    );
  }

  return (
    <ol aria-label="Run, in stop order" className={cn("divide-y", pending && "opacity-70")}>
      {stops.map((s, i) => {
        const t = orderTiming({ status: s.status, windowEnd: s.windowEnd }, now, atRiskMinutes);
        return (
          <li key={s.assignmentId} className="flex items-start gap-3 px-4 py-3">
            <span
              aria-label={`Stop ${i + 1}`}
              className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white"
            >
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/orders/${s.orderId}`} className="font-mono text-[13px] font-semibold hover:text-primary hover:underline">
                  {s.reference}
                </Link>
                <StatusBadge status={s.status} />
                <PriorityBadge priority={s.priority} />
                <ExceptionFlag count={s.openExceptions} />
              </div>
              <p className="mt-0.5 text-sm font-medium">{s.customerName}</p>
              <p className="text-xs text-muted-foreground">
                {s.addressLine}, {s.postcode} · {s.areaCode}
              </p>
              <p className="mt-1 text-xs tabular-nums">
                {formatWindow(s.windowStart, s.windowEnd, tz)}
                {t.tone !== "none" && <span className={cn("ml-2", TIMING_TEXT_CLASS[t.tone])}>{t.label}</span>}
              </p>
              {s.customerPhone && (
                <a href={`tel:${s.customerPhone}`} className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline">
                  <PhoneIcon className="size-3" /> {s.customerPhone}
                </a>
              )}
            </div>
            {canReorder && (
              <div className="flex shrink-0 flex-col gap-1">
                <Button variant="outline" size="icon-xs" aria-label={`Move ${s.reference} up`} disabled={i === 0 || pending} onClick={() => move(s.assignmentId, "up")}>
                  <ArrowUpIcon />
                </Button>
                <Button variant="outline" size="icon-xs" aria-label={`Move ${s.reference} down`} disabled={i === stops.length - 1 || pending} onClick={() => move(s.assignmentId, "down")}>
                  <ArrowDownIcon />
                </Button>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
