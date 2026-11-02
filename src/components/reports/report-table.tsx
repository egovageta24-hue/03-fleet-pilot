"use client";

import { useMemo } from "react";
import Link from "next/link";
import { createColumnHelper, useTable } from "@tanstack/react-table";
import { FileSearchIcon } from "lucide-react";
import { DataTableView } from "@/components/data-table/data-table-view";
import { features, type AppFeatures } from "@/components/data-table/features";
import { TablePagination } from "@/components/data-table/pagination";
import { StatusBadge } from "@/components/shared/badges";
import { formatDuration, formatTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { ReportRow } from "@/server/queries/reports";

const helper = createColumnHelper<AppFeatures, ReportRow>();

function OnTime({ r }: { r: ReportRow }) {
  if (r.onTime === null) return <span className="text-muted-foreground">—</span>;
  return r.onTime ? <span className="text-success">On time</span> : <span className="text-warning-foreground">Late</span>;
}

export function ReportTable({
  rows,
  tz,
  page,
  pageSize,
  total,
  filtersActive,
}: {
  rows: ReportRow[];
  tz: string;
  page: number;
  pageSize: number;
  total: number;
  filtersActive: boolean;
}) {
  const columns = useMemo(
    () =>
      helper.columns([
    helper.accessor("reference", {
      id: "order",
      header: "Order",
      enableSorting: false,
      meta: { sticky: true },
      cell: ({ row }) => (
        <Link href={`/orders/${row.original.id}`} className="font-mono text-[13px] font-semibold hover:text-primary hover:underline">
          {row.original.reference}
        </Link>
      ),
    }),
    helper.accessor("deliveryDate", {
      id: "date",
      header: "Delivery date",
      enableSorting: false,
      cell: ({ row }) => <span className="tabular-nums">{row.original.deliveryDate}</span>,
    }),
    helper.accessor("customerName", {
      id: "customer",
      header: "Customer",
      enableSorting: false,
      cell: ({ row }) => (
        <div className="max-w-52">
          <div className="truncate font-medium">{row.original.customerName}</div>
          <div className="truncate text-xs text-muted-foreground">{row.original.areaName}</div>
        </div>
      ),
    }),
    helper.accessor("driverName", {
      id: "driver",
      header: "Driver",
      enableSorting: false,
      cell: ({ row }) => row.original.driverName ?? <span className="text-muted-foreground">—</span>,
    }),
    helper.accessor("status", {
      id: "status",
      header: "Status",
      enableSorting: false,
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    }),
    helper.display({
      id: "delivered",
      header: "Delivered",
      meta: { hideBelow: "xl" },
      cell: ({ row }) => (
        <span className="tabular-nums">{row.original.deliveredAt ? formatTime(row.original.deliveredAt, tz) : "—"}</span>
      ),
    }),
    helper.display({
      id: "ontime",
      header: "On time",
      meta: { hideBelow: "xl" },
      cell: ({ row }) => <OnTime r={row.original} />,
    }),
    helper.display({
      id: "duration",
      header: "Pickup → delivered",
      meta: { hideBelow: "2xl" },
      cell: ({ row }) => (
        <span className="tabular-nums">{row.original.deliveryMinutes === null ? "—" : formatDuration(row.original.deliveryMinutes)}</span>
      ),
    }),
      ]),
    [tz],
  );

  const table = useTable({ features, columns, data: rows, getRowId: (r) => r.id });

  return (
    <div>
      <DataTableView
        table={table}
        label="Report rows"
        empty={
          <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
            <FileSearchIcon className="size-8 text-muted-foreground" />
            <p className="font-medium">{filtersActive ? "No orders match these filters" : "No orders in this range"}</p>
            <p className="text-sm text-muted-foreground">Try widening the date range or clearing a filter.</p>
          </div>
        }
        renderCard={(row) => {
          const r = row.original;
          return (
            <div className="rounded-lg border bg-card p-3 shadow-xs">
              <div className="flex items-center justify-between gap-2">
                <Link href={`/orders/${r.id}`} className="font-mono text-sm font-semibold hover:text-primary">
                  {r.reference}
                </Link>
                <StatusBadge status={r.status} />
              </div>
              <p className="mt-1.5 text-sm font-medium">{r.customerName}</p>
              <p className="text-xs text-muted-foreground">
                {r.deliveryDate} · {r.areaName} · {r.driverName ?? "No driver"}
              </p>
              <p className={cn("mt-1.5 text-xs", r.onTime === false && "text-warning-foreground")}>
                {r.deliveredAt ? `Delivered ${formatTime(r.deliveredAt, tz)} · ` : ""}
                <OnTime r={r} />
              </p>
            </div>
          );
        }}
      />
      <TablePagination page={page} pageSize={pageSize} total={total} pageCount={Math.max(1, Math.ceil(total / pageSize))} />
    </div>
  );
}
