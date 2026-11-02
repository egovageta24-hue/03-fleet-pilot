"use client";

import type { ReactNode } from "react";
import type { ReactTable, Row, RowData } from "@tanstack/react-table";
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { AppColumnMeta, AppFeatures } from "./features";

// Literal class names so Tailwind can see them.
const HIDE_BELOW: Record<NonNullable<AppColumnMeta["hideBelow"]>, string> = {
  sm: "hidden sm:table-cell",
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell",
  xl: "hidden xl:table-cell",
  "2xl": "hidden 2xl:table-cell",
};

const INTERACTIVE = "a,button,input,select,textarea,label,[role=checkbox],[role=menuitem],[data-no-row-click]";

type Props<T extends RowData> = {
  table: ReactTable<AppFeatures, T>;
  /** Mobile (< md) layout: one card per row instead of a table. */
  renderCard?: (row: Row<AppFeatures, T>) => ReactNode;
  onRowClick?: (row: T) => void;
  empty: ReactNode;
  /** Dim the table while the server is fetching a new page/sort. */
  pending?: boolean;
  /** Accessible name for the table. */
  label: string;
};

/**
 * Presentational TanStack Table renderer. Dense on desktop; secondary columns drop out as the
 * screen narrows (`meta.hideBelow`), the first column can stay pinned, the table scrolls
 * horizontally rather than breaking the page, and below `md` it becomes a list of cards.
 */
export function DataTableView<T extends RowData>({ table, renderCard, onRowClick, empty, pending, label }: Props<T>) {
  const rows = table.getRowModel().rows;

  if (rows.length === 0) {
    return <div className="rounded-lg border bg-card">{empty}</div>;
  }

  return (
    <div className={cn("transition-opacity", pending && "opacity-60")} aria-busy={pending || undefined}>
      {renderCard && (
        <ul className="grid gap-2 sm:grid-cols-2 lg:hidden" aria-label={label}>
          {rows.map((row) => (
            <li key={row.id}>{renderCard(row)}</li>
          ))}
        </ul>
      )}

      <div className={cn("overflow-hidden rounded-lg border bg-card", renderCard && "hidden lg:block")}>
        <Table aria-label={label}>
          <TableHeader className="bg-slate-50">
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id} className="hover:bg-transparent">
                {group.headers.map((header) => {
                  const meta = header.column.columnDef.meta;
                  const sorted = header.column.getIsSorted();
                  const canSort = header.column.getCanSort();
                  return (
                    <TableHead
                      key={header.id}
                      scope="col"
                      aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
                      className={cn(
                        "h-9 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground",
                        meta?.hideBelow && HIDE_BELOW[meta.hideBelow],
                        meta?.sticky && "sticky left-0 z-10 bg-slate-50",
                        meta?.headClassName,
                      )}
                    >
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className="-mx-1.5 inline-flex items-center gap-1 rounded px-1.5 py-1 uppercase tracking-wide hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                        >
                          <table.FlexRender header={header} />
                          {sorted === "asc" ? (
                            <ArrowUpIcon className="size-3 text-primary" />
                          ) : sorted === "desc" ? (
                            <ArrowDownIcon className="size-3 text-primary" />
                          ) : (
                            <ArrowUpDownIcon className="size-3 opacity-40" />
                          )}
                        </button>
                      ) : (
                        <table.FlexRender header={header} />
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() ? "selected" : undefined}
                onClick={
                  onRowClick
                    ? (e) => {
                        if ((e.target as HTMLElement).closest(INTERACTIVE)) return;
                        onRowClick(row.original);
                      }
                    : undefined
                }
                className={cn(onRowClick && "cursor-pointer")}
              >
                {row.getAllCells().map((cell) => {
                  const meta = cell.column.columnDef.meta;
                  return (
                    <TableCell
                      key={cell.id}
                      className={cn(
                        "px-3 py-2",
                        meta?.hideBelow && HIDE_BELOW[meta.hideBelow],
                        meta?.sticky && "sticky left-0 z-10 bg-card",
                        meta?.cellClassName,
                      )}
                    >
                      <table.FlexRender cell={cell} />
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
