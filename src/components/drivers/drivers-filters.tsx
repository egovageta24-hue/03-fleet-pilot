"use client";

import { SearchIcon, XIcon } from "lucide-react";
import { MultiSelectFilter } from "@/components/shared/multi-select-filter";
import { useUrlState } from "@/components/shared/use-url-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DRIVER_AVAILABILITIES, VEHICLE_TYPES } from "@/lib/domain";
import { AVAILABILITY_META, VEHICLE_TYPE_LABEL } from "@/lib/status";

export type DriverFilterValues = { q?: string; availability: string[]; vehicle: string[]; area: string[] };

export function DriversFilters({
  values,
  areas,
}: {
  values: DriverFilterValues;
  areas: { id: string; name: string; code: string }[];
}) {
  const { update } = useUrlState();
  const csv = (v: string[]) => (v.length ? v.join(",") : null);
  const any = !!values.q || values.availability.length > 0 || values.vehicle.length > 0 || values.area.length > 0;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {/* Submit-to-search: the box is remounted (key) when the URL changes, so it never fights typing. */}
      <form
        role="search"
        className="relative min-w-0 flex-1 basis-56 sm:max-w-sm"
        onSubmit={(e) => {
          e.preventDefault();
          const q = String(new FormData(e.currentTarget).get("q") ?? "").trim();
          update({ q: q || null });
        }}
      >
        <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input key={values.q ?? ""} name="q" type="search" defaultValue={values.q ?? ""} placeholder="Search name, phone, plate…" aria-label="Search drivers" className="pl-8" />
      </form>
      <MultiSelectFilter
        label="Availability"
        selected={values.availability}
        onChange={(v) => update({ availability: csv(v) })}
        options={DRIVER_AVAILABILITIES.map((a) => ({ value: a, label: AVAILABILITY_META[a].label }))}
      />
      <MultiSelectFilter
        label="Vehicle"
        selected={values.vehicle}
        onChange={(v) => update({ vehicle: csv(v) })}
        options={VEHICLE_TYPES.map((t) => ({ value: t, label: VEHICLE_TYPE_LABEL[t] }))}
      />
      <MultiSelectFilter
        label="Home zone"
        selected={values.area}
        onChange={(v) => update({ area: csv(v) })}
        options={areas.map((a) => ({ value: a.id, label: a.name, hint: a.code }))}
      />
      {any && (
        <Button variant="ghost" className="text-muted-foreground" onClick={() => update({ q: null, availability: null, vehicle: null, area: null })}>
          <XIcon /> Clear
        </Button>
      )}
    </div>
  );
}
