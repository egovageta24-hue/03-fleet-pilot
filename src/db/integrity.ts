import { sql, type SQL } from "drizzle-orm";
import type { Db } from "./index";

/** Invariants the dashboards and reports rely on. Each query returns one row per violation. */
export const INTEGRITY_CHECKS: { name: string; query: SQL }[] = [
  {
    name: "order.status equals the latest status-history row",
    query: sql`select o.reference as ref from orders o
      join lateral (select to_status from order_status_history h where h.order_id = o.id order by h.id desc limit 1) last on true
      where last.to_status <> o.status`,
  },
  {
    name: "orders without any status history",
    query: sql`select o.reference as ref from orders o
      where not exists (select 1 from order_status_history h where h.order_id = o.id)`,
  },
  {
    name: "status history forms an unbroken chain (from = previous to)",
    query: sql`select order_id::text as ref from (
        select order_id, from_status, lag(to_status) over (partition by order_id order by id) as prev_to,
               row_number() over (partition by order_id order by id) as rn
        from order_status_history) x
      where (rn = 1 and from_status is not null) or (rn > 1 and from_status is distinct from prev_to)`,
  },
  {
    name: "orders held by a driver have exactly one active assignment; others have none",
    query: sql`select o.reference as ref from orders o
      left join lateral (select count(*) c from assignments a where a.order_id = o.id and a.status = 'active') ac on true
      where (o.status in ('assigned','picked_up','out_for_delivery','failed') and ac.c <> 1)
         or (o.status in ('unassigned','delivered','cancelled') and ac.c <> 0)`,
  },
  {
    name: "orders.driver_id matches the active assignment's driver",
    query: sql`select o.reference as ref from orders o
      join assignments a on a.order_id = o.id and a.status = 'active'
      where o.driver_id is distinct from a.driver_id`,
  },
  {
    name: "unassigned orders have no driver",
    query: sql`select reference as ref from orders where status = 'unassigned' and driver_id is not null`,
  },
  {
    name: "orders.open_exceptions equals the number of open exceptions",
    query: sql`select o.reference as ref from orders o
      where o.open_exceptions <> (select count(*) from exceptions e where e.order_id = o.id and e.status = 'open')`,
  },
  {
    name: "finished orders have no open exceptions",
    query: sql`select o.reference as ref from orders o
      where o.status in ('delivered','cancelled') and o.open_exceptions <> 0`,
  },
  {
    name: "delivered_at is set exactly when the order is delivered",
    query: sql`select reference as ref from orders
      where (status = 'delivered') <> (delivered_at is not null)`,
  },
  {
    name: "delivery window ends after it starts",
    query: sql`select reference as ref from orders where window_end <= window_start`,
  },
  {
    name: "no duplicate stop sequence within a driver's active run",
    query: sql`select driver_id::text as ref from assignments where status = 'active'
      group by driver_id, sequence having count(*) > 1`,
  },
  {
    name: "timeline events are not dated before the order was created",
    query: sql`select o.reference as ref from orders o
      join delivery_events e on e.order_id = o.id where e.created_at < o.created_at`,
  },
];

export type IntegrityResult = { name: string; violations: string[] };

export async function runIntegrityChecks(db: Db): Promise<IntegrityResult[]> {
  const out: IntegrityResult[] = [];
  for (const check of INTEGRITY_CHECKS) {
    const res = (await db.execute(check.query)) as unknown as { rows: { ref: string }[] };
    out.push({ name: check.name, violations: res.rows.map((r) => r.ref) });
  }
  return out;
}
