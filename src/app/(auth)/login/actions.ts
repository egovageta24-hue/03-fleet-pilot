"use server";

import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb, schema } from "@/db";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  safeNextPath,
  signSessionToken,
} from "@/lib/auth/token";
import { homePathFor } from "@/lib/permissions";
import { recordFailure, recordSuccess, secondsLocked } from "@/server/auth/login-throttle";

export type LoginState = { error?: string; email?: string };

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().min(1, "Enter your email").max(254),
  password: z.string().min(1, "Enter your password").max(200),
});

// Compared against when the email is unknown, so response time does not reveal which emails exist.
// Generated (not a literal) so it is always a valid hash at the same cost as real ones.
const DUMMY_HASH = bcrypt.hashSync("fleetpilot-timing-equaliser", 10);

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message, email: String(formData.get("email") ?? "") };
  }
  const { email, password } = parsed.data;

  const locked = secondsLocked(email);
  if (locked > 0) {
    return { error: `Too many failed attempts. Try again in ${locked}s.`, email };
  }

  const db = await getDb();
  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(sql`lower(${schema.users.email})`, email));

  const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !valid || !user.active) {
    recordFailure(email);
    return { error: "Incorrect email or password.", email };
  }

  recordSuccess(email);
  const token = await signSessionToken(user.id);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  const next = safeNextPath(String(formData.get("next") ?? ""));
  redirect(next ?? homePathFor(user.role));
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
