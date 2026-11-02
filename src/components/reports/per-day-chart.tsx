"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

// Part-to-whole per day: completed deliveries (accent) vs everything else (neutral grey).
// Same colour pair as the dashboard's hourly chart, validated with the dataviz script
// (colour-blind ΔE 25, normal ΔE 28). Stack segments are separated by a 2px surface stroke.
const config = {
  delivered: { label: "Delivered", color: "#4f46e5" },
  other: { label: "Not delivered", color: "#94a3b8" },
} satisfies ChartConfig;

type Row = { date: string; delivered: number; other: number };

const label = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export function PerDayChart({ data }: { data: Row[] }) {
  const rows = data.map((r) => ({ ...r, label: label(r.date) }));
  const totals = data.reduce((t, r) => ({ delivered: t.delivered + r.delivered, other: t.other + r.other }), { delivered: 0, other: 0 });
  const tickEvery = Math.max(0, Math.ceil(rows.length / 8) - 1);

  if (rows.length === 0) return <p className="py-10 text-center text-sm text-muted-foreground">No orders in this range.</p>;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {(["delivered", "other"] as const).map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-sm" style={{ background: config[k].color }} />
            {config[k].label}
            <span className="font-medium text-foreground">{totals[k]}</span>
          </span>
        ))}
      </div>
      <ChartContainer config={config} className="aspect-auto h-56 w-full">
        <BarChart data={rows} margin={{ top: 6, right: 4, left: 0, bottom: 0 }} barCategoryGap="22%">
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={6} interval={tickEvery} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} />
          <ChartTooltip cursor={{ fill: "var(--muted)", opacity: 0.6 }} content={<ChartTooltipContent indicator="line" />} />
          <Bar dataKey="delivered" stackId="a" fill="var(--color-delivered)" stroke="#fff" strokeWidth={2} maxBarSize={24} isAnimationActive={false} />
          <Bar dataKey="other" stackId="a" fill="var(--color-other)" stroke="#fff" strokeWidth={2} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
        </BarChart>
      </ChartContainer>
      <details className="mt-2 text-xs text-muted-foreground">
        <summary className="cursor-pointer select-none hover:text-foreground">View as table</summary>
        <table className="mt-2 w-full text-left tabular-nums">
          <caption className="sr-only">Orders per delivery day</caption>
          <thead>
            <tr>
              <th scope="col" className="py-1 pr-3 font-medium">Day</th>
              <th scope="col" className="py-1 pr-3 font-medium">Delivered</th>
              <th scope="col" className="py-1 font-medium">Not delivered</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.date} className="border-t">
                <th scope="row" className="py-1 pr-3 font-normal">{r.label}</th>
                <td className="py-1 pr-3">{r.delivered}</td>
                <td className="py-1">{r.other}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
