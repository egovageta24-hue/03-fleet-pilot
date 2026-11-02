// Timezone-aware date helpers built on Intl (no extra dependency). "Today" in FleetPilot
// means the company's calendar day in the timezone configured in Settings.

type Parts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

const formatters = new Map<string, Intl.DateTimeFormat>();
function dtf(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
    formatters.set(tz, f);
  }
  return f;
}

/** Wall-clock components of an instant in a timezone. */
export function zonedParts(date: Date, tz: string): Parts {
  const out: Record<string, number> = {};
  for (const p of dtf(tz).formatToParts(date)) {
    if (p.type !== "literal") out[p.type] = Number(p.value);
  }
  return {
    year: out.year,
    month: out.month,
    day: out.day,
    hour: out.hour === 24 ? 0 : out.hour,
    minute: out.minute,
    second: out.second,
  };
}

/** Offset of `tz` from UTC at `date`, in ms (positive = ahead of UTC). */
function offsetMs(date: Date, tz: string): number {
  const p = zonedParts(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** The instant at which the given local calendar date begins in `tz`. Month is 1-12; day may overflow. */
export function zonedMidnight(year: number, month: number, day: number, tz: string): Date {
  const utcGuess = Date.UTC(year, month - 1, day);
  let t = utcGuess - offsetMs(new Date(utcGuess), tz);
  // Re-check across a DST boundary.
  const corrected = utcGuess - offsetMs(new Date(t), tz);
  if (corrected !== t) t = corrected;
  return new Date(t);
}

export function startOfDayInTz(date: Date, tz: string): Date {
  const p = zonedParts(date, tz);
  return zonedMidnight(p.year, p.month, p.day, tz);
}

/** [start, end) of the calendar day containing `date`, shifted by `offsetDays`. */
export function dayRangeInTz(date: Date, tz: string, offsetDays = 0): { start: Date; end: Date } {
  const p = zonedParts(date, tz);
  return {
    start: zonedMidnight(p.year, p.month, p.day + offsetDays, tz),
    end: zonedMidnight(p.year, p.month, p.day + offsetDays + 1, tz),
  };
}

/** `YYYY-MM-DD` of an instant in a timezone. */
export function isoDateInTz(date: Date, tz: string): string {
  const p = zonedParts(date, tz);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Start of the local day for a `YYYY-MM-DD` string. */
export function parseIsoDateInTz(iso: string, tz: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return zonedMidnight(y, m, d, tz);
}

/** `2026-10-15 09:30` in the given timezone (unambiguous and spreadsheet-friendly). */
export function formatLocalStamp(date: Date | string | number, tz: string): string {
  const p = zonedParts(new Date(date), tz);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}`;
}

/**
 * Interpret a wall-clock `YYYY-MM-DDTHH:mm` (e.g. from a datetime-local input) as a time in `tz`.
 * Returns null for anything that is not that format.
 */
export function parseLocalInTz(local: string, tz: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})$/.exec(local.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  return new Date(zonedMidnight(y, mo, d, tz).getTime() + (h * 60 + mi) * 60_000);
}

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function systemTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export function formatTime(date: Date | string | number, tz: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(
    new Date(date),
  );
}

export function formatDate(date: Date | string | number, tz: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric" }).format(
    new Date(date),
  );
}

export function formatDateTime(date: Date | string | number, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(date));
}

/** "2h 05m" / "45m" / "<1m" for a duration in minutes. */
export function formatDuration(minutes: number): string {
  const m = Math.round(Math.abs(minutes));
  if (m < 1) return "<1m";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h}h` : `${h}h ${String(rest).padStart(2, "0")}m`;
}

/** Minutes from `now` until `target` (negative if already past). */
export function minutesUntil(target: Date | string | number, now: Date = new Date()): number {
  return (new Date(target).getTime() - now.getTime()) / 60_000;
}
