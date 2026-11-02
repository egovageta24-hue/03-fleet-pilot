import { mkdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { MIGRATIONS_FOLDER } from "./paths";
import * as schema from "./schema";

/**
 * Open an embedded Postgres (PGlite) and apply migrations.
 * `dataDir` undefined => in-memory (used by tests).
 */
export async function createPgliteDb(dataDir?: string) {
  // PGlite creates the data directory itself but not its parents.
  if (dataDir) mkdirSync(path.dirname(dataDir), { recursive: true });
  const client = new PGlite(dataDir);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return { db, client };
}
