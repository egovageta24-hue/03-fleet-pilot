"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PAGE_SIZES } from "@/lib/validation/filters";
import { useUrlState } from "@/components/shared/use-url-state";

type Props = { page: number; pageSize: number; total: number; pageCount: number; noun?: string };

/** Footer for server-paginated tables; page and size live in the URL. */
export function TablePagination({ page, pageSize, total, pageCount, noun = "orders" }: Props) {
  const { update } = useUrlState();
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
      <p aria-live="polite">
        {total === 0 ? `No ${noun}` : `Showing ${from}–${to} of ${total.toLocaleString()} ${noun}`}
      </p>
      <div className="flex items-center gap-2">
        <label className="hidden items-center gap-2 sm:flex">
          <span className="text-xs">Rows</span>
          <Select value={String(pageSize)} onValueChange={(v) => update({ size: v === "25" ? null : v })}>
            <SelectTrigger size="sm" className="w-18" aria-label="Rows per page">
              <SelectValue>{pageSize}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((s) => (
                <SelectItem key={s} value={String(s)}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => update({ page: page - 1 <= 1 ? null : String(page - 1) })}
        >
          <ChevronLeftIcon />
        </Button>
        <span className="min-w-16 text-center text-xs tabular-nums">
          {page} / {pageCount}
        </span>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Next page"
          disabled={page >= pageCount}
          onClick={() => update({ page: String(page + 1) })}
        >
          <ChevronRightIcon />
        </Button>
      </div>
    </div>
  );
}
