import type { Metadata } from "next";
import { DriversFilters } from "@/components/drivers/drivers-filters";
import { DriversTable } from "@/components/drivers/drivers-table";
import { PageHeader } from "@/components/layout/page-header";
import { AutoRefresh } from "@/components/shared/auto-refresh";
import { getDb } from "@/db";
import { dayRangeInTz } from "@/lib/dates";
import { DRIVER_AVAILABILITIES, VEHICLE_TYPES } from "@/lib/domain";
import { DRIVER_STATE_META } from "@/lib/status";
import type { SearchParams } from "@/lib/validation/filters";
import { requireActor } from "@/server/auth/dal";
import { getDriverSummaries, listAreas } from "@/server/queries/drivers";
import { getGeneralSettings } from "@/server/queries/settings";

export const metadata: Metadata = { title: "Drivers" };

const list = (v: string | string[] | undefined, allowed?: readonly string[]) => {
  const raw = (Array.isArray(v) ? v[0] : v)?.split(",").filter(Boolean) ?? [];
  return allowed ? raw.filter((x) => allowed.includes(x)) : raw;
};

export default async function DriversPage({ searchParams }: PageProps<"/drivers">) {
  await requireActor("driver:view");
  const params: SearchParams = await searchParams;
  const q = (Array.isArray(params.q) ? params.q[0] : params.q)?.trim() || undefined;
  const values = {
    q,
    availability: list(params.availability, DRIVER_AVAILABILITIES),
    vehicle: list(params.vehicle, VEHICLE_TYPES),
    area: list(params.area),
  };

  const db = await getDb();
  const settings = await getGeneralSettings(db);
  const now = new Date();
  const [all, areas] = await Promise.all([
    getDriverSummaries(db, dayRangeInTz(now, settings.timezone), now),
    listAreas(db),
  ]);

  const needle = q?.toLowerCase();
  const filtered = all
    .filter((d) => (values.availability.length ? values.availability.includes(d.availability) : true))
    .filter((d) => (values.vehicle.length ? !!d.vehicle && values.vehicle.includes(d.vehicle.type) : true))
    .filter((d) => (values.area.length ? !!d.homeAreaId && values.area.includes(d.homeAreaId) : true))
    .filter((d) => (needle ? [d.name, d.phone, d.vehicle?.plate ?? "", d.homeAreaName ?? ""].some((s) => s.toLowerCase().includes(needle)) : true))
    // Working drivers first, then by name.
    .sort((a, b) => DRIVER_STATE_META[a.state].rank - DRIVER_STATE_META[b.state].rank || a.name.localeCompare(b.name));

  const filtersActive = !!q || values.availability.length > 0 || values.vehicle.length > 0 || values.area.length > 0;

  return (
    <>
      <PageHeader
        title="Drivers"
        description={`${filtered.length} of ${all.length} drivers · profiles, availability and vehicles`}
        actions={<AutoRefresh renderedAt={now.toISOString()} />}
      />
      <DriversFilters values={values} areas={areas} />
      <DriversTable drivers={filtered} filtersActive={filtersActive} />
    </>
  );
}
