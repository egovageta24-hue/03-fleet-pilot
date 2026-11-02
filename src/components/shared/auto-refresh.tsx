"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * "Live" feel without realtime infrastructure (Phase 2): re-runs the page's server
 * components every `intervalMs` while the tab is visible, and offers a manual refresh.
 * `renderedAt` is the server's render time, so the label is honest about data age.
 */
export function AutoRefresh({
  renderedAt,
  intervalMs = 30_000,
  className,
}: {
  renderedAt: string;
  intervalMs?: number;
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [ageSeconds, setAgeSeconds] = useState(0);

  const refresh = useCallback(() => startTransition(() => router.refresh()), [router]);

  // Age label, ticking every few seconds. Reset whenever the server hands us a newer render.
  useEffect(() => {
    const rendered = new Date(renderedAt).getTime();
    const tick = () => setAgeSeconds(Math.max(0, Math.round((Date.now() - rendered) / 1000)));
    tick();
    const id = window.setInterval(tick, 5_000);
    return () => window.clearInterval(id);
  }, [renderedAt]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - new Date(renderedAt).getTime() > intervalMs) {
        refresh();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [intervalMs, refresh, renderedAt]);

  const label = ageSeconds < 10 ? "Live" : ageSeconds < 90 ? `Updated ${ageSeconds}s ago` : `Updated ${Math.round(ageSeconds / 60)}m ago`;

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={refresh}
      aria-label={`Refresh data. ${label}`}
      className={cn("gap-2 text-xs text-muted-foreground", className)}
    >
      <span
        aria-hidden
        className={cn("size-1.5 rounded-full", ageSeconds < 90 ? "bg-emerald-500" : "bg-amber-500")}
      />
      {label}
      <RefreshCwIcon className={cn("size-3.5", pending && "animate-spin")} />
    </Button>
  );
}
