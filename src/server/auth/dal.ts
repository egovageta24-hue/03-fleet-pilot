import "server-only";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/token";
import { DomainError } from "@/lib/errors";
import { can, homePathFor, type Actor, type Permission } from "@/lib/permissions";

/**
 * Data Access Layer: the one place that turns a session cookie into an `Actor`.
 * The user (role, active flag, driver profile) is re-read from the database on every
 * request, so deactivating someone or changing their role takes effect immediately.
 * Memoised per render pass with React `cache`.
 */
export const getActor = cache(async (): Promise<Actor | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const userId = await verifySessionToken(token);
  if (!userId) return null;

  const db = await getDb();
  const [row] = await db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      role: schema.users.role,
      active: schema.users.active,
      driverId: schema.drivers.id,
    })
    .from(schema.users)
    .leftJoin(schema.drivers, eq(schema.drivers.userId, schema.users.id))
    .where(eq(schema.users.id, userId));

  if (!row || !row.active) return null;
  return { userId: row.id, name: row.name, role: row.role, driverId: row.driverId ?? null };
});

/**
 * Use at the top of every page / layout-level fetch. Redirects to /login when signed out,
 * and to the user's own home when their role lacks `permission`.
 * (Layouts do not re-render on navigation, so each page must call this itself.)
 */
export async function requireActor(permission?: Permission): Promise<Actor> {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (permission && !can(actor.role, permission)) redirect(homePathFor(actor.role));
  return actor;
}

/** For Server Actions and Route Handlers: throws instead of redirecting. */
export async function requireActorForAction(permission?: Permission): Promise<Actor> {
  const actor = await getActor();
  if (!actor) throw new DomainError("unauthenticated", "Your session has expired. Please sign in again.");
  if (permission && !can(actor.role, permission)) {
    throw new DomainError("forbidden", "You do not have permission to do that.");
  }
  return actor;
}
