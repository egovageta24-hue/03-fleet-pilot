import path from "node:path";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { getEnv } from "@/env";
import * as schema from "./schema";

/** Common database type: services only depend on this, so Neon and PGlite are interchangeable. */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export { schema };

type Cached = { promise?: Promise<Db> };
const globalForDb = globalThis as unknown as { __fleetpilotDb?: Cached };
const cache: Cached = (globalForDb.__fleetpilotDb ??= {});

async function connect(): Promise<Db> {
  const env = getEnv();

  if (env.DATABASE_URL) {
    // Pool (WebSocket) driver rather than neon-http: assignment must run in a real
    // interactive transaction, which neon-http does not support.
    const [{ Pool, neonConfig }, { drizzle }, { default: ws }] = await Promise.all([
      import("@neondatabase/serverless"),
      import("drizzle-orm/neon-serverless"),
      import("ws"),
    ]);
    neonConfig.webSocketConstructor = ws;
    const pool = new Pool({ connectionString: env.DATABASE_URL });
    return drizzle(pool, { schema }) as unknown as Db;
  }

  if (process.env.NODE_ENV === "production" && !env.ALLOW_PGLITE) {
    throw new Error(
      "DATABASE_URL is not set. The embedded PGlite fallback is disabled in production " +
        "(its storage is ephemeral on serverless hosts). Set DATABASE_URL to a Neon connection " +
        "string, or set ALLOW_PGLITE=true for a throwaway demo.",
    );
  }

  const { createPgliteDb } = await import("./pglite");
  // Dev-only path (the production guard above throws unless ALLOW_PGLITE is set); keep the bundler
  // from tracing the whole project for this dynamic filesystem access.
  const dataDir = path.resolve(/* turbopackIgnore: true */ process.cwd(), env.PGLITE_DIR ?? ".data/pglite");
  const { db } = await createPgliteDb(dataDir);
  return db as unknown as Db;
}

/** Process-wide singleton (survives Next.js dev HMR via globalThis). */
export function getDb(): Promise<Db> {
  if (!cache.promise) {
    cache.promise = connect().catch((err) => {
      cache.promise = undefined; // allow retry after a failed connect
      throw err;
    });
  }
  return cache.promise;
}
