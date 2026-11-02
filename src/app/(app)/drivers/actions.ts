"use server";

import { z } from "zod";
import { getDb } from "@/db";
import { DRIVER_AVAILABILITIES } from "@/lib/domain";
import { runAction, revalidateOperations } from "@/server/actions/run-action";
import { requireActorForAction } from "@/server/auth/dal";
import { setDriverAvailability } from "@/server/drivers/availability";

const schema = z.object({ driverId: z.uuid(), availability: z.enum(DRIVER_AVAILABILITIES) });

export async function setAvailabilityAction(input: unknown) {
  return runAction(async () => {
    const actor = await requireActorForAction();
    const data = schema.parse(input);
    const db = await getDb();
    await setDriverAvailability(db, { ...data, actor });
    revalidateOperations();
    return null;
  });
}
