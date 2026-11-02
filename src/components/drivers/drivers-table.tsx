"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createColumnHelper, useTable } from "@tanstack/react-table";
import { UsersIcon, WrenchIcon } from "lucide-react";
import { DataTableView } from "@/components/data-table/data-table-view";
import { features, type AppFeatures } from "@/components/data-table/features";
import { DriverAvatar } from "@/components/shared/driver-avatar";
import { VehicleThumb } from "@/components/shared/vehicle-thumb";
import { DRIVER_STATE_META, VEHICLE_TYPE_LABEL } from "@/lib/status";
import { cn } from "@/lib/utils";
import type { DriverSummary } from "@/server/queries/drivers";

const helper = createColumnHelper<AppFeatures, DriverSummary>();

function StateBadge({ d }: { d: DriverSummary }) {
  const meta = DRIVER_STATE_META[d.state];
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", meta.badge)}>
      <span aria-hidden className={cn("size-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </span>
  );
}

function VehicleCell({ d }: { d: DriverSummary }) {
  if (!d.vehicle) return <span className="text-sm text-muted-foreground">No vehicle</span>;
  const out = d.vehicle.status !== "active";
  return (
    <div className="flex items-center gap-3">
      <VehicleThumb type={d.vehicle.type} className="w-16 shrink-0" />
      <div className="min-w-0">
        <p className="text-sm">{VEHICLE_TYPE_LABEL[d.vehicle.type]}</p>
        <p className="font-mono text-xs text-muted-foreground">{d.vehicle.plate}</p>
        {out && (
          <p className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-warning-foreground">
            <WrenchIcon className="size-3" /> {d.vehicle.status === "maintenance" ? "In maintenance" : "Retired"}
          </p>
        )}
      </div>
    </div>
  );
}

const columns = helper.columns([
  helper.accessor("name", {
    id: "driver",
    header: "Driver",
    enableSorting: false,
    meta: { sticky: true },
    cell: ({ row }) => (
      <Link href={`/drivers/${row.original.id}`} className="flex items-center gap-3 focus-visible:outline-2 focus-visible:outline-ring">
        <DriverAvatar name={row.original.name} size="md" />
        <span className="min-w-0">
          <span className="block truncate font-medium hover:text-primary hover:underline">{row.original.name}</span>
          <span className="block text-xs text-muted-foreground">{row.original.phone}</span>
        </span>
      </Link>
    ),
  }),
  helper.accessor("state", {
    id: "state",
    header: "Status",
    enableSorting: false,
    cell: ({ row }) => <StateBadge d={row.original} />,
  }),
  helper.display({
    id: "vehicle",
    header: "Vehicle",
    enableSorting: false,
    cell: ({ row }) => <VehicleCell d={row.original} />,
  }),
  helper.accessor("active", {
    id: "load",
    header: "Active",
    enableSorting: false,
    cell: ({ row }) => {
      const d = row.original;
      return (
        <div className="tabular-nums">
          <span className="font-medium">{d.active}</span>
          {d.overdue > 0 && <span className="ml-2 rounded-full bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-200">{d.overdue} late</span>}
          {d.failed > 0 && <span className="ml-2 text-xs text-warning-foreground">{d.failed} failed</span>}
        </div>
      );
    },
  }),
  helper.accessor("deliveredToday", {
    id: "today",
    header: "Delivered today",
    enableSorting: false,
    meta: { hideBelow: "xl" },
    cell: ({ row }) => <span className="tabular-nums">{row.original.deliveredToday}</span>,
  }),
  helper.accessor("homeAreaName", {
    id: "zone",
    header: "Home zone",
    enableSorting: false,
    meta: { hideBelow: "xl" },
    cell: ({ row }) => (
      <span className="text-sm">
        {row.original.homeAreaName ?? "—"}
        {row.original.homeAreaCode && <span className="ml-1.5 font-mono text-xs text-muted-foreground">{row.original.homeAreaCode}</span>}
      </span>
    ),
  }),
]);

export function DriversTable({ drivers, filtersActive }: { drivers: DriverSummary[]; filtersActive: boolean }) {
  const router = useRouter();
  const table = useTable({ features, columns, data: drivers, getRowId: (d) => d.id });

  return (
    <DataTableView
      table={table}
      label="Drivers"
      onRowClick={(d) => router.push(`/drivers/${d.id}`)}
      empty={
        <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
          <UsersIcon className="size-8 text-muted-foreground" />
          <p className="font-medium">{filtersActive ? "No drivers match these filters" : "No drivers yet"}</p>
        </div>
      }
      renderCard={(row) => {
        const d = row.original;
        return (
          <Link href={`/drivers/${d.id}`} className="block rounded-lg border bg-card p-3 shadow-xs transition-colors hover:border-primary/40">
            <div className="flex items-center gap-3">
              <DriverAvatar name={d.name} size="md" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{d.name}</p>
                <p className="text-xs text-muted-foreground">{d.phone}</p>
              </div>
              <StateBadge d={d} />
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <VehicleCell d={d} />
              <dl className="grid grid-cols-2 gap-x-4 text-center text-xs">
                <div>
                  <dd className="text-base font-semibold tabular-nums">{d.active}</dd>
                  <dt className="text-muted-foreground">Active</dt>
                </div>
                <div>
                  <dd className="text-base font-semibold tabular-nums">{d.deliveredToday}</dd>
                  <dt className="text-muted-foreground">Today</dt>
                </div>
              </dl>
            </div>
          </Link>
        );
      }}
    />
  );
}
