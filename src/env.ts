import { z } from "zod";

const emptyToUndefined = (v: unknown) => (v === "" ? undefined : v);

const schema = z.object({
  /** Neon (or any Postgres) connection string. When unset, dev falls back to embedded PGlite. */
  DATABASE_URL: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  /** Directory for the PGlite fallback database. */
  PGLITE_DIR: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  /** Allow the PGlite fallback in production (ephemeral on serverless; demos only). */
  ALLOW_PGLITE: z.preprocess((v) => v === "true" || v === "1", z.boolean()),
  /** HMAC secret for session JWTs. */
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  /** Show demo accounts on the login screen. Defaults to on outside production. */
  DEMO_MODE: z.preprocess(emptyToUndefined, z.enum(["true", "false"]).optional()),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Parsed lazily so `next build` does not need runtime secrets. */
export function getEnv(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration — ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export function isDemoMode(): boolean {
  const flag = process.env.DEMO_MODE;
  if (flag === "true") return true;
  if (flag === "false") return false;
  return process.env.NODE_ENV !== "production";
}
