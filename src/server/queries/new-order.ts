import "server-only";
import type { Db } from "@/db";
import { formatLocalStamp } from "@/lib/dates";
import type { GeneralSettings } from "@/lib/validation/settings";
import { listAreas, listPickupLocations } from "./drivers";

const QUARTER = 15 * 60_000;

/** Reference data and a sensible default window (next quarter hour + 30 min, default length) for the New order form. */
export async function getNewOrderFormData(db: Db, settings: GeneralSettings, now: Date) {
  const [pickups, areas] = await Promise.all([listPickupLocations(db), listAreas(db)]);
  const start = new Date(Math.ceil((now.getTime() + 30 * 60_000) / QUARTER) * QUARTER);
  const end = new Date(start.getTime() + settings.defaultWindowMinutes * 60_000);
  const local = (d: Date) => formatLocalStamp(d, settings.timezone).replace(" ", "T");
  return { pickups, areas, defaultStart: local(start), defaultEnd: local(end) };
}
