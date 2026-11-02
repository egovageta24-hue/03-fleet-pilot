import { createPgliteDb } from "@/db/pglite";
import type { Db } from "@/db";

/** Fresh in-memory Postgres (PGlite) with all migrations applied. */
export async function createTestDb() {
  const { db, client } = await createPgliteDb();
  return { db: db as unknown as Db, close: () => client.close() };
}
