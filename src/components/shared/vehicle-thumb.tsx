import Image from "next/image";
import type { VehicleType } from "@/lib/domain";
import { VEHICLE_TYPE_LABEL } from "@/lib/status";
import { cn } from "@/lib/utils";

/** Local SVG illustration for a vehicle type (public/vehicles/*.svg). */
export function VehicleThumb({ type, className }: { type: VehicleType; className?: string }) {
  return (
    <Image
      src={`/vehicles/${type}.svg`}
      alt={VEHICLE_TYPE_LABEL[type]}
      width={160}
      height={100}
      unoptimized
      className={cn("rounded-lg", className)}
    />
  );
}
