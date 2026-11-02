"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  BanIcon,
  FlagIcon,
  Loader2Icon,
  Undo2Icon,
  UserPlusIcon,
} from "lucide-react";
import {
  advanceOrderAction,
  raiseExceptionAction,
  setPriorityAction,
  unassignOrderAction,
} from "@/app/(app)/orders/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/action-result";
import {
  EXCEPTION_TYPES,
  ORDER_PRIORITIES,
  type ExceptionSeverity,
  type ExceptionType,
  type OrderPriority,
  type OrderStatus,
} from "@/lib/domain";
import { canTransition, isTerminal, nextDriverStep } from "@/lib/orders/state-machine";
import { EXCEPTION_TYPE_LABEL, PRIORITY_META } from "@/lib/status";
import type { AssignableDriver } from "@/server/queries/drivers";
import { AssignDriverDialog, type AssignTarget } from "./assign-driver-dialog";

type Props = {
  order: { id: string; reference: string; status: OrderStatus; priority: OrderPriority; driverId: string | null; driverName: string | null; areaId: string };
  drivers: AssignableDriver[];
  can: {
    assign: boolean;
    priority: boolean;
    cancel: boolean;
    advance: boolean;
    raise: boolean;
  };
};

/** Run a server action, surface its outcome as a toast, and report success to the caller. */
function useRunner() {
  const [pending, startTransition] = useTransition();
  function run(action: () => Promise<ActionResult<unknown>>, success: string, onOk?: () => void) {
    startTransition(async () => {
      const res = await action();
      if (res.ok) {
        toast.success(success);
        onOk?.();
      } else {
        toast.error(res.error);
      }
    });
  }
  return { pending, run };
}

function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  label,
  confirmLabel,
  destructive,
  run,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description: string;
  label: string;
  confirmLabel: string;
  destructive?: boolean;
  run: (reason: string) => Promise<ActionResult<unknown>>;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await run(reason.trim());
      if (res.ok) {
        setReason("");
        onOpenChange(false);
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (pending ? null : onOpenChange(o))}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="reason-text">{label}</Label>
          <Textarea id="reason-text" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={300} autoFocus />
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Keep as is
          </Button>
          <Button variant={destructive ? "destructive" : "default"} onClick={submit} disabled={pending || !reason.trim()}>
            {pending && <Loader2Icon className="animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ProblemDialog({
  open,
  onOpenChange,
  orderId,
  canFail,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  orderId: string;
  canFail: boolean;
}) {
  const [type, setType] = useState<ExceptionType>("delayed");
  const [severity, setSeverity] = useState<ExceptionSeverity>("warning");
  const [description, setDescription] = useState("");
  const [markFailed, setMarkFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await raiseExceptionAction({
        orderId,
        type,
        severity: markFailed ? "critical" : severity,
        description: description.trim() || undefined,
        markFailed,
      });
      if (res.ok) {
        toast.success(markFailed ? "Delivery marked as failed" : "Problem reported");
        setDescription("");
        setMarkFailed(false);
        onOpenChange(false);
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (pending ? null : onOpenChange(o))}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Report a problem</DialogTitle>
          <DialogDescription>Flag an issue so dispatch can see it straight away.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="problem-type">What happened?</Label>
            <Select value={type} onValueChange={(v) => setType(v as ExceptionType)}>
              <SelectTrigger id="problem-type" className="w-full">
                <SelectValue>{EXCEPTION_TYPE_LABEL[type]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {EXCEPTION_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {EXCEPTION_TYPE_LABEL[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {!markFailed && (
            <fieldset className="grid gap-1.5">
              <legend className="text-sm font-medium">How serious is it?</legend>
              <div className="flex gap-2">
                {(["warning", "critical"] as const).map((s) => (
                  <label
                    key={s}
                    className="flex flex-1 cursor-pointer items-center justify-center rounded-md border px-3 py-1.5 text-sm has-checked:border-primary has-checked:bg-accent has-focus-visible:outline-2 has-focus-visible:outline-ring"
                  >
                    <input type="radio" name="severity" className="sr-only" checked={severity === s} onChange={() => setSeverity(s)} />
                    {s === "warning" ? "Warning" : "Critical"}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="problem-description">Details (optional)</Label>
            <Textarea id="problem-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={500} />
          </div>
          {canFail && (
            <label className="flex items-start gap-2.5 rounded-md border border-red-200 bg-red-50 p-3 text-sm">
              <Checkbox checked={markFailed} onCheckedChange={(v) => setMarkFailed(v === true)} className="mt-0.5" />
              <span>
                <span className="font-medium text-red-800">I could not complete this delivery</span>
                <span className="block text-red-700">Marks the order as failed so dispatch can rebook or reassign it.</span>
              </span>
            </label>
          )}
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending} variant={markFailed ? "destructive" : "default"}>
            {pending && <Loader2Icon className="animate-spin" />}
            {markFailed ? "Mark as failed" : "Report problem"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function OrderActions({ order, drivers, can }: Props) {
  const { pending, run } = useRunner();
  const [dialog, setDialog] = useState<null | "assign" | "unassign" | "cancel" | "problem">(null);
  const finished = isTerminal(order.status);
  const step = can.advance ? nextDriverStep(order.status) : null;
  const target: AssignTarget = {
    id: order.id,
    reference: order.reference,
    status: order.status,
    driverId: order.driverId,
    driverName: order.driverName,
    areaId: order.areaId,
  };
  const canFail = can.raise && (order.status === "picked_up" || order.status === "out_for_delivery");

  if (finished && !can.advance) return null;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {step && (
          <Button
            disabled={pending}
            onClick={() =>
              run(() => advanceOrderAction({ orderId: order.id, to: step.to }), `${order.reference}: ${step.label.toLowerCase()}`)
            }
          >
            {pending ? <Loader2Icon className="animate-spin" /> : <ArrowRightIcon />}
            {step.label}
          </Button>
        )}

        {can.assign && !finished && (
          <Button variant={step ? "outline" : "default"} onClick={() => setDialog("assign")}>
            <UserPlusIcon /> {order.driverId ? "Reassign" : "Assign driver"}
          </Button>
        )}

        {can.priority && !finished && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" disabled={pending}>
                <FlagIcon /> Priority: {PRIORITY_META[order.priority].label}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuRadioGroup
                value={order.priority}
                onValueChange={(v) =>
                  run(() => setPriorityAction({ orderId: order.id, priority: v }), `Priority set to ${PRIORITY_META[v as OrderPriority].label}`)
                }
              >
                {ORDER_PRIORITIES.map((p) => (
                  <DropdownMenuRadioItem key={p} value={p}>
                    {PRIORITY_META[p].label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {can.raise && !finished && (
          <Button variant="outline" onClick={() => setDialog("problem")}>
            <AlertTriangleIcon /> Report problem
          </Button>
        )}

        {can.assign && canTransition(order.status, "unassigned") && (
          <Button variant="ghost" className="text-muted-foreground" onClick={() => setDialog("unassign")}>
            <Undo2Icon /> Return to pool
          </Button>
        )}

        {can.cancel && !finished && (
          <Button variant="ghost" className="text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => setDialog("cancel")}>
            <BanIcon /> Cancel order
          </Button>
        )}
      </div>

      {dialog === "assign" && (
        <AssignDriverDialog open onOpenChange={(o) => !o && setDialog(null)} targets={[target]} drivers={drivers} />
      )}
      {dialog === "problem" && <ProblemDialog open onOpenChange={(o) => !o && setDialog(null)} orderId={order.id} canFail={canFail} />}
      {dialog === "unassign" && (
        <ReasonDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          title={`Return ${order.reference} to the pool?`}
          description="The driver is released and the order goes back to Unassigned. Nothing is deleted: the history keeps both steps."
          label="Reason"
          confirmLabel="Return to pool"
          run={async (reason) => {
            const res = await unassignOrderAction({ orderId: order.id, reason });
            if (res.ok) toast.success(`${order.reference} returned to the unassigned pool`);
            return res;
          }}
        />
      )}
      {dialog === "cancel" && (
        <ReasonDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          title={`Cancel ${order.reference}?`}
          description="This cannot be undone. Any assigned driver is released and open exceptions are closed."
          label="Why is it being cancelled?"
          confirmLabel="Cancel order"
          destructive
          run={async (note) => {
            const res = await advanceOrderAction({ orderId: order.id, to: "cancelled", note });
            if (res.ok) toast.success(`${order.reference} cancelled`);
            return res;
          }}
        />
      )}
    </>
  );
}
