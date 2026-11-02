import Link from "next/link";
import type { OrderStatus } from "@/lib/domain";
import { ORDER_STATUS_META } from "@/lib/status";

/**
 * Part-to-whole of today's orders as one stacked bar (2px surface gaps, rounded data ends).
 * Seven statuses is past the point where colour alone identifies them, so every segment is
 * also in the legend with its count and share, and there is a screen-reader table. Hues pass the
 * dataviz colour-blind / normal-vision separation checks; the two greys (assigned, cancelled)
 * are deliberate neutrals and are distinguished by lightness plus the labels.
 */
export function StatusMix({ data }: { data: { status: OrderStatus; count: number }[] }) {
  const total = data.reduce((n, d) => n + d.count, 0);
  if (total === 0) return <p className="text-sm text-muted-foreground">No orders yet today.</p>;

  return (
    <div>
      <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-md" role="img" aria-label={`Status of ${total} orders`}>
        {data.map((d) => (
          <span
            key={d.status}
            title={`${ORDER_STATUS_META[d.status].label}: ${d.count}`}
            className="h-full first:rounded-l-md last:rounded-r-md"
            style={{ width: `${(d.count / total) * 100}%`, background: ORDER_STATUS_META[d.status].hex }}
          />
        ))}
      </div>

      <ul className="mt-3 grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-2">
        {data.map((d) => (
          <li key={d.status}>
            <Link
              href={`/orders?status=${d.status}`}
              className="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
            >
              <span aria-hidden className="size-2.5 shrink-0 rounded-sm" style={{ background: ORDER_STATUS_META[d.status].hex }} />
              <span className="flex-1 truncate text-muted-foreground">{ORDER_STATUS_META[d.status].label}</span>
              <span className="font-medium tabular-nums">{d.count}</span>
              <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">{Math.round((d.count / total) * 100)}%</span>
            </Link>
          </li>
        ))}
      </ul>

      <table className="sr-only">
        <caption>Today&rsquo;s orders by status</caption>
        <thead>
          <tr>
            <th scope="col">Status</th>
            <th scope="col">Orders</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.status}>
              <th scope="row">{ORDER_STATUS_META[d.status].label}</th>
              <td>{d.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
