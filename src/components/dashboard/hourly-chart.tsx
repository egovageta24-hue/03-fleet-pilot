"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

// "Emphasis" form: the metric the story is about (deliveries) wears the accent; what came in
// (new orders) is the de-emphasised grey context. The pair was checked with the dataviz
// validator: colour-blind ΔE 25, normal-vision ΔE 28. The grey is intentionally low-chroma and
// sits under 3:1 on white, so identity is also carried by the legend, the tooltip and the table.
const config = {
  created: { label: "New orders", color: "#94a3b8" },
  delivered: { label: "Delivered", color: "#4f46e5" },
} satisfies ChartConfig;

type Row = { hour: number; created: number; delivered: number };

const hourLabel = (h: number) => `${h % 12 || 12}${h < 12 ? "a" : "p"}`;

export function HourlyChart({ data }: { data: Row[] }) {
  const rows = data.map((r) => ({ ...r, label: hourLabel(r.hour) }));
  const totals = data.reduce((t, r) => ({ created: t.created + r.created, delivered: t.delivered + r.delivered }), { created: 0, delivered: 0 });

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {(["delivered", "created"] as const).map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-sm" style={{ background: config[k].color }} />
            {config[k].label}
            <span className="font-medium text-foreground">{totals[k]}</span>
          </span>
        ))}
      </div>

      <ChartContainer config={config} className="aspect-auto h-52 w-full">
        <BarChart data={rows} barGap={2} barCategoryGap="22%" margin={{ top: 6, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          {/* every 3rd hour keeps ticks evenly spaced and readable at any width */}
          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={6} interval={2} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} />
          <ChartTooltip cursor={{ fill: "var(--muted)", opacity: 0.6 }} content={<ChartTooltipContent indicator="line" />} />
          {/* Entry animation off: bars are present immediately (also friendlier to reduced-motion users). */}
          <Bar dataKey="delivered" fill="var(--color-delivered)" radius={[4, 4, 0, 0]} maxBarSize={14} isAnimationActive={false} />
          <Bar dataKey="created" fill="var(--color-created)" radius={[4, 4, 0, 0]} maxBarSize={14} isAnimationActive={false} />
        </BarChart>
      </ChartContainer>

      <details className="mt-2 text-xs text-muted-foreground">
        <summary className="cursor-pointer select-none hover:text-foreground">View as table</summary>
        <table className="mt-2 w-full text-left tabular-nums">
          <caption className="sr-only">Orders created and delivered per hour today</caption>
          <thead>
            <tr>
              <th scope="col" className="py-1 pr-3 font-medium">Hour</th>
              <th scope="col" className="py-1 pr-3 font-medium">New orders</th>
              <th scope="col" className="py-1 font-medium">Delivered</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.hour} className="border-t">
                <th scope="row" className="py-1 pr-3 font-normal">{r.label}</th>
                <td className="py-1 pr-3">{r.created}</td>
                <td className="py-1">{r.delivered}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
