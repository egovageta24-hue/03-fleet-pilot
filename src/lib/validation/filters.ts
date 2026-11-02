import { z } from "zod";
import { ORDER_PRIORITIES, ORDER_STATUSES } from "@/lib/domain";

export type SearchParams = Record<string, string | string[] | undefined>;

/** First value of a (possibly repeated) query parameter. */
function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** `a,b,c` -> ["a","b","c"] (empty / missing -> undefined). */
const csv = <T extends z.ZodType>(item: T) =>
  z.preprocess((v) => {
    const s = first(v as string | string[] | undefined);
    return s ? s.split(",").filter(Boolean) : undefined;
  }, z.array(item).optional());

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const flag = z.preprocess((v) => {
  const s = first(v as string | string[] | undefined);
  return s === "1" || s === "true" ? true : undefined;
}, z.boolean().optional());

export const PAGE_SIZES = [10, 25, 50, 100] as const;
export const ORDER_SORTS = ["created", "window", "status", "priority", "reference", "updated"] as const;
export type OrderSort = (typeof ORDER_SORTS)[number];

/**
 * Filters shared by Orders, Board and Reports. Every field falls back to "not set" on a bad
 * value (`.catch`), so a hand-edited URL can never crash a page.
 */
export const orderFiltersSchema = z.object({
  q: z.preprocess((v) => first(v as string | string[] | undefined)?.trim() || undefined, z.string().max(100).optional()).catch(undefined),
  status: csv(z.enum(ORDER_STATUSES)).catch(undefined),
  priority: csv(z.enum(ORDER_PRIORITIES)).catch(undefined),
  area: csv(z.uuid()).catch(undefined),
  /** Driver ids, or the literal `none` for "no driver yet". */
  driver: csv(z.union([z.uuid(), z.literal("none")])).catch(undefined),
  /** Delivery date range (company-timezone calendar dates, inclusive). */
  from: z.preprocess((v) => first(v as string | string[] | undefined), isoDate.optional()).catch(undefined),
  to: z.preprocess((v) => first(v as string | string[] | undefined), isoDate.optional()).catch(undefined),
  attention: flag.catch(undefined),
  sort: z.preprocess((v) => first(v as string | string[] | undefined), z.enum(ORDER_SORTS)).catch("created"),
  dir: z.preprocess((v) => first(v as string | string[] | undefined), z.enum(["asc", "desc"])).catch("desc"),
  page: z.preprocess((v) => Number(first(v as string | string[] | undefined)), z.number().int().min(1).max(10_000)).catch(1),
  size: z
    .preprocess((v) => Number(first(v as string | string[] | undefined)), z.number().refine((n) => (PAGE_SIZES as readonly number[]).includes(n)))
    .catch(25),
});

export type OrderFilters = z.output<typeof orderFiltersSchema>;

export function parseOrderFilters(params: SearchParams): OrderFilters {
  return orderFiltersSchema.parse(params);
}

/** Serialise filters back to a query string (omits defaults and empty values). */
export function filtersToQuery(f: Partial<OrderFilters>, overrides: Partial<OrderFilters> = {}): string {
  const merged = { ...f, ...overrides };
  const p = new URLSearchParams();
  if (merged.q) p.set("q", merged.q);
  if (merged.status?.length) p.set("status", merged.status.join(","));
  if (merged.priority?.length) p.set("priority", merged.priority.join(","));
  if (merged.area?.length) p.set("area", merged.area.join(","));
  if (merged.driver?.length) p.set("driver", merged.driver.join(","));
  if (merged.from) p.set("from", merged.from);
  if (merged.to) p.set("to", merged.to);
  if (merged.attention) p.set("attention", "1");
  if (merged.sort && merged.sort !== "created") p.set("sort", merged.sort);
  if (merged.dir && merged.dir !== "desc") p.set("dir", merged.dir);
  if (merged.page && merged.page > 1) p.set("page", String(merged.page));
  if (merged.size && merged.size !== 25) p.set("size", String(merged.size));
  return p.toString();
}
