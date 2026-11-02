import "server-only";
import { sql } from "drizzle-orm";
import { schema, type Db } from "@/db";
import { dayRangeInTz } from "@/lib/dates";
import type { Actor } from "@/lib/permissions";
import type { OrderFilters } from "@/lib/validation/filters";
import { listOrders, type OrderListRow, type QueryCtx } from "./orders";

const { orders } = schema;

/** Hard cap so a very busy day cannot make the board page unbounded. */
export const BOARD_LIMIT = 400;

export type BoardData = { orders: OrderListRow[]; total: number; truncated: boolean };

/**
 * Today's board: orders created today, anything still open, and anything delivered today.
 * Cancelled orders from earlier days and old deliveries stay off the board.
 */
export async function getBoard(db: Db, actor: Actor, filters: OrderFilters, ctx: QueryCtx): Promise<BoardData> {
  const today = dayRangeInTz(ctx.now, ctx.tz);
  const start = sql`${today.start.toISOString()}::timestamptz`;
  const end = sql`${today.end.toISOString()}::timestamptz`;

  const list = await listOrders(
    db,
    actor,
    { ...filters, sort: "window", dir: "asc", page: 1, size: BOARD_LIMIT },
    ctx,
    {
      extraWhere: sql`(${orders.createdAt} >= ${start}
        or ${orders.status} in ('unassigned','assigned','picked_up','out_for_delivery','failed')
        or (${orders.deliveredAt} >= ${start} and ${orders.deliveredAt} < ${end}))`,
    },
  );

  return { orders: list.rows, total: list.total, truncated: list.total > list.rows.length };
}
