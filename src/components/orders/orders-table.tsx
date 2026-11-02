"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createColumnHelper,
  useTable,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table";
import { PackageSearchIcon, UserPlusIcon, XIcon } from "lucide-react";
import { DataTableView } from "@/components/data-table/data-table-view";
import { features, type AppFeatures } from "@/components/data-table/features";
import { TablePagination } from "@/components/data-table/pagination";
import { ExceptionFlag, PriorityBadge, StatusBadge } from "@/components/shared/badges";
import { DriverAvatar } from "@/components/shared/driver-avatar";
import { useUrlState } from "@/components/shared/use-url-state";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { formatDuration } from "@/lib/dates";
import type { OrderSort } from "@/lib/validation/filters";
import { orderTiming, formatWindow, TIMING_TEXT_CLASS } from "@/lib/orders/timing";
import { cn } from "@/lib/utils";
import type { AssignableDriver } from "@/server/queries/drivers";
import type { OrderList, OrderListRow } from "@/server/queries/orders";
import { AssignDriverDialog, type AssignTarget } from "./assign-driver-dialog";

type Props = {
  list: OrderList;
  sort: OrderSort;
  dir: "asc" | "desc";
  drivers: AssignableDriver[];
  canAssign: boolean;
  tz: string;
  /** Server render time (ISO). Used for all relative times so SSR and hydration agree. */
  nowIso: string;
  atRiskMinutes: number;
  filtersActive: boolean;
};

const helper = createColumnHelper<AppFeatures, OrderListRow>();
const SORTABLE: readonly string[] = ["reference", "status", "priority", "window", "updated", "created"];

function toTarget(r: OrderListRow): AssignTarget {
  return { id: r.id, reference: r.reference, status: r.status, driverId: r.driverId, driverName: r.driverName, areaId: r.areaId };
}

const canReassign = (r: OrderListRow) => ["assigned", "picked_up", "out_for_delivery", "failed"].includes(r.status);

export function OrdersTable({ list, sort, dir, drivers, canAssign, tz, nowIso, atRiskMinutes, filtersActive }: Props) {
  const router = useRouter();
  const { update, pending } = useUrlState();
  const now = useMemo(() => new Date(nowIso), [nowIso]);

  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [dialogTargets, setDialogTargets] = useState<AssignTarget[] | null>(null);

  const sorting: SortingState = useMemo(() => [{ id: sort, desc: dir === "desc" }], [sort, dir]);

  const columns = useMemo(
    () =>
      helper.columns([
        ...(canAssign
          ? [
              helper.display({
                id: "select",
                enableSorting: false,
                meta: { sticky: false, headClassName: "w-10 pr-0", cellClassName: "w-10 pr-0" },
                header: ({ table }) => (
                  <Checkbox
                    aria-label="Select all unassigned orders on this page"
                    checked={table.getIsAllRowsSelected() ? true : table.getIsSomeRowsSelected() ? "indeterminate" : false}
                    onCheckedChange={(v) => table.toggleAllRowsSelected(v === true)}
                  />
                ),
                cell: ({ row }) =>
                  row.getCanSelect() ? (
                    <Checkbox
                      aria-label={`Select ${row.original.reference}`}
                      checked={row.getIsSelected()}
                      onCheckedChange={(v) => row.toggleSelected(v === true)}
                    />
                  ) : null,
              }),
            ]
          : []),
        helper.accessor("reference", {
          id: "reference",
          header: "Order",
          meta: { sticky: true },
          cell: ({ row }) => {
            const o = row.original;
            return (
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <Link
                    href={`/orders/${o.id}`}
                    className="font-mono text-[13px] font-semibold text-foreground hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    {o.reference}
                  </Link>
                  <PriorityBadge priority={o.priority} className="2xl:hidden" />
                  <ExceptionFlag count={o.openExceptions} />
                </div>
                <div className="max-w-44 truncate text-xs text-muted-foreground">{o.merchantName}</div>
              </div>
            );
          },
        }),
        helper.accessor("customerName", {
          id: "customer",
          header: "Customer",
          enableSorting: false,
          cell: ({ row }) => (
            <div className="min-w-0 max-w-56">
              <div className="truncate font-medium">{row.original.customerName}</div>
              <div className="truncate text-xs text-muted-foreground">
                {row.original.addressLine}, {row.original.postcode}
              </div>
            </div>
          ),
        }),
        helper.accessor("status", {
          id: "status",
          header: "Status",
          cell: ({ row }) => <StatusBadge status={row.original.status} />,
        }),
        helper.accessor("driverName", {
          id: "driver",
          header: "Driver",
          enableSorting: false,
          cell: ({ row }) => {
            const o = row.original;
            if (!o.driverName) {
              return o.status === "unassigned" && canAssign ? (
                <Button size="sm" onClick={() => setDialogTargets([toTarget(o)])}>
                  <UserPlusIcon /> Assign
                </Button>
              ) : (
                <span className="text-sm text-muted-foreground">{o.status === "unassigned" ? "Unassigned" : "—"}</span>
              );
            }
            return (
              <div className="flex items-center gap-2">
                <DriverAvatar name={o.driverName} size="xs" />
                <span className="max-w-32 truncate text-sm">{o.driverName}</span>
                {canAssign && canReassign(o) && (
                  <Button variant="ghost" size="xs" className="text-muted-foreground" onClick={() => setDialogTargets([toTarget(o)])}>
                    Reassign
                  </Button>
                )}
              </div>
            );
          },
        }),
        helper.accessor("windowEnd", {
          id: "window",
          header: "Window",
          cell: ({ row }) => {
            const o = row.original;
            const t = orderTiming({ status: o.status, windowEnd: o.windowEnd }, now, atRiskMinutes);
            return (
              <div>
                <div className="text-sm tabular-nums">{formatWindow(o.windowStart, o.windowEnd, tz)}</div>
                <div className={cn("text-xs tabular-nums", TIMING_TEXT_CLASS[t.tone])}>{t.tone === "none" ? "" : t.label}</div>
              </div>
            );
          },
        }),
        helper.accessor("areaName", {
          id: "area",
          header: "Area",
          enableSorting: false,
          meta: { hideBelow: "2xl" },
          cell: ({ row }) => (
            <span className="inline-flex items-center gap-1.5">
              <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] font-semibold text-muted-foreground">
                {row.original.areaCode}
              </span>
              <span className="text-sm">{row.original.areaName}</span>
            </span>
          ),
        }),
        helper.accessor("priority", {
          id: "priority",
          header: "Priority",
          meta: { hideBelow: "2xl" },
          cell: ({ row }) =>
            row.original.priority === "normal" ? (
              <span className="text-xs text-muted-foreground">Normal</span>
            ) : (
              <PriorityBadge priority={row.original.priority} />
            ),
        }),
        helper.accessor("updatedAt", {
          id: "updated",
          header: "Updated",
          meta: { hideBelow: "2xl" },
          cell: ({ row }) => (
            <span className="text-xs tabular-nums text-muted-foreground">
              {formatDuration((now.getTime() - row.original.updatedAt.getTime()) / 60_000)} ago
            </span>
          ),
        }),
      ]),
    [canAssign, now, atRiskMinutes, tz],
  );

  const table = useTable({
    features,
    columns,
    data: list.rows,
    getRowId: (r) => r.id,
    manualSorting: true,
    enableSortingRemoval: false,
    enableMultiSort: false,
    enableRowSelection: (row) => canAssign && row.original.status === "unassigned",
    state: { sorting, rowSelection },
    onRowSelectionChange: setRowSelection,
    onSortingChange: (updater) => {
      const next = typeof updater === "function" ? updater(sorting) : updater;
      const first = next[0];
      if (first && SORTABLE.includes(first.id)) {
        update({ sort: first.id === "created" ? null : first.id, dir: first.desc ? null : "asc" });
      }
    },
  });

  const selected = list.rows.filter((r) => rowSelection[r.id]);

  return (
    <div>
      {selected.length > 0 && (
        <div
          role="region"
          aria-label="Bulk actions"
          className="sticky top-14 z-20 mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-primary/30 bg-accent px-3 py-2 text-sm shadow-sm"
        >
          <span className="font-medium text-accent-foreground">{selected.length} selected</span>
          <Button size="sm" onClick={() => setDialogTargets(selected.map(toTarget))}>
            <UserPlusIcon /> Assign to driver…
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setRowSelection({})}>
            <XIcon /> Clear selection
          </Button>
        </div>
      )}

      <DataTableView
        table={table}
        label="Orders"
        pending={pending}
        onRowClick={(o) => router.push(`/orders/${o.id}`)}
        empty={
          <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
            <PackageSearchIcon className="size-8 text-muted-foreground" />
            <p className="font-medium">{filtersActive ? "No orders match these filters" : "No orders yet"}</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              {filtersActive ? "Try removing a filter or widening the date range." : "New orders will appear here as soon as they are created."}
            </p>
          </div>
        }
        renderCard={(row) => {
          const o = row.original;
          const t = orderTiming({ status: o.status, windowEnd: o.windowEnd }, now, atRiskMinutes);
          return (
            <div
              className={cn(
                "rounded-lg border bg-card p-3 shadow-xs",
                row.getIsSelected() && "border-primary ring-1 ring-primary",
                (o.status === "unassigned" || o.openExceptions > 0) && "border-l-4 border-l-amber-400",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  {row.getCanSelect() && (
                    <Checkbox
                      aria-label={`Select ${o.reference}`}
                      checked={row.getIsSelected()}
                      onCheckedChange={(v) => row.toggleSelected(v === true)}
                    />
                  )}
                  <Link href={`/orders/${o.id}`} className="font-mono text-sm font-semibold hover:text-primary">
                    {o.reference}
                  </Link>
                  <PriorityBadge priority={o.priority} />
                  <ExceptionFlag count={o.openExceptions} />
                </div>
                <StatusBadge status={o.status} />
              </div>
              <p className="mt-2 text-sm font-medium">{o.customerName}</p>
              <p className="text-xs text-muted-foreground">
                {o.addressLine}, {o.postcode} · {o.areaName}
              </p>
              <div className="mt-3 flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs tabular-nums">{formatWindow(o.windowStart, o.windowEnd, tz)}</p>
                  {t.tone !== "none" && <p className={cn("text-xs tabular-nums", TIMING_TEXT_CLASS[t.tone])}>{t.label}</p>}
                </div>
                {o.driverName ? (
                  <div className="flex items-center gap-2">
                    <DriverAvatar name={o.driverName} size="xs" />
                    <span className="text-sm">{o.driverName}</span>
                    {canAssign && canReassign(o) && (
                      <Button variant="outline" size="xs" onClick={() => setDialogTargets([toTarget(o)])}>
                        Reassign
                      </Button>
                    )}
                  </div>
                ) : o.status === "unassigned" && canAssign ? (
                  <Button size="sm" onClick={() => setDialogTargets([toTarget(o)])}>
                    <UserPlusIcon /> Assign
                  </Button>
                ) : null}
              </div>
            </div>
          );
        }}
      />

      <TablePagination page={list.page} pageSize={list.pageSize} total={list.total} pageCount={list.pageCount} />

      {dialogTargets && (
        <AssignDriverDialog
          open
          onOpenChange={(o) => !o && setDialogTargets(null)}
          targets={dialogTargets}
          drivers={drivers}
          onDone={() => setRowSelection({})}
        />
      )}
    </div>
  );
}
