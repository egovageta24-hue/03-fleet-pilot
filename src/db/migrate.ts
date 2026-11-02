import { getEnv } from "@/env";
import { getDb } from "./index";
import { MIGRATIONS_FOLDER } from "./paths";

async function main() {
  const env = getEnv();
  const db = await getDb();

  if (env.DATABASE_URL) {
    const { migrate } = await import("drizzle-orm/neon-serverless/migrator");
    await migrate(db as never, { migrationsFolder: MIGRATIONS_FOLDER });
    console.log("Migrations applied to Postgres (DATABASE_URL).");
  } else {
    // PGlite applies pending migrations when the connection is first opened.
    console.log("Migrations applied to embedded PGlite (.data/pglite).");
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
