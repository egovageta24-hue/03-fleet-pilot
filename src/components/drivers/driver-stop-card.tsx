"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { AlertTriangleIcon, ArrowRightIcon, BoxesIcon, ClockIcon, ExternalLinkIcon, Loader2Icon, MapPinIcon, PhoneIcon, StickyNoteIcon } from "lucide-react";
import { advanceOrderAction } from "@/app/(app)/orders/actions";
import { ProblemDialog } from "@/components/orders/order-actions";
import { ExceptionFlag, PriorityBadge, StatusBadge } from "@/components/shared/badges";
import { Button } from "@/components/ui/button";
import { nextDriverStep } from "@/lib/orders/state-machine";
import { formatWindow, orderTiming, TIMING_TEXT_CLASS } from "@/lib/orders/timing";
import { cn } from "@/lib/utils";
import type { RunStop } from "@/server/queries/drivers";

type Props = {
  stop: RunStop;
  index: number;
  /** The stop the driver should work on now (first in sequence). */
  isNext: boolean;
  tz: string;
  nowIso: string;
  atRiskMinutes: number;
};

/** One stop in a driver's run: customer details, the one next action, and "report a problem". */
export function DriverStopCard({ stop: s, index, isNext, tz, nowIso, atRiskMinutes }: Props) {
  const [pending, startTransition] = useTransition();
  const [problemOpen, setProblemOpen] = useState(false);
  const step = nextDriverStep(s.status);
  const timing = orderTiming({ status: s.status, windowEnd: s.windowEnd }, new Date(nowIso), atRiskMinutes);
  const awaitingDispatch = s.status === "failed";
  const canFail = s.status === "picked_up" || s.status === "out_for_delivery";
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${s.addressLine}, ${s.postcode}`)}`;

  function advance() {
    if (!step) return;
    startTransition(async () => {
      const res = await advanceOrderAction({ orderId: s.orderId, to: step.to });
      if (res.ok) toast.success(`${s.reference}: ${step.label.toLowerCase()}`);
      else toast.error(res.error);
    });
  }

  return (
    <article
      aria-label={`Stop ${index + 1}: ${s.customerName}`}
      className={cn(
        "rounded-xl border bg-card p-4 shadow-xs",
        isNext && !awaitingDispatch && "border-primary/50 ring-1 ring-primary/30",
        awaitingDispatch && "border-red-200 bg-red-50/40",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
            isNext && !awaitingDispatch ? "bg-primary text-primary-foreground" : "bg-slate-900 text-white",
          )}
        >
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/orders/${s.orderId}`} className="font-mono text-sm font-semibold hover:text-primary hover:underline">
              {s.reference}
            </Link>
            <StatusBadge status={s.status} />
            <PriorityBadge priority={s.priority} />
            <ExceptionFlag count={s.openExceptions} />
          </div>
          <h3 className="mt-1 text-lg font-semibold leading-tight">{s.customerName}</h3>
        </div>
      </div>

      <dl className="mt-3 grid gap-2 text-sm">
        <div className="flex items-start gap-2">
          <MapPinIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <dd className="flex-1">
            {s.addressLine}, {s.postcode}
            <span className="text-muted-foreground"> · {s.areaCode}</span>
            <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="ml-2 inline-flex items-center gap-1 text-xs text-primary hover:underline">
              Open in maps <ExternalLinkIcon className="size-3" />
            </a>
          </dd>
        </div>
        <div className="flex items-center gap-2">
          <ClockIcon className="size-4 shrink-0 text-muted-foreground" />
          <dd className="tabular-nums">
            {formatWindow(s.windowStart, s.windowEnd, tz)}
            {timing.tone !== "none" && <span className={cn("ml-2 text-xs", TIMING_TEXT_CLASS[timing.tone])}>{timing.label}</span>}
          </dd>
        </div>
        {s.customerPhone && (
          <div className="flex items-center gap-2">
            <PhoneIcon className="size-4 shrink-0 text-muted-foreground" />
            <dd>
              <a href={`tel:${s.customerPhone}`} className="font-medium text-primary hover:underline">
                {s.customerPhone}
              </a>
            </dd>
          </div>
        )}
        {s.notes && (
          <div className="flex items-start gap-2 rounded-md bg-warning-soft px-2.5 py-1.5 text-warning-foreground">
            <StickyNoteIcon className="mt-0.5 size-4 shrink-0" />
            <dd>{s.notes}</dd>
          </div>
        )}
      </dl>

      {awaitingDispatch ? (
        <p className="mt-4 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
          Delivery failed. Dispatch has been notified and will rebook or reassign this order.
        </p>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          {step && (
            <Button size="lg" className="h-11 flex-1 basis-48 text-base" onClick={advance} disabled={pending}>
              {pending ? <Loader2Icon className="animate-spin" /> : <ArrowRightIcon />}
              {step.label}
            </Button>
          )}
          <Button size="lg" variant="outline" className="h-11" onClick={() => setProblemOpen(true)}>
            <AlertTriangleIcon /> Report problem
          </Button>
          <span className="sr-only" aria-live="polite">
            {pending ? "Updating" : ""}
          </span>
        </div>
      )}
      <p className="mt-2 hidden text-xs text-muted-foreground sm:flex sm:items-center sm:gap-1.5">
        <BoxesIcon className="size-3.5" /> Packages and weight on the order page
      </p>

      {problemOpen && <ProblemDialog open onOpenChange={(o) => !o && setProblemOpen(false)} orderId={s.orderId} canFail={canFail} />}
    </article>
  );
}
