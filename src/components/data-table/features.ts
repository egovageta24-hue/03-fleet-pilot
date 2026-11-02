import { rowSelectionFeature, rowSortingFeature, tableFeatures } from "@tanstack/react-table";

/** Per-column presentation hints, read by `DataTableView`. */
export type AppColumnMeta = {
  /** Hide this column below the given breakpoint (secondary columns on small screens). */
  hideBelow?: "sm" | "md" | "lg" | "xl" | "2xl";
  /** Keep this column pinned while the table scrolls horizontally. */
  sticky?: boolean;
  headClassName?: string;
  cellClassName?: string;
};

// Sorting, filtering and paging are done by the server (SQL) and mirrored in the URL, so the
// table only registers the features it needs for rendering and local interaction.
export const features = tableFeatures({
  rowSortingFeature,
  rowSelectionFeature,
  columnMeta: {} as AppColumnMeta,
});

export type AppFeatures = typeof features;
