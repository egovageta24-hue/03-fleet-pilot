"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { AlertCircleIcon, Loader2Icon } from "lucide-react";
import { assignOrderAction, bulkAssignAction } from "@/app/(app)/orders/actions";
import { AvailabilityBadge } from "@/components/shared/badges";
import { DriverAvatar } from "@/components/shared/driver-avatar";
import { VehicleIcon } from "@/components/shared/vehicle-icon";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { OrderStatus } from "@/lib/domain";
import { cn } from "@/lib/utils";
import type { AssignableDriver } from "@/server/queries/drivers";

export type AssignTarget = {
  id: string;
  reference: string;
  status: OrderStatus;
  driverId: string | null;
  driverName: string | null;
  areaId: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** One order = assign/reassign. Several = bulk assign from the unassigned pool. */
  targets: AssignTarget[];
  drivers: AssignableDriver[];
  onDone?: () => void;
};

/** Higher is better: assignable, home area matches, lighter load. */
function rank(d: AssignableDriver, areaIds: Set<string>) {
  if (d.blockedReason) return -1000 + d.activeCount;
  let score = 100 - d.activeCount * 5;
  if (d.homeAreaId && areaIds.has(d.homeAreaId)) score += 40;
  if (d.availability === "available") score += 20;
  return score;
}

export function AssignDriverDialog({ open, onOpenChange, targets, drivers, onDone }: Props) {
  const single = targets.length === 1 ? targets[0] : null;
  const [driverId, setDriverId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [failures, setFailures] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  const areaIds = useMemo(() => new Set(targets.map((t) => t.areaId)), [targets]);
  const ordered = useMemo(
    () => [...drivers].sort((a, b) => rank(b, areaIds) - rank(a, areaIds) || a.name.localeCompare(b.name)),
    [drivers, areaIds],
  );
  const recommendedId = ordered[0] && !ordered[0].blockedReason ? ordered[0].id : null;

  const inProgress = single && (single.status === "picked_up" || single.status === "out_for_delivery");
  const isReassign = !!single && single.driverId !== null;
  const reasonMissing = !!inProgress && reason.trim().length === 0;

  function reset() {
    setDriverId(null);
    setReason("");
    setError(null);
    setFailures([]);
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  function submit() {
    if (!driverId) return;
    setError(null);
    setFailures([]);
    const driver = drivers.find((d) => d.id === driverId);

    startTransition(async () => {
      if (single) {
        const res = await assignOrderAction({
          orderId: single.id,
          driverId,
          reason: reason.trim() || undefined,
          expectedDriverId: single.driverId,
        });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        toast.success(`${single.reference} ${isReassign ? "reassigned" : "assigned"} to ${driver?.name ?? "driver"}`);
        handleOpenChange(false);
        onDone?.();
        return;
      }

      const res = await bulkAssignAction({ orderIds: targets.map((t) => t.id), driverId });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const refOf = new Map(targets.map((t) => [t.id, t.reference]));
      const failed = res.data.filter((r) => !r.ok);
      const okCount = res.data.length - failed.length;
      if (okCount > 0) toast.success(`${okCount} order${okCount === 1 ? "" : "s"} assigned to ${driver?.name ?? "driver"}`);
      if (failed.length === 0) {
        handleOpenChange(false);
      } else {
        setFailures(failed.map((f) => `${refOf.get(f.orderId) ?? f.orderId}: ${f.ok ? "" : f.error}`));
      }
      onDone?.();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] gap-4 overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {single ? (isReassign ? `Reassign ${single.reference}` : `Assign ${single.reference}`) : `Assign ${targets.length} orders`}
          </DialogTitle>
          <DialogDescription>
            {single
              ? isReassign
                ? `Currently with ${single.driverName ?? "another driver"}. The previous assignment is kept in the order history.`
                : "Choose a driver. Home-area and lightly loaded drivers are listed first."
              : "All selected orders go to the same driver, added to the end of their run."}
          </DialogDescription>
        </DialogHeader>

        <div role="radiogroup" aria-label="Driver" className="grid gap-1.5">
          {ordered.map((d) => {
            const blocked = d.blockedReason !== null;
            const checked = driverId === d.id;
            const isCurrent = single?.driverId === d.id;
            const disabled = blocked || (isCurrent && single?.status !== "failed");
            return (
              <label
                key={d.id}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-lg border p-2.5 transition-colors has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-ring",
                  checked ? "border-primary bg-accent ring-1 ring-primary" : "hover:bg-muted/50",
                  disabled && "cursor-not-allowed opacity-55 hover:bg-transparent",
                )}
              >
                <input
                  type="radio"
                  name="driver"
                  value={d.id}
                  checked={checked}
                  disabled={disabled}
                  onChange={() => setDriverId(d.id)}
                  className="sr-only"
                />
                <DriverAvatar name={d.name} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="truncate text-sm font-medium">{d.name}</span>
                    {d.id === recommendedId && !isCurrent && (
                      <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                        Suggested
                      </span>
                    )}
                    {isCurrent && (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Current
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    {d.vehicleType && (
                      <span className="inline-flex items-center gap-1">
                        <VehicleIcon type={d.vehicleType} className="size-3.5" />
                        {d.vehiclePlate}
                      </span>
                    )}
                    {d.homeAreaCode && <span>Home: {d.homeAreaCode}</span>}
                    <span>{d.activeCount} active</span>
                  </span>
                </span>
                {blocked ? (
                  <span className="shrink-0 text-xs font-medium text-muted-foreground">{d.blockedReason}</span>
                ) : (
                  <AvailabilityBadge availability={d.availability} className="shrink-0" />
                )}
              </label>
            );
          })}
        </div>

        {single && (
          <div className="grid gap-1.5">
            <Label htmlFor="assign-reason">
              Reason {inProgress ? <span className="text-red-600">(required)</span> : <span className="text-muted-foreground">(optional)</span>}
            </Label>
            <Textarea
              id="assign-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              maxLength={300}
              placeholder={inProgress ? "Why is this order being handed over?" : "e.g. Closer to the drop-off"}
            />
          </div>
        )}

        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
            {error}
          </p>
        )}
        {failures.length > 0 && (
          <div role="alert" className="rounded-md border border-warning-border bg-warning-soft px-3 py-2 text-sm text-warning-foreground">
            <p className="font-medium">Some orders could not be assigned:</p>
            <ul className="mt-1 list-disc pl-5">
              {failures.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!driverId || pending || reasonMissing}>
            {pending && <Loader2Icon className="animate-spin" />}
            {single ? (isReassign ? "Reassign" : "Assign driver") : `Assign ${targets.length} orders`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
