import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "default" | "attention" | "danger" | "good";

const TONES: Record<Tone, { card: string; value: string }> = {
  default: { card: "bg-card hover:border-primary/40", value: "text-foreground" },
  attention: { card: "border-warning-border bg-warning-soft hover:border-warning", value: "text-warning-foreground" },
  danger: { card: "border-red-200 bg-red-50 hover:border-red-400", value: "text-red-700" },
  good: { card: "bg-card hover:border-primary/40", value: "text-foreground" },
};

/**
 * Stat tile: label, a single large value, and one line of context. The whole tile is a link
 * to the filtered list behind the number.
 */
export function KpiTile({
  label,
  value,
  context,
  tone = "default",
  href,
  icon,
}: {
  label: string;
  value: ReactNode;
  context?: ReactNode;
  tone?: Tone;
  href?: string;
  icon?: ReactNode;
}) {
  const t = TONES[tone];
  const body = (
    <>
      <div className="flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground">
        <span className={cn(tone === "attention" && "text-warning-foreground", tone === "danger" && "text-red-700")}>{label}</span>
        {icon}
      </div>
      <div className={cn("mt-1.5 text-3xl font-semibold leading-none tracking-tight", t.value)}>{value}</div>
      {context && <div className="mt-2 text-xs text-muted-foreground">{context}</div>}
    </>
  );
  const cls = cn("block rounded-xl border p-4 shadow-xs transition-colors focus-visible:outline-2 focus-visible:outline-ring", t.card);
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
