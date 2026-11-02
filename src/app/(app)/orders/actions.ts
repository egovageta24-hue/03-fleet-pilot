"use server";

import { getDb } from "@/db";
import { parseLocalInTz } from "@/lib/dates";
import { invalid } from "@/lib/errors";
import { getGeneralSettings } from "@/server/queries/settings";
import { runAction, revalidateOperations } from "@/server/actions/run-action";
import { requireActorForAction } from "@/server/auth/dal";
import {
  advanceSchema,
  assignSchema,
  bulkAssignSchema,
  createOrderSchema,
  prioritySchema,
  raiseExceptionSchema,
  resolveExceptionSchema,
  unassignSchema,
} from "@/lib/validation/orders";
import { assignOrder, bulkAssign, moveStop, unassignOrder, type BulkAssignResult } from "@/server/orders/assign";
import { createOrder, setPriority } from "@/server/orders/create";
import { raiseException, resolveException } from "@/server/orders/exceptions";
import { advanceOrder } from "@/server/orders/transition";
import { z } from "zod";

// Every action: authenticate -> validate with Zod -> call the service (which re-checks
// permissions and business rules) -> revalidate. Actions are public endpoints; nothing here
// trusts the client.

export async function assignOrderAction(input: unknown) {
  return runAction(async () => {
    const actor = await requireActorForAction("order:assign");
    const data = assignSchema.parse(input);
    const db = await getDb();
    await assignOrder(db, { ...data, actor });
    revalidateOperations();
    return null;
  });
}

export async function bulkAssignAction(input: unknown) {
  return runAction<BulkAssignResult[]>(async () => {
    const actor = await requireActorForAction("order:assign");
    const data = bulkAssignSchema.parse(input);
    const db = await getDb();
    const results = await bulkAssign(db, { ...data, actor });
    revalidateOperations();
    return results;
  });
}

export async function unassignOrderAction(input: unknown) {
  return runAction(async () => {
    const actor = await requireActorForAction("order:assign");
    const data = unassignSchema.parse(input);
    const db = await getDb();
    await unassignOrder(db, { ...data, actor });
    revalidateOperations();
    return null;
  });
}

export async function setPriorityAction(input: unknown) {
  return runAction(async () => {
    const actor = await requireActorForAction("order:priority");
    const data = prioritySchema.parse(input);
    const db = await getDb();
    await setPriority(db, { ...data, actor });
    revalidateOperations();
    return null;
  });
}

export async function advanceOrderAction(input: unknown) {
  return runAction(async () => {
    const actor = await requireActorForAction();
    const data = advanceSchema.parse(input);
    const db = await getDb();
    await advanceOrder(db, { ...data, actor });
    revalidateOperations();
    return null;
  });
}

export async function raiseExceptionAction(input: unknown) {
  return runAction(async () => {
    const actor = await requireActorForAction("exception:raise");
    const data = raiseExceptionSchema.parse(input);
    const db = await getDb();
    await raiseException(db, { ...data, actor });
    revalidateOperations();
    return null;
  });
}

export async function resolveExceptionAction(input: unknown) {
  return runAction(async () => {
    const actor = await requireActorForAction("exception:resolve");
    const data = resolveExceptionSchema.parse(input);
    const db = await getDb();
    await resolveException(db, { ...data, actor });
    revalidateOperations();
    return null;
  });
}

export async function createOrderAction(input: unknown) {
  return runAction(async () => {
    const actor = await requireActorForAction("order:create");
    const db = await getDb();

    // The form sends wall-clock times; they mean the company's timezone, not the server's or browser's.
    const { timezone } = await getGeneralSettings(db);
    const raw = (input ?? {}) as Record<string, unknown>;
    const windowStart = typeof raw.windowStart === "string" ? parseLocalInTz(raw.windowStart, timezone) : null;
    const windowEnd = typeof raw.windowEnd === "string" ? parseLocalInTz(raw.windowEnd, timezone) : null;
    if (!windowStart || !windowEnd) throw invalid("Choose a start and end time for the delivery window.");

    const data = createOrderSchema.parse({ ...raw, windowStart, windowEnd });
    const order = await createOrder(db, data, actor);
    revalidateOperations();
    return { id: order.id, reference: order.reference };
  });
}

const moveStopSchema = z.object({ assignmentId: z.uuid(), direction: z.enum(["up", "down"]) });

export async function moveStopAction(input: unknown) {
  return runAction(async () => {
    const actor = await requireActorForAction("order:assign");
    const data = moveStopSchema.parse(input);
    const db = await getDb();
    const moved = await moveStop(db, { ...data, actor });
    revalidateOperations();
    return { moved };
  });
}
