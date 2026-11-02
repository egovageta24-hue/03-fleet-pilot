import { BikeIcon, CarIcon, TruckIcon, ZapIcon, type LucideIcon } from "lucide-react";
import type { VehicleType } from "@/lib/domain";

const ICONS: Record<VehicleType, LucideIcon> = {
  bike: BikeIcon,
  scooter: ZapIcon,
  car: CarIcon,
  van: TruckIcon,
  truck: TruckIcon,
};

export function VehicleIcon({ type, className }: { type: VehicleType; className?: string }) {
  const Icon = ICONS[type];
  return <Icon aria-hidden className={className} />;
}
