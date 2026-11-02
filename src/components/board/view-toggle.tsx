"use client";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useUrlState } from "@/components/shared/use-url-state";

export function BoardViewToggle({ view }: { view: "status" | "driver" }) {
  const { update } = useUrlState();
  return (
    <ToggleGroup
      type="single"
      value={view}
      variant="outline"
      aria-label="Board layout"
      onValueChange={(v) => v && update({ view: v === "status" ? null : v })}
    >
      <ToggleGroupItem value="status">By status</ToggleGroupItem>
      <ToggleGroupItem value="driver">By driver</ToggleGroupItem>
    </ToggleGroup>
  );
}
