/**
 * Data-integrity check:  npm run db:verify
 * Asserts the invariants the dashboards and reports rely on. Exits 1 on any violation.
 * Works against Neon (DATABASE_URL) or the embedded PGlite database.
 */
import { sql } from "drizzle-orm";
import { getDb } from "./index";
import { runIntegrityChecks } from "./integrity";

async function main() {
  const db = await getDb();
  const results = await runIntegrityChecks(db);
  let failed = 0;

  for (const r of results) {
    if (r.violations.length === 0) {
      console.log(`  ok    ${r.name}`);
    } else {
      failed++;
      console.log(`  FAIL  ${r.name} — ${r.violations.length} violation(s), e.g. ${r.violations.slice(0, 5).join(", ")}`);
    }
  }

  const counts = (await db.execute(
    sql`select (select count(*) from orders)::int as orders, (select count(*) from order_status_history)::int as history,
               (select count(*) from delivery_events)::int as events, (select count(*) from assignments)::int as assignments,
               (select count(*) from exceptions)::int as exceptions`,
  )) as unknown as { rows: Record<string, number>[] };
  console.log("\nRow counts:", counts.rows[0]);

  if (failed > 0) {
    console.error(`\n${failed} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll integrity checks passed.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
