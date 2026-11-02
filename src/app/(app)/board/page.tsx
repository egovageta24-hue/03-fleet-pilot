import type { Metadata } from "next";
import { BoardView } from "@/components/board/board-view";
import { BoardViewToggle } from "@/components/board/view-toggle";
import { PageHeader } from "@/components/layout/page-header";
import { OrdersFilters } from "@/components/orders/orders-filters";
import { AutoRefresh } from "@/components/shared/auto-refresh";
import { getDb } from "@/db";
import { can } from "@/lib/permissions";
import { parseOrderFilters } from "@/lib/validation/filters";
import { requireActor } from "@/server/auth/dal";
import { BOARD_LIMIT, getBoard } from "@/server/queries/board";
import { listAreas, listAssignableDrivers } from "@/server/queries/drivers";
import { getGeneralSettings } from "@/server/queries/settings";

export const metadata: Metadata = { title: "Delivery board" };

export default async function BoardPage({ searchParams }: PageProps<"/board">) {
  const actor = await requireActor("board:view");
  const params = await searchParams;
  const filters = parseOrderFilters(params);
  const view = (Array.isArray(params.view) ? params.view[0] : params.view) === "driver" ? "driver" : "status";

  const db = await getDb();
  const settings = await getGeneralSettings(db);
  const now = new Date();
  const ctx = { tz: settings.timezone, now, atRiskMinutes: settings.atRiskMinutes };

  const [board, drivers, areas] = await Promise.all([getBoard(db, actor, filters, ctx), listAssignableDrivers(db), listAreas(db)]);

  return (
    <>
      <PageHeader
        title="Delivery board"
        description={`${board.total} orders today · open work plus what has been delivered`}
        actions={
          <>
            <BoardViewToggle view={view} />
            <AutoRefresh renderedAt={now.toISOString()} />
          </>
        }
      />
      <OrdersFilters
        filters={filters}
        areas={areas}
        drivers={[]}
        show={{ search: true, attention: true, priority: true, status: false, driver: false, dates: false }}
      />
      {board.truncated && (
        <p role="status" className="mb-3 rounded-md border border-warning-border bg-warning-soft px-3 py-2 text-sm text-warning-foreground">
          Showing the {BOARD_LIMIT} most urgent of {board.total} orders. Narrow the filters to see the rest.
        </p>
      )}
      <BoardView
        orders={board.orders}
        drivers={drivers}
        view={view}
        canAssign={can(actor.role, "order:assign")}
        tz={settings.timezone}
        nowIso={now.toISOString()}
        atRiskMinutes={settings.atRiskMinutes}
      />
    </>
  );
}
