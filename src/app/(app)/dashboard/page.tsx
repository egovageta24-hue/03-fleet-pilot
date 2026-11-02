import type { Metadata } from "next";
import { AlertTriangleIcon, CheckCheckIcon, ClockAlertIcon, PackageIcon, TimerIcon, TruckIcon } from "lucide-react";
import { AttentionList } from "@/components/dashboard/attention-list";
import { DriverPanel } from "@/components/dashboard/driver-panel";
import { HourlyChart } from "@/components/dashboard/hourly-chart";
import { KpiTile } from "@/components/dashboard/kpi-tile";
import { OperationsMap } from "@/components/dashboard/operations-map";
import { StatusMix } from "@/components/dashboard/status-mix";
import { PageHeader } from "@/components/layout/page-header";
import { NewOrderDialog } from "@/components/orders/new-order-dialog";
import { AutoRefresh } from "@/components/shared/auto-refresh";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDb } from "@/db";
import { formatDuration } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { requireActor } from "@/server/auth/dal";
import { getDashboard } from "@/server/queries/dashboard";
import { listAssignableDrivers } from "@/server/queries/drivers";
import { getNewOrderFormData } from "@/server/queries/new-order";
import { getGeneralSettings } from "@/server/queries/settings";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const actor = await requireActor("dashboard:view");
  const db = await getDb();
  const settings = await getGeneralSettings(db);
  const now = new Date();

  const [data, assignable, newOrder] = await Promise.all([
    getDashboard(db, actor, {
      tz: settings.timezone,
      now,
      atRiskMinutes: settings.atRiskMinutes,
      operatingStart: settings.operatingStart,
      operatingEnd: settings.operatingEnd,
    }),
    listAssignableDrivers(db),
    can(actor.role, "order:create") ? getNewOrderFormData(db, settings, now) : Promise.resolve(null),
  ]);

  const k = data.kpis;
  const canAssign = can(actor.role, "order:assign");
  const today = new Intl.DateTimeFormat("en-US", { timeZone: settings.timezone, weekday: "long", month: "long", day: "numeric" }).format(now);
  const lateOrRisk = k.overdue + k.atRisk;

  return (
    <>
      <PageHeader
        title="Operations dashboard"
        description={`${today} · ${settings.companyName}`}
        actions={
          <>
            {newOrder && <NewOrderDialog {...newOrder} />}
            <AutoRefresh renderedAt={now.toISOString()} />
          </>
        }
      />

      <section aria-label="Key figures" className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <KpiTile
          label="Unassigned"
          value={k.unassigned}
          tone={k.unassigned > 0 ? "attention" : "default"}
          href="/orders?status=unassigned&sort=window&dir=asc"
          icon={<PackageIcon className="size-4" />}
          context={k.unassigned > 0 ? "Waiting for a driver" : "All orders have a driver"}
        />
        <KpiTile
          label="Late or at risk"
          value={lateOrRisk}
          tone={k.overdue > 0 ? "danger" : lateOrRisk > 0 ? "attention" : "default"}
          href="/orders?attention=1&sort=window&dir=asc"
          icon={<ClockAlertIcon className="size-4" />}
          context={`${k.overdue} overdue · ${k.atRisk} due within ${settings.atRiskMinutes}m`}
        />
        <KpiTile
          label="Active deliveries"
          value={k.active}
          href="/orders?status=assigned,picked_up,out_for_delivery"
          icon={<TruckIcon className="size-4" />}
          context="With a driver right now"
        />
        <KpiTile
          label="Delivered today"
          value={k.deliveredToday}
          href="/orders?status=delivered"
          icon={<CheckCheckIcon className="size-4" />}
          context={`of ${k.todayTotal} orders today`}
        />
        <KpiTile
          label="Open exceptions"
          value={k.openExceptions}
          tone={k.openExceptions > 0 ? "attention" : "default"}
          href="/orders?attention=1"
          icon={<AlertTriangleIcon className="size-4" />}
          context={k.failed > 0 ? `${k.failed} failed ${k.failed === 1 ? "delivery" : "deliveries"}` : "No failed deliveries"}
        />
        <KpiTile
          label="On-time rate"
          value={k.onTimeRate === null ? "—" : `${Math.round(k.onTimeRate * 100)}%`}
          icon={<TimerIcon className="size-4" />}
          context={k.avgAssignMinutes === null ? "Today's deliveries" : `Avg ${formatDuration(k.avgAssignMinutes)} to assign`}
        />
      </section>

      <div className="mb-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <Card className="gap-0 py-0">
          <CardHeader className="border-b py-3">
            <CardTitle className="flex items-center gap-2">
              Needs attention
              {data.attentionTotal > 0 && (
                <span className="rounded-full bg-warning-soft px-2 py-0.5 text-xs font-semibold text-warning-foreground ring-1 ring-inset ring-warning-border">
                  {data.attentionTotal}
                </span>
              )}
            </CardTitle>
            <CardDescription>Most urgent first: overdue, failed, unassigned, exceptions, then at risk.</CardDescription>
          </CardHeader>
          <AttentionList
            items={data.attention}
            total={data.attentionTotal}
            drivers={assignable}
            canAssign={canAssign}
            tz={settings.timezone}
            nowIso={now.toISOString()}
            atRiskMinutes={settings.atRiskMinutes}
          />
        </Card>

        <Card className="gap-0 py-0">
          <CardHeader className="border-b py-3">
            <CardTitle>Drivers</CardTitle>
            <CardDescription>Who is doing what right now.</CardDescription>
          </CardHeader>
          <DriverPanel drivers={data.drivers} canOpen={can(actor.role, "driver:view")} />
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Operational area</CardTitle>
            <CardDescription>Open orders by zone, and where drivers are headed.</CardDescription>
          </CardHeader>
          <CardContent>
            <OperationsMap
              areas={data.map.areas}
              orders={data.map.orders}
              drivers={data.drivers}
              canOpenOrders={can(actor.role, "order:view")}
            />
          </CardContent>
        </Card>

        <div className="grid content-start gap-5">
          <Card>
            <CardHeader>
              <CardTitle>Orders by hour</CardTitle>
              <CardDescription>New orders against deliveries completed today.</CardDescription>
            </CardHeader>
            <CardContent>
              <HourlyChart data={data.hourly} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Today&rsquo;s orders by status</CardTitle>
              <CardDescription>Orders created today plus anything still open.</CardDescription>
            </CardHeader>
            <CardContent>
              <StatusMix data={data.statusMix} />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
