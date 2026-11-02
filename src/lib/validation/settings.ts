import { z } from "zod";
import { isValidTimezone } from "@/lib/dates";

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24-hour)");

export const generalSettingsSchema = z.object({
  companyName: z.string().trim().min(1, "Company name is required").max(80),
  timezone: z.string().refine(isValidTimezone, "Unknown timezone"),
  /** Default length of a delivery window when creating an order. */
  defaultWindowMinutes: z.number().int().min(30).max(720),
  /** An open order whose window ends within this many minutes is flagged "at risk". */
  atRiskMinutes: z.number().int().min(5).max(240),
  operatingStart: hhmm,
  operatingEnd: hhmm,
});
export type GeneralSettings = z.infer<typeof generalSettingsSchema>;

export const SETTINGS_KEY = "general";

export const DEFAULT_SETTINGS: GeneralSettings = {
  companyName: "FleetPilot Logistics",
  timezone: "UTC",
  defaultWindowMinutes: 120,
  atRiskMinutes: 45,
  operatingStart: "07:00",
  operatingEnd: "20:00",
};
