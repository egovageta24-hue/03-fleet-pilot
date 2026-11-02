/**
 * Deliveries per day as a compact bar strip. One series, so one hue and no legend box (the card
 * title names it). Bars grow from a single baseline, 4px-rounded at the top; values live in the
 * hover titles and the sr-only table.
 */
export function DailyBars({ data }: { data: { date: string; delivered: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.delivered));
  const W = 100 / data.length;
  const label = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

  return (
    <div>
      <svg viewBox="0 0 100 34" preserveAspectRatio="none" className="h-24 w-full" role="img" aria-label="Deliveries per day, last 14 days">
        <line x1="0" x2="100" y1="33.5" y2="33.5" stroke="var(--border)" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
        {data.map((d, i) => {
          const h = (d.delivered / max) * 30;
          return (
            <g key={d.date}>
              <rect x={i * W + 0.6} y={33.5 - Math.max(h, d.delivered > 0 ? 0.8 : 0)} width={W - 1.2} height={Math.max(h, d.delivered > 0 ? 0.8 : 0)} rx="0.9" fill="#4f46e5">
                <title>{`${label(d.date)}: ${d.delivered} delivered`}</title>
              </rect>
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>{label(data[0].date)}</span>
        <span>{label(data[data.length - 1].date)}</span>
      </div>
      <table className="sr-only">
        <caption>Deliveries per day</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">Delivered</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.date}>
              <th scope="row">{label(d.date)}</th>
              <td>{d.delivered}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
