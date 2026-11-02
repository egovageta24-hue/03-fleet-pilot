"use server";

import { z } from "zod";
import { getDb } from "@/db";
import { USER_ROLES } from "@/lib/domain";
import { runAction, revalidateOperations } from "@/server/actions/run-action";
import { requireActorForAction } from "@/server/auth/dal";
import { updateGeneralSettings } from "@/server/admin/settings";
import { createUser, resetPassword, updateUser } from "@/server/admin/users";

const password = z.string().min(10, "Use at least 10 characters").max(128);

const createUserSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  email: z.email("Enter a valid email").max(254),
  role: z.enum(USER_ROLES),
  password,
  phone: z.string().trim().max(40).optional(),
});

const updateUserSchema = z.object({
  userId: z.uuid(),
  role: z.enum(USER_ROLES).optional(),
  active: z.boolean().optional(),
});

const resetSchema = z.object({ userId: z.uuid(), password });

export async function updateSettingsAction(input: unknown) {
  return runAction(async () => {
    const actor = await requireActorForAction("settings:manage");
    const db = await getDb();
    const saved = await updateGeneralSettings(db, actor, input);
    revalidateOperations();
    return saved;
  });
}

export async function createUserAction(input: unknown) {
  return runAction(async () => {
    const actor = await requireActorForAction("user:manage");
    const data = createUserSchema.parse(input);
    const db = await getDb();
    const user = await createUser(db, actor, data);
    revalidateOperations();
    return { id: user.id, email: user.email };
  });
}

export async function updateUserAction(input: unknown) {
  return runAction(async () => {
    const actor = await requireActorForAction("user:manage");
    const data = updateUserSchema.parse(input);
    const db = await getDb();
    await updateUser(db, actor, data);
    revalidateOperations();
    return null;
  });
}

export async function resetPasswordAction(input: unknown) {
  return runAction(async () => {
    const actor = await requireActorForAction("user:manage");
    const data = resetSchema.parse(input);
    const db = await getDb();
    await resetPassword(db, actor, data);
    return null;
  });
}
