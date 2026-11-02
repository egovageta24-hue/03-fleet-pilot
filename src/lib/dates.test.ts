import { describe, expect, it } from "vitest";
import {
  dayRangeInTz,
  formatDuration,
  formatLocalStamp,
  isoDateInTz,
  parseIsoDateInTz,
  parseLocalInTz,
  startOfDayInTz,
} from "./dates";

describe("timezone day boundaries", () => {
  it("finds local midnight for zones ahead of and behind UTC", () => {
    const t = new Date("2026-10-15T20:30:00Z");
    // Karachi is UTC+5 (no DST): 20:30Z is already Oct 16 01:30 there.
    expect(isoDateInTz(t, "Asia/Karachi")).toBe("2026-10-16");
    expect(startOfDayInTz(t, "Asia/Karachi").toISOString()).toBe("2026-10-15T19:00:00.000Z");
    // New York in October is UTC-4 (EDT): still Oct 15.
    expect(isoDateInTz(t, "America/New_York")).toBe("2026-10-15");
    expect(startOfDayInTz(t, "America/New_York").toISOString()).toBe("2026-10-15T04:00:00.000Z");
  });

  it("handles 23- and 25-hour days around DST changes", () => {
    // US spring forward: 2026-03-08 has 23 hours in New York.
    const spring = dayRangeInTz(new Date("2026-03-08T18:00:00Z"), "America/New_York");
    expect((spring.end.getTime() - spring.start.getTime()) / 3_600_000).toBe(23);
    // US fall back: 2026-11-01 has 25 hours.
    const fall = dayRangeInTz(new Date("2026-11-01T18:00:00Z"), "America/New_York");
    expect((fall.end.getTime() - fall.start.getTime()) / 3_600_000).toBe(25);
  });

  it("shifts by whole local days", () => {
    const now = new Date("2026-10-15T10:00:00Z");
    const yesterday = dayRangeInTz(now, "UTC", -1);
    expect(yesterday.start.toISOString()).toBe("2026-10-14T00:00:00.000Z");
    expect(yesterday.end.toISOString()).toBe("2026-10-15T00:00:00.000Z");
  });

  it("round-trips an ISO date", () => {
    expect(isoDateInTz(parseIsoDateInTz("2026-10-15", "Asia/Karachi"), "Asia/Karachi")).toBe("2026-10-15");
  });
});

describe("parseLocalInTz", () => {
  it("reads a wall-clock time in the company timezone, not the server's", () => {
    expect(parseLocalInTz("2026-10-15T09:30", "Asia/Karachi")?.toISOString()).toBe("2026-10-15T04:30:00.000Z");
    expect(parseLocalInTz("2026-10-15T09:30", "UTC")?.toISOString()).toBe("2026-10-15T09:30:00.000Z");
    expect(parseLocalInTz("2026-10-15 09:30", "UTC")?.toISOString()).toBe("2026-10-15T09:30:00.000Z");
  });

  it("is the inverse of formatLocalStamp", () => {
    const d = new Date("2026-10-15T04:30:00Z");
    expect(parseLocalInTz(formatLocalStamp(d, "Asia/Karachi").replace(" ", "T"), "Asia/Karachi")?.toISOString()).toBe(d.toISOString());
  });

  it("rejects malformed values", () => {
    for (const bad of ["", "tomorrow", "2026-13-01T10:00", "2026-10-15T25:00", "2026-10-15"]) {
      expect(parseLocalInTz(bad, "UTC")).toBeNull();
    }
  });
});

describe("formatDuration", () => {
  it("formats minutes compactly", () => {
    expect(formatDuration(0.2)).toBe("<1m");
    expect(formatDuration(45)).toBe("45m");
    expect(formatDuration(60)).toBe("1h");
    expect(formatDuration(125)).toBe("2h 05m");
    expect(formatDuration(-12)).toBe("12m");
  });
});
