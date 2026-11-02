import type { CsvColumn } from "@/lib/csv";
import { formatLocalStamp } from "@/lib/dates";
import { ORDER_STATUS_META, PRIORITY_META } from "@/lib/status";
import type { ReportRow } from "@/server/queries/reports";

const round = (n: number | null) => (n === null ? null : Math.round(n));

/** Columns of the exported report. Timestamps are in the company timezone. */
export function reportCsvColumns(tz: string): CsvColumn<ReportRow>[] {
  const stamp = (d: Date | null) => (d ? formatLocalStamp(d, tz) : null);
  return [
    { header: "Order", value: (r) => r.reference },
    { header: "Delivery date", value: (r) => r.deliveryDate },
    { header: "Window start", value: (r) => stamp(r.windowStart) },
    { header: "Window end", value: (r) => stamp(r.windowEnd) },
    { header: "Status", value: (r) => ORDER_STATUS_META[r.status].label },
    { header: "Priority", value: (r) => PRIORITY_META[r.priority].label },
    { header: "Merchant", value: (r) => r.merchantName },
    { header: "Customer", value: (r) => r.customerName },
    { header: "Address", value: (r) => r.addressLine },
    { header: "Postcode", value: (r) => r.postcode },
    { header: "Area", value: (r) => r.areaName },
    { header: "Driver", value: (r) => r.driverName },
    { header: "Vehicle", value: (r) => r.vehiclePlate },
    { header: "Created", value: (r) => stamp(r.createdAt) },
    { header: "First assigned", value: (r) => stamp(r.firstAssignedAt) },
    { header: "Picked up", value: (r) => stamp(r.pickedUpAt) },
    { header: "Delivered", value: (r) => stamp(r.deliveredAt) },
    { header: "On time", value: (r) => (r.onTime === null ? null : r.onTime ? "Yes" : "No") },
    { header: "Minutes to assign", value: (r) => round(r.assignMinutes) },
    { header: "Minutes pickup to delivery", value: (r) => round(r.deliveryMinutes) },
    { header: "Open exceptions", value: (r) => r.openExceptions },
  ];
}
