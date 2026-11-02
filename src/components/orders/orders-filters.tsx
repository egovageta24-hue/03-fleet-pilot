"use client";

import { useRef, useState } from "react";
import { AlertTriangleIcon, FilterIcon, SearchIcon, XIcon } from "lucide-react";
import { MultiSelectFilter } from "@/components/shared/multi-select-filter";
import { useUrlState } from "@/components/shared/use-url-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ORDER_PRIORITIES } from "@/lib/domain";
import { ORDER_STATUS_META, PRIORITY_META, STATUS_ORDER } from "@/lib/status";
import { cn } from "@/lib/utils";
import type { OrderFilters } from "@/lib/validation/filters";

type Props = {
  filters: OrderFilters;
  areas: { id: string; code: string; name: string }[];
  drivers: { id: string; name: string }[];
  /** Which controls to show (Reports reuses this bar without search/attention). */
  show?: {
    search?: boolean;
    attention?: boolean;
    priority?: boolean;
    status?: boolean;
    driver?: boolean;
    dates?: boolean;
  };
  /** Label for the date range ("Delivery date"). */
  dateLabel?: string;
};

export function OrdersFilters({ filters, areas, drivers, show = {}, dateLabel = "Delivery date" }: Props) {
  const { update, pending } = useUrlState();
  const urlQ = filters.q ?? "";
  const [q, setQ] = useState(urlQ);
  // The last search value this component pushed into the URL itself.
  const [pushedQ, setPushedQ] = useState(urlQ);
  const [seenUrlQ, setSeenUrlQ] = useState(urlQ);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const showSearch = show.search ?? true;
  const showAttention = show.attention ?? true;
  const showPriority = show.priority ?? true;
  const showStatus = show.status ?? true;
  const showDriver = show.driver ?? true;
  const showDates = show.dates ?? true;

  // The URL is the source of truth, but typing must not be overwritten by the server echoing an
  // older value. Only a change we did not push ourselves (header search, back button) replaces
  // the box. (Adjusting state during render, as recommended over an effect.)
  if (urlQ !== seenUrlQ) {
    setSeenUrlQ(urlQ);
    if (urlQ !== pushedQ) {
      setQ(urlQ);
      setPushedQ(urlQ);
    }
  }

  function onSearch(value: string) {
    setQ(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const next = value.trim();
      setPushedQ(next);
      update({ q: next || null });
    }, 300);
  }

  const activeCount =
    (filters.status?.length ? 1 : 0) +
    (filters.priority?.length ? 1 : 0) +
    (filters.area?.length ? 1 : 0) +
    (filters.driver?.length ? 1 : 0) +
    (filters.from || filters.to ? 1 : 0) +
    (filters.attention ? 1 : 0);
  const anyActive = activeCount > 0 || !!filters.q;

  function clearAll() {
    clearTimeout(timer.current);
    setQ("");
    setPushedQ("");
    update({ q: null, status: null, priority: null, area: null, driver: null, from: null, to: null, attention: null });
  }

  const csv = (v: string[]) => (v.length ? v.join(",") : null);

  return (
    <div className="mb-4 space-y-2" aria-busy={pending || undefined}>
      <div className="flex flex-wrap items-center gap-2">
        {showSearch && (
          <div className="relative min-w-0 flex-1 basis-56 sm:max-w-sm">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={q}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Search order, customer, driver, address…"
              aria-label="Search orders"
              className="pl-8"
            />
          </div>
        )}
        <Button
          variant="outline"
          className="md:hidden"
          aria-expanded={open}
          aria-controls="order-filter-panel"
          onClick={() => setOpen((o) => !o)}
        >
          <FilterIcon /> Filters{activeCount > 0 ? ` (${activeCount})` : ""}
        </Button>
        {showAttention && (
          <Button
            variant="outline"
            aria-pressed={!!filters.attention}
            onClick={() => update({ attention: filters.attention ? null : "1" })}
            className={cn(
              filters.attention && "border-warning-border bg-warning-soft text-warning-foreground hover:bg-warning-soft",
            )}
          >
            <AlertTriangleIcon /> Needs attention
          </Button>
        )}
        {anyActive && (
          <Button variant="ghost" onClick={clearAll} className="text-muted-foreground">
            <XIcon /> Clear
          </Button>
        )}
      </div>

      <div
        id="order-filter-panel"
        className={cn("flex-wrap items-center gap-2", open ? "flex" : "hidden md:flex")}
      >
        {showStatus && (
          <MultiSelectFilter
            label="Status"
            selected={filters.status ?? []}
            onChange={(v) => update({ status: csv(v) })}
            options={STATUS_ORDER.map((s) => ({ value: s, label: ORDER_STATUS_META[s].label }))}
          />
        )}
        {showPriority && (
          <MultiSelectFilter
            label="Priority"
            selected={filters.priority ?? []}
            onChange={(v) => update({ priority: csv(v) })}
            options={ORDER_PRIORITIES.map((p) => ({ value: p, label: PRIORITY_META[p].label }))}
          />
        )}
        <MultiSelectFilter
          label="Area"
          selected={filters.area ?? []}
          onChange={(v) => update({ area: csv(v) })}
          options={areas.map((a) => ({ value: a.id, label: a.name, hint: a.code }))}
        />
        {showDriver && (
          <MultiSelectFilter
            label="Driver"
            selected={filters.driver ?? []}
            onChange={(v) => update({ driver: csv(v) })}
            options={[{ value: "none", label: "Unassigned" }, ...drivers.map((d) => ({ value: d.id, label: d.name }))]}
          />
        )}
        {showDates && (
        <div className="flex items-center gap-1.5" role="group" aria-label={dateLabel}>
          <Input
            type="date"
            aria-label={`${dateLabel} from`}
            value={filters.from ?? ""}
            max={filters.to}
            onChange={(e) => update({ from: e.target.value || null })}
            className="w-38"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <Input
            type="date"
            aria-label={`${dateLabel} to`}
            value={filters.to ?? ""}
            min={filters.from}
            onChange={(e) => update({ to: e.target.value || null })}
            className="w-38"
          />
        </div>
        )}
      </div>
    </div>
  );
}
