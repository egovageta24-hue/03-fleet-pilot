import "server-only";
import { eq } from "drizzle-orm";
import { schema, type Db } from "@/db";
import {
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  generalSettingsSchema,
  type GeneralSettings,
} from "@/lib/validation/settings";

/** General settings, merged over defaults so a missing/partial row never breaks a page. */
export async function getGeneralSettings(db: Db): Promise<GeneralSettings> {
  const [row] = await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, SETTINGS_KEY));
  const stored = row && typeof row.value === "object" && row.value ? (row.value as object) : {};
  const parsed = generalSettingsSchema.safeParse({ ...DEFAULT_SETTINGS, ...stored });
  return parsed.success ? parsed.data : DEFAULT_SETTINGS;
}
