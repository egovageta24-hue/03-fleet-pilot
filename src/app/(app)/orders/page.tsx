import type { Metadata } from "next";
import { NewOrderDialog } from "@/components/orders/new-order-dialog";
import { OrdersFilters } from "@/components/orders/orders-filters";
import { OrdersTable } from "@/components/orders/orders-table";
import { PageHeader } from "@/components/layout/page-header";
import { AutoRefresh } from "@/components/shared/auto-refresh";
import { getDb } from "@/db";
import { can } from "@/lib/permissions";
import { parseOrderFilters } from "@/lib/validation/filters";
import { requireActor } from "@/server/auth/dal";
import { listAreas, listAssignableDrivers } from "@/server/queries/drivers";
import { listOrders } from "@/server/queries/orders";
import { getNewOrderFormData } from "@/server/queries/new-order";
import { getGeneralSettings } from "@/server/queries/settings";

export const metadata: Metadata = { title: "Orders" };

export default async function OrdersPage({ searchParams }: PageProps<"/orders">) {
  const actor = await requireActor("order:view");
  const filters = parseOrderFilters(await searchParams);

  const db = await getDb();
  const settings = await getGeneralSettings(db);
  const now = new Date();
  const ctx = { tz: settings.timezone, now, atRiskMinutes: settings.atRiskMinutes };

  const canCreate = can(actor.role, "order:create");
  const [list, drivers, areas, newOrder] = await Promise.all([
    listOrders(db, actor, filters, ctx),
    listAssignableDrivers(db),
    listAreas(db),
    canCreate ? getNewOrderFormData(db, settings, now) : Promise.resolve(null),
  ]);

  const filtersActive = !!(
    filters.q ||
    filters.status?.length ||
    filters.priority?.length ||
    filters.area?.length ||
    filters.driver?.length ||
    filters.from ||
    filters.to ||
    filters.attention
  );

  return (
    <>
      <PageHeader
        title="Orders"
        description="Search, filter and assign every delivery order."
        actions={
          <>
            {newOrder && <NewOrderDialog {...newOrder} />}
            <AutoRefresh renderedAt={now.toISOString()} />
          </>
        }
      />
      <OrdersFilters filters={filters} areas={areas} drivers={drivers.map((d) => ({ id: d.id, name: d.name }))} />
      <OrdersTable
        list={list}
        sort={filters.sort}
        dir={filters.dir}
        drivers={drivers}
        canAssign={can(actor.role, "order:assign")}
        tz={settings.timezone}
        nowIso={now.toISOString()}
        atRiskMinutes={settings.atRiskMinutes}
        filtersActive={filtersActive}
      />
    </>
  );
}
