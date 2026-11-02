"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Loader2Icon } from "lucide-react";
import { setAvailabilityAction } from "@/app/(app)/drivers/actions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DRIVER_AVAILABILITIES, type DriverAvailability } from "@/lib/domain";
import { AVAILABILITY_META } from "@/lib/status";
import { cn } from "@/lib/utils";

export function AvailabilityControl({
  driverId,
  value,
  className,
}: {
  driverId: string;
  value: DriverAvailability;
  className?: string;
}) {
  const [pending, startTransition] = useTransition();

  function change(next: DriverAvailability) {
    startTransition(async () => {
      const res = await setAvailabilityAction({ driverId, availability: next });
      if (res.ok) toast.success(`Availability set to ${AVAILABILITY_META[next].label.toLowerCase()}`);
      else toast.error(res.error);
    });
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Select value={value} onValueChange={(v) => change(v as DriverAvailability)} disabled={pending}>
        <SelectTrigger className="w-40" aria-label="Availability">
          <SelectValue>
            <span className="inline-flex items-center gap-2">
              <span aria-hidden className={cn("size-2 rounded-full", AVAILABILITY_META[value].dot)} />
              {AVAILABILITY_META[value].label}
            </span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {DRIVER_AVAILABILITIES.map((a) => (
            <SelectItem key={a} value={a}>
              <span className="inline-flex items-center gap-2">
                <span aria-hidden className={cn("size-2 rounded-full", AVAILABILITY_META[a].dot)} />
                {AVAILABILITY_META[a].label}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {pending && <Loader2Icon className="size-4 animate-spin text-muted-foreground" />}
    </div>
  );
}
