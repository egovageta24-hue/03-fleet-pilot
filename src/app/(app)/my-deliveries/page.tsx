import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2Icon, PartyPopperIcon } from "lucide-react";
import { AvailabilityControl } from "@/components/drivers/availability-control";
import { DriverStopCard } from "@/components/drivers/driver-stop-card";
import { PageHeader } from "@/components/layout/page-header";
import { AutoRefresh } from "@/components/shared/auto-refresh";
import { getDb, schema } from "@/db";
import { dayRangeInTz, formatTime } from "@/lib/dates";
import { eq } from "drizzle-orm";
import { requireActor } from "@/server/auth/dal";
import { getDeliveredInRange, getDriverRun } from "@/server/queries/drivers";
import { getGeneralSettings } from "@/server/queries/settings";

export const metadata: Metadata = { title: "My deliveries" };

export default async function MyDeliveriesPage() {
  const actor = await requireActor("order:view_own");
  const db = await getDb();
  const settings = await getGeneralSettings(db);
  const now = new Date();

  if (!actor.driverId) {
    return (
      <>
        <PageHeader title="My deliveries" />
        <p className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
          Your account is not linked to a driver profile yet. Ask an administrator to set it up.
        </p>
      </>
    );
  }

  const today = dayRangeInTz(now, settings.timezone);
  const [run, delivered, [driver]] = await Promise.all([
    getDriverRun(db, actor.driverId),
    getDeliveredInRange(db, actor.driverId, today),
    db.select({ availability: schema.drivers.availability }).from(schema.drivers).where(eq(schema.drivers.id, actor.driverId)),
  ]);

  // Failed orders wait for dispatch, so the "next" stop is the first one the driver can act on.
  const nextIndex = run.findIndex((s) => s.status !== "failed");
  const toGo = run.filter((s) => s.status !== "failed").length;
  const firstName = actor.name.split(" ")[0];

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title={`Hi ${firstName}`}
        description={
          toGo > 0
            ? `${toGo} stop${toGo === 1 ? "" : "s"} to go · ${delivered.length} delivered today`
            : `${delivered.length} delivered today`
        }
        actions={<AutoRefresh renderedAt={now.toISOString()} />}
      />

      <div className="mb-5 flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">I am</span>
        {driver && <AvailabilityControl driverId={actor.driverId} value={driver.availability} />}
      </div>

      {run.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border bg-card px-6 py-14 text-center">
          <PartyPopperIcon className="size-8 text-primary" />
          <p className="text-lg font-semibold">No deliveries assigned</p>
          <p className="max-w-xs text-sm text-muted-foreground">
            You&rsquo;re all caught up. New orders appear here as soon as dispatch assigns them to you.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {run.map((s, i) => (
            <DriverStopCard
              key={s.assignmentId}
              stop={s}
              index={i}
              isNext={i === nextIndex}
              tz={settings.timezone}
              nowIso={now.toISOString()}
              atRiskMinutes={settings.atRiskMinutes}
            />
          ))}
        </div>
      )}

      {delivered.length > 0 && (
        <details className="mt-8 rounded-xl border bg-card">
          <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-medium">
            <CheckCircle2Icon className="size-4 text-success" /> Delivered today ({delivered.length})
          </summary>
          <ul className="divide-y border-t">
            {delivered.map((d) => (
              <li key={d.orderId} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <Link href={`/orders/${d.orderId}`} className="font-mono text-[13px] font-semibold hover:text-primary hover:underline">
                  {d.reference}
                </Link>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">
                  {d.customerName} · {d.areaCode}
                </span>
                <span className="text-xs tabular-nums text-muted-foreground">{d.deliveredAt ? formatTime(d.deliveredAt, settings.timezone) : ""}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
