import "server-only";
import { schema, type Db } from "@/db";
import { invalid } from "@/lib/errors";
import { assertCan, type Actor } from "@/lib/permissions";
import { SETTINGS_KEY, generalSettingsSchema, type GeneralSettings } from "@/lib/validation/settings";

export async function updateGeneralSettings(db: Db, actor: Actor, input: unknown): Promise<GeneralSettings> {
  assertCan(actor, "settings:manage");
  const parsed = generalSettingsSchema.safeParse(input);
  if (!parsed.success) throw invalid(parsed.error.issues[0]?.message ?? "Invalid settings.");
  if (parsed.data.operatingEnd <= parsed.data.operatingStart) throw invalid("Operating hours must end after they start.");

  const now = new Date();
  await db
    .insert(schema.appSettings)
    .values({ key: SETTINGS_KEY, value: parsed.data, updatedAt: now, updatedBy: actor.userId })
    .onConflictDoUpdate({
      target: schema.appSettings.key,
      set: { value: parsed.data, updatedAt: now, updatedBy: actor.userId },
    });
  return parsed.data;
}
