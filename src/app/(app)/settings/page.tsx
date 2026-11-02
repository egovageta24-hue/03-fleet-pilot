import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { GeneralSettingsForm } from "@/components/settings/general-settings-form";
import { UsersPanel } from "@/components/settings/users-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getDb, schema } from "@/db";
import { can } from "@/lib/permissions";
import { requireActor } from "@/server/auth/dal";
import { listUsers } from "@/server/admin/users";
import { getGeneralSettings } from "@/server/queries/settings";
import { sql } from "drizzle-orm";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const actor = await requireActor("settings:view");
  const db = await getDb();
  const canManage = can(actor.role, "settings:manage");
  const canUsers = can(actor.role, "user:manage");

  const [settings, users, areaRows] = await Promise.all([
    getGeneralSettings(db),
    canUsers ? listUsers(db, actor) : Promise.resolve([]),
    db
      .select({
        id: schema.areas.id,
        code: schema.areas.code,
        name: schema.areas.name,
        open: sql<number>`(select count(*)::int from ${schema.orders} where ${schema.orders.deliveryAreaId} = ${schema.areas.id} and ${schema.orders.status} in ('unassigned','assigned','picked_up','out_for_delivery','failed'))`,
      })
      .from(schema.areas)
      .orderBy(schema.areas.name),
  ]);

  // Passed from the server so the datalist is identical on server and client.
  const timezones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : ["UTC"];

  return (
    <>
      <PageHeader title="Settings" description="Operating rules, people and zones." />
      <Tabs defaultValue="general">
        <TabsList className="mb-5">
          <TabsTrigger value="general">General</TabsTrigger>
          {canUsers && <TabsTrigger value="users">Users &amp; roles</TabsTrigger>}
          <TabsTrigger value="areas">Zones</TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <GeneralSettingsForm initial={settings} timezones={timezones} readOnly={!canManage} />
        </TabsContent>

        {canUsers && (
          <TabsContent value="users">
            <UsersPanel users={users} currentUserId={actor.userId} />
          </TabsContent>
        )}

        <TabsContent value="areas">
          <p className="mb-3 text-sm text-muted-foreground">Delivery zones used for filtering, driver home areas and the operations map.</p>
          <div className="overflow-hidden rounded-lg border bg-card">
            <table className="w-full text-sm">
              <caption className="sr-only">Delivery zones</caption>
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-2 font-medium">Code</th>
                  <th scope="col" className="px-4 py-2 font-medium">Zone</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">Open orders</th>
                </tr>
              </thead>
              <tbody>
                {areaRows.map((a) => (
                  <tr key={a.id} className="border-t">
                    <td className="px-4 py-2 font-mono text-xs">{a.code}</td>
                    <td className="px-4 py-2">{a.name}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{a.open}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}
