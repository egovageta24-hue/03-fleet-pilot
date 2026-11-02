import type { Metadata } from "next";
import { DownloadIcon } from "lucide-react";
import { KpiTile } from "@/components/dashboard/kpi-tile";
import { StatusMix } from "@/components/dashboard/status-mix";
import { PageHeader } from "@/components/layout/page-header";
import { OrdersFilters } from "@/components/orders/orders-filters";
import { DriverBars } from "@/components/reports/driver-bars";
import { PerDayChart } from "@/components/reports/per-day-chart";
import { ReportTable } from "@/components/reports/report-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDb } from "@/db";
import { formatDuration } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { filtersToQuery, parseOrderFilters } from "@/lib/validation/filters";
import { requireActor } from "@/server/auth/dal";
import { listAreas, listAssignableDrivers } from "@/server/queries/drivers";
import { getReportSummary, queryReportRows, withReportDefaults } from "@/server/queries/reports";
import { getGeneralSettings } from "@/server/queries/settings";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  const actor = await requireActor("report:view");
  const db = await getDb();
  const settings = await getGeneralSettings(db);
  const now = new Date();
  const ctx = { tz: settings.timezone, now, atRiskMinutes: settings.atRiskMinutes };
  const filters = withReportDefaults(parseOrderFilters(await searchParams), ctx.tz, now);

  const [summary, rows, drivers, areas] = await Promise.all([
    getReportSummary(db, actor, filters, ctx),
    queryReportRows(db, actor, filters, ctx, { limit: filters.size, offset: (filters.page - 1) * filters.size }),
    listAssignableDrivers(db),
    listAreas(db),
  ]);

  // The export link carries exactly the filters on screen (minus paging).
  const exportQuery = filtersToQuery(filters, { page: 1, size: 25, sort: "created", dir: "desc" });
  const filtersActive = !!(filters.q || filters.status?.length || filters.priority?.length || filters.area?.length || filters.driver?.length);

  return (
    <>
      <PageHeader
        title="Reports"
        description={`Delivery performance · ${filters.from ?? "start"} to ${filters.to ?? "today"} · ${summary.total.toLocaleString()} orders`}
        actions={
          can(actor.role, "report:export") && (
            <Button asChild>
              <a href={`/api/reports/export${exportQuery ? `?${exportQuery}` : ""}`} download>
                <DownloadIcon /> Export CSV
              </a>
            </Button>
          )
        }
      />

      <OrdersFilters
        filters={filters}
        areas={areas}
        drivers={drivers.map((d) => ({ id: d.id, name: d.name }))}
        show={{ search: true, attention: false, priority: true }}
        dateLabel="Delivery date"
      />

      <section aria-label="Summary" className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <KpiTile label="Orders" value={summary.total.toLocaleString()} context={`${summary.open} still open`} />
        <KpiTile
          label="Delivered"
          value={summary.delivered.toLocaleString()}
          context={summary.total > 0 ? `${Math.round((summary.delivered / summary.total) * 100)}% of orders` : "—"}
        />
        <KpiTile
          label="On-time rate"
          value={summary.onTimeRate === null ? "—" : `${Math.round(summary.onTimeRate * 100)}%`}
          context={summary.delivered > 0 ? `${summary.onTime} of ${summary.delivered} in window` : "No deliveries"}
        />
        <KpiTile
          label="Failed or cancelled"
          value={summary.notCompleted.toLocaleString()}
          tone={summary.notCompleted > 0 ? "attention" : "default"}
          context="Did not complete"
        />
        <KpiTile
          label="Time to assign"
          value={summary.avgAssignMinutes === null ? "—" : formatDuration(summary.avgAssignMinutes)}
          context="Average, creation to driver"
        />
        <KpiTile
          label="Pickup → delivered"
          value={summary.avgDeliveryMinutes === null ? "—" : formatDuration(summary.avgDeliveryMinutes)}
          context="Average per delivery"
        />
      </section>

      <div className="mb-5 grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Orders per delivery day</CardTitle>
            <CardDescription>Delivered against not delivered, by the day the window ends.</CardDescription>
          </CardHeader>
          <CardContent>
            <PerDayChart data={summary.perDay} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Status mix</CardTitle>
            <CardDescription>All orders in the selected range.</CardDescription>
          </CardHeader>
          <CardContent>
            <StatusMix data={summary.statusMix} />
          </CardContent>
        </Card>
      </div>

      <Card className="mb-5">
        <CardHeader>
          <CardTitle>On-time rate by driver</CardTitle>
          <CardDescription>Deliveries inside their window, busiest drivers first.</CardDescription>
        </CardHeader>
        <CardContent>
          <DriverBars rows={summary.byDriver} />
        </CardContent>
      </Card>

      <h2 className="mb-2 text-sm font-semibold">Orders in this report</h2>
      <ReportTable rows={rows} tz={ctx.tz} page={filters.page} pageSize={filters.size} total={summary.total} filtersActive={filtersActive} />
    </>
  );
}
