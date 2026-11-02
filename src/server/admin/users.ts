import "server-only";
import bcrypt from "bcryptjs";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { schema, type Db } from "@/db";
import type { UserRole } from "@/lib/domain";
import { conflict, invalid, notFound } from "@/lib/errors";
import { assertCan, type Actor } from "@/lib/permissions";

const { users, drivers, orders } = schema;

export type UserRow = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
  createdAt: Date;
  driverId: string | null;
};

export async function listUsers(db: Db, actor: Actor): Promise<UserRow[]> {
  assertCan(actor, "settings:view");
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      active: users.active,
      createdAt: users.createdAt,
      driverId: drivers.id,
    })
    .from(users)
    .leftJoin(drivers, eq(drivers.userId, users.id))
    .orderBy(asc(users.role), asc(users.name));
}

const HASH_COST = 10;

export async function createUser(
  db: Db,
  actor: Actor,
  input: { name: string; email: string; role: UserRole; password: string; phone?: string },
) {
  assertCan(actor, "user:manage");
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  if (input.role === "driver" && !input.phone?.trim()) throw invalid("A phone number is required for drivers.");

  const passwordHash = await bcrypt.hash(input.password, HASH_COST);

  return db.transaction(async (tx) => {
    const [existing] = await tx.select({ id: users.id }).from(users).where(eq(sql`lower(${users.email})`, email));
    if (existing) throw conflict("A user with that email already exists.");

    const [user] = await tx.insert(users).values({ email, name, role: input.role, passwordHash }).returning();
    if (input.role === "driver") {
      // New drivers start off duty until a dispatcher or the driver marks them available.
      await tx.insert(drivers).values({ userId: user.id, phone: input.phone!.trim(), availability: "off_duty" });
    }
    return user;
  });
}

/** Change a user's role (staff roles only) and/or active flag. */
export async function updateUser(
  db: Db,
  actor: Actor,
  input: { userId: string; role?: UserRole; active?: boolean },
) {
  assertCan(actor, "user:manage");

  return db.transaction(async (tx) => {
    const [user] = await tx.select().from(users).where(eq(users.id, input.userId)).for("update");
    if (!user) throw notFound("User");

    const roleChanging = input.role !== undefined && input.role !== user.role;
    const activeChanging = input.active !== undefined && input.active !== user.active;
    if (!roleChanging && !activeChanging) return user;

    if (user.id === actor.userId) {
      throw conflict("You cannot change your own role or deactivate your own account.");
    }
    if (roleChanging && (user.role === "driver" || input.role === "driver")) {
      throw conflict("Driver accounts keep the driver role (they have a driver profile). Create a new account for a different role.");
    }

    const losesAdmin = user.role === "admin" && user.active && ((roleChanging && input.role !== "admin") || input.active === false);
    if (losesAdmin) {
      const [{ n }] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(users)
        .where(and(eq(users.role, "admin"), eq(users.active, true)));
      if (n <= 1) throw conflict("There must be at least one active administrator.");
    }

    if (input.active === false && user.role === "driver") {
      const [{ n }] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(orders)
        .innerJoin(drivers, eq(drivers.id, orders.driverId))
        .where(and(eq(drivers.userId, user.id), inArray(orders.status, ["assigned", "picked_up", "out_for_delivery", "failed"])));
      if (n > 0) throw conflict(`This driver still holds ${n} order${n === 1 ? "" : "s"}. Reassign ${n === 1 ? "it" : "them"} before deactivating.`);
    }

    const [updated] = await tx
      .update(users)
      .set({ ...(roleChanging ? { role: input.role } : {}), ...(activeChanging ? { active: input.active } : {}) })
      .where(eq(users.id, user.id))
      .returning();
    return updated;
  });
}

export async function resetPassword(db: Db, actor: Actor, input: { userId: string; password: string }) {
  assertCan(actor, "user:manage");
  const passwordHash = await bcrypt.hash(input.password, HASH_COST);
  const [updated] = await db.update(users).set({ passwordHash }).where(eq(users.id, input.userId)).returning({ id: users.id });
  if (!updated) throw notFound("User");
}
