"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2Icon, PlusIcon } from "lucide-react";
import { createOrderAction } from "@/app/(app)/orders/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ORDER_PRIORITIES, type OrderPriority } from "@/lib/domain";
import { PRIORITY_META } from "@/lib/status";

type Props = {
  pickups: { id: string; label: string }[];
  areas: { id: string; code: string; name: string }[];
  /** Pre-filled delivery window as `YYYY-MM-DDTHH:mm`, in the company timezone. */
  defaultStart: string;
  defaultEnd: string;
};

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

/** Dispatcher "New order" form. The server re-validates everything with Zod. */
export function NewOrderDialog({ pickups, areas, defaultStart, defaultEnd }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [pickupId, setPickupId] = useState(pickups[0]?.id ?? "");
  const [areaId, setAreaId] = useState("");
  const [priority, setPriority] = useState<OrderPriority>("normal");

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const pickup = pickups.find((p) => p.id === pickupId);
    setError(null);

    startTransition(async () => {
      const res = await createOrderAction({
        merchantName: pickup ? pickup.label.split(" — ")[0] : "",
        pickupAddressId: pickupId,
        customer: { name: f.get("customerName"), phone: f.get("customerPhone"), email: f.get("customerEmail") },
        delivery: { line1: f.get("line1"), line2: f.get("line2"), city: f.get("city"), postcode: f.get("postcode"), areaId },
        priority,
        packages: f.get("packages"),
        weightKg: f.get("weightKg"),
        notes: f.get("notes"),
        windowStart: f.get("windowStart"),
        windowEnd: f.get("windowEnd"),
      });
      if (res.ok) {
        toast.success(`Order ${res.data.reference} created`, {
          action: { label: "Open", onClick: () => router.push(`/orders/${res.data.id}`) },
        });
        setOpen(false);
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon /> New order
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New order</DialogTitle>
          <DialogDescription>It joins the unassigned queue immediately, ready for a driver.</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="grid gap-5" noValidate>
          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="mb-1 text-sm font-semibold">Pickup</legend>
            <div className="sm:col-span-2">
              <Field label="Pickup location" htmlFor="pickup">
                <Select value={pickupId} onValueChange={setPickupId}>
                  <SelectTrigger id="pickup" className="w-full">
                    <SelectValue>{pickups.find((p) => p.id === pickupId)?.label ?? "Choose a location"}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {pickups.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </fieldset>

          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="mb-1 text-sm font-semibold">Customer</legend>
            <Field label="Name" htmlFor="customerName">
              <Input id="customerName" name="customerName" required />
            </Field>
            <Field label="Phone" htmlFor="customerPhone">
              <Input id="customerPhone" name="customerPhone" type="tel" />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Email (optional)" htmlFor="customerEmail">
                <Input id="customerEmail" name="customerEmail" type="email" />
              </Field>
            </div>
          </fieldset>

          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="mb-1 text-sm font-semibold">Delivery address</legend>
            <Field label="Street address" htmlFor="line1">
              <Input id="line1" name="line1" required />
            </Field>
            <Field label="Apartment / unit (optional)" htmlFor="line2">
              <Input id="line2" name="line2" />
            </Field>
            <Field label="City" htmlFor="city">
              <Input id="city" name="city" defaultValue="Riverton" required />
            </Field>
            <Field label="Postcode" htmlFor="postcode">
              <Input id="postcode" name="postcode" required />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Zone" htmlFor="area">
                <Select value={areaId} onValueChange={setAreaId}>
                  <SelectTrigger id="area" className="w-full">
                    <SelectValue placeholder="Choose a zone">{areas.find((a) => a.id === areaId)?.name}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {areas.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name} ({a.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </fieldset>

          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="mb-1 text-sm font-semibold">Delivery details</legend>
            <Field label="Window starts" htmlFor="windowStart">
              <Input id="windowStart" name="windowStart" type="datetime-local" defaultValue={defaultStart} required />
            </Field>
            <Field label="Window ends" htmlFor="windowEnd">
              <Input id="windowEnd" name="windowEnd" type="datetime-local" defaultValue={defaultEnd} required />
            </Field>
            <Field label="Packages" htmlFor="packages">
              <Input id="packages" name="packages" type="number" min={1} max={99} defaultValue={1} required />
            </Field>
            <Field label="Weight (kg)" htmlFor="weightKg">
              <Input id="weightKg" name="weightKg" type="number" min={0.1} step={0.1} defaultValue={1} required />
            </Field>
            <Field label="Priority" htmlFor="priority">
              <Select value={priority} onValueChange={(v) => setPriority(v as OrderPriority)}>
                <SelectTrigger id="priority" className="w-full">
                  <SelectValue>{PRIORITY_META[priority].label}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {ORDER_PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {PRIORITY_META[p].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <div className="sm:col-span-2">
              <Field label="Delivery notes (optional)" htmlFor="notes">
                <Textarea id="notes" name="notes" rows={2} maxLength={1000} placeholder="Gate code, leave-with instructions…" />
              </Field>
            </div>
          </fieldset>

          {error && (
            <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !areaId || !pickupId}>
              {pending && <Loader2Icon className="animate-spin" />} Create order
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
