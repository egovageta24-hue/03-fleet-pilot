import { defineConfig } from "drizzle-kit";

// `drizzle-kit generate` only needs the schema. Applying migrations goes through
// `npm run db:migrate` (src/db/migrate.ts) so Neon and PGlite share one code path.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./src/db/migrations",
  dbCredentials: { url: process.env.DATABASE_URL ?? "postgres://localhost/fleetpilot" },
});
