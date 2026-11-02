import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, PhoneIcon, WrenchIcon } from "lucide-react";
import { AvailabilityControl } from "@/components/drivers/availability-control";
import { DailyBars } from "@/components/drivers/daily-bars";
import { RunList } from "@/components/drivers/run-list";
import { PageHeader } from "@/components/layout/page-header";
import { KpiTile } from "@/components/dashboard/kpi-tile";
import { AutoRefresh } from "@/components/shared/auto-refresh";
import { StatusBadge } from "@/components/shared/badges";
import { DriverAvatar } from "@/components/shared/driver-avatar";
import { VehicleThumb } from "@/components/shared/vehicle-thumb";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDb } from "@/db";
import { formatDateTime, formatDuration } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { DRIVER_STATE_META, VEHICLE_TYPE_LABEL } from "@/lib/status";
import { cn } from "@/lib/utils";
import { requireActor } from "@/server/auth/dal";
import { getDriverDetail } from "@/server/queries/drivers";
import { getGeneralSettings } from "@/server/queries/settings";

export const metadata: Metadata = { title: "Driver" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function DriverDetailPage({ params }: PageProps<"/drivers/[id]">) {
  const actor = await requireActor("driver:view");
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const db = await getDb();
  const settings = await getGeneralSettings(db);
  const now = new Date();
  const detail = await getDriverDetail(db, id, { tz: settings.timezone, now });
  if (!detail) notFound();

  const { summary: d, run, stats, recent } = detail;
  const state = DRIVER_STATE_META[d.state];
  const tz = settings.timezone;

  return (
    <>
      <Link href="/drivers" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" /> All drivers
      </Link>

      <div className="mb-5 flex flex-wrap items-center gap-4">
        <DriverAvatar name={d.name} size="xl" />
        <div className="min-w-0 flex-1">
          <PageHeader
            className="mb-1"
            title={d.name}
            description={
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <a href={`tel:${d.phone}`} className="inline-flex items-center gap-1.5 hover:text-foreground">
                  <PhoneIcon className="size-3.5" /> {d.phone}
                </a>
                <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", state.badge)}>
                  <span aria-hidden className={cn("size-1.5 rounded-full", state.dot)} />
                  {state.label}
                </span>
                {d.homeAreaName && <span>Home zone: {d.homeAreaName}</span>}
              </span>
            }
            actions={<AutoRefresh renderedAt={now.toISOString()} />}
          />
          {can(actor.role, "driver:manage") && (
            <div className="mt-2 flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Availability</span>
              <AvailabilityControl driverId={d.id} value={d.availability} />
            </div>
          )}
        </div>
      </div>

      <section aria-label="Performance, last 14 days" className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label={`Delivered · ${stats.windowDays} days`} value={stats.delivered} context={`${d.deliveredToday} today`} />
        <KpiTile
          label="On-time rate"
          value={stats.onTimeRate === null ? "—" : `${Math.round(stats.onTimeRate * 100)}%`}
          context={stats.delivered > 0 ? `${stats.onTime} of ${stats.delivered} inside the window` : "No deliveries yet"}
        />
        <KpiTile
          label="Pickup → delivered"
          value={stats.avgDeliveryMinutes === null ? "—" : formatDuration(stats.avgDeliveryMinutes)}
          context="Average time per delivery"
        />
        <KpiTile
          label="Failed attempts"
          value={stats.failedAttempts}
          tone={stats.failedAttempts > 2 ? "attention" : "default"}
          context={`${stats.exceptionsRaised} problem${stats.exceptionsRaised === 1 ? "" : "s"} reported`}
        />
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-5">
          <Card className="gap-0 py-0">
            <CardHeader className="border-b py-3">
              <CardTitle>Current run</CardTitle>
              <CardDescription>
                {run.length} order{run.length === 1 ? "" : "s"} in stop order
                {can(actor.role, "order:assign") ? " · use the arrows to re-sequence" : ""}
              </CardDescription>
            </CardHeader>
            <RunList stops={run} canReorder={can(actor.role, "order:assign")} tz={tz} nowIso={now.toISOString()} atRiskMinutes={settings.atRiskMinutes} />
          </Card>

          <Card className="gap-0 py-0">
            <CardHeader className="border-b py-3">
              <CardTitle>Recent deliveries</CardTitle>
            </CardHeader>
            {recent.length === 0 ? (
              <p className="px-4 py-8 text-sm text-muted-foreground">Nothing delivered yet.</p>
            ) : (
              <ul className="divide-y">
                {recent.map((r) => {
                  const late = r.deliveredAt && r.deliveredAt > r.windowEnd;
                  return (
                    <li key={r.orderId} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                      <Link href={`/orders/${r.orderId}`} className="font-mono text-[13px] font-semibold hover:text-primary hover:underline">
                        {r.reference}
                      </Link>
                      <StatusBadge status={r.status} />
                      <span className="min-w-0 flex-1 truncate text-muted-foreground">
                        {r.customerName} · {r.areaCode}
                      </span>
                      <span className={cn("text-xs tabular-nums", late ? "text-warning-foreground" : "text-muted-foreground")}>
                        {r.deliveredAt ? `${formatDateTime(r.deliveredAt, tz)}${late ? " · late" : ""}` : formatDateTime(r.updatedAt, tz)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>

        <aside className="min-w-0 space-y-5">
          <Card>
            <CardHeader className="pb-0">
              <CardTitle className="text-sm">Vehicle</CardTitle>
            </CardHeader>
            <CardContent>
              {d.vehicle ? (
                <div className="space-y-3">
                  <VehicleThumb type={d.vehicle.type} className="w-full" />
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-muted-foreground">Type</dt>
                      <dd>{VEHICLE_TYPE_LABEL[d.vehicle.type]}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-muted-foreground">Plate</dt>
                      <dd className="font-mono">{d.vehicle.plate}</dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-xs uppercase tracking-wide text-muted-foreground">Model</dt>
                      <dd>
                        {d.vehicle.make} {d.vehicle.model}
                      </dd>
                    </div>
                  </dl>
                  {d.vehicle.status !== "active" && (
                    <p className="flex items-start gap-2 rounded-md border border-warning-border bg-warning-soft px-3 py-2 text-sm text-warning-foreground">
                      <WrenchIcon className="mt-0.5 size-4 shrink-0" />
                      Vehicle is {d.vehicle.status === "maintenance" ? "in maintenance" : "retired"}. This driver cannot be assigned orders.
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No vehicle assigned.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-0">
              <CardTitle className="text-sm">Deliveries per day</CardTitle>
              <CardDescription>Last {stats.windowDays} days</CardDescription>
            </CardHeader>
            <CardContent>
              <DailyBars data={stats.perDay} />
            </CardContent>
          </Card>
        </aside>
      </div>
    </>
  );
}
