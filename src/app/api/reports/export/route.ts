import { getDb } from "@/db";
import { toCsv } from "@/lib/csv";
import { can } from "@/lib/permissions";
import { reportCsvColumns } from "@/lib/reports";
import { parseOrderFilters, type SearchParams } from "@/lib/validation/filters";
import { getActor } from "@/server/auth/dal";
import { EXPORT_ROW_LIMIT, queryReportRows, withReportDefaults } from "@/server/queries/reports";
import { getGeneralSettings } from "@/server/queries/settings";

// Authenticated per request (cookies), so never cached or prerendered.
export const dynamic = "force-dynamic";

/**
 * CSV export of the Reports table. Takes the same query string as /reports (same Zod parsing,
 * same defaults, same query function), so the file always matches what is on screen.
 * Authorisation is enforced here: proxy.ts deliberately does not cover /api.
 */
export async function GET(request: Request) {
  const actor = await getActor();
  if (!actor) return Response.json({ error: "Not signed in." }, { status: 401 });
  if (!can(actor.role, "report:export")) return Response.json({ error: "You do not have permission to export reports." }, { status: 403 });

  const url = new URL(request.url);
  const params: SearchParams = {};
  for (const key of url.searchParams.keys()) params[key] = url.searchParams.getAll(key);

  const db = await getDb();
  const settings = await getGeneralSettings(db);
  const now = new Date();
  const ctx = { tz: settings.timezone, now, atRiskMinutes: settings.atRiskMinutes };
  const filters = withReportDefaults(parseOrderFilters(params), ctx.tz, now);

  // One extra row tells us whether the export was truncated.
  const rows = await queryReportRows(db, actor, filters, ctx, { limit: EXPORT_ROW_LIMIT + 1, offset: 0 });
  const truncated = rows.length > EXPORT_ROW_LIMIT;
  const body = toCsv(reportCsvColumns(ctx.tz), truncated ? rows.slice(0, EXPORT_ROW_LIMIT) : rows);

  const range = `${filters.from ?? "start"}_to_${filters.to ?? "today"}`;
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="fleetpilot-report-${range}.csv"`,
      "Cache-Control": "no-store",
      "X-Export-Truncated": truncated ? "true" : "false",
    },
  });
}
