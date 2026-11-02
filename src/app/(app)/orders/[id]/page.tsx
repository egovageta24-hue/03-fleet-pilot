import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeftIcon,
  BoxesIcon,
  CheckCircle2Icon,
  ClockIcon,
  MailIcon,
  MapPinIcon,
  PhoneIcon,
  StickyNoteIcon,
  WarehouseIcon,
  WeightIcon,
} from "lucide-react";
import { OrderActions } from "@/components/orders/order-actions";
import { OrderTimeline } from "@/components/orders/order-timeline";
import { ResolveException } from "@/components/orders/resolve-exception";
import { PageHeader } from "@/components/layout/page-header";
import { AutoRefresh } from "@/components/shared/auto-refresh";
import { AvailabilityBadge, PriorityBadge, SeverityBadge, StatusBadge } from "@/components/shared/badges";
import { DriverAvatar } from "@/components/shared/driver-avatar";
import { VehicleThumb } from "@/components/shared/vehicle-thumb";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getDb } from "@/db";
import { formatDateTime, formatDuration } from "@/lib/dates";
import { isTerminal } from "@/lib/orders/state-machine";
import { TIMING_TEXT_CLASS, formatWindow, orderTiming } from "@/lib/orders/timing";
import { can } from "@/lib/permissions";
import { EXCEPTION_TYPE_LABEL, ORDER_STATUS_META, VEHICLE_TYPE_LABEL } from "@/lib/status";
import { cn } from "@/lib/utils";
import { requireActor } from "@/server/auth/dal";
import { listAssignableDrivers } from "@/server/queries/drivers";
import { getOrderDetail } from "@/server/queries/orders";
import { getGeneralSettings } from "@/server/queries/settings";

export async function generateMetadata({ params }: PageProps<"/orders/[id]">): Promise<Metadata> {
  const { id } = await params;
  return { title: `Order ${id.slice(0, 8)}` };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}

export default async function OrderDetailPage({ params }: PageProps<"/orders/[id]">) {
  // Staff see any order; drivers only their own (enforced again inside getOrderDetail).
  const actor = await requireActor();
  const isDriver = actor.role === "driver";
  if (!can(actor.role, "order:view") && !can(actor.role, "order:view_own")) notFound();

  const { id } = await params;
  // Not a UUID -> not found, rather than a database error.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();

  const db = await getDb();
  const [detail, settings] = await Promise.all([getOrderDetail(db, actor, id), getGeneralSettings(db)]);
  if (!detail) notFound();

  const { order, customer, delivery, pickup, driver } = detail;
  const tz = settings.timezone;
  const now = new Date();
  const timing = orderTiming(order, now, settings.atRiskMinutes);
  const drivers = can(actor.role, "order:assign") ? await listAssignableDrivers(db) : [];
  const finished = isTerminal(order.status);
  const openExceptions = detail.exceptions.filter((e) => e.status === "open");

  return (
    <>
      <Link
        href={isDriver ? "/my-deliveries" : "/orders"}
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" /> {isDriver ? "My deliveries" : "All orders"}
      </Link>

      <PageHeader
        title={order.reference}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={order.status} />
            <PriorityBadge priority={order.priority} />
            <span>
              {order.merchantName} → {customer.name}
            </span>
          </span>
        }
        actions={<AutoRefresh renderedAt={now.toISOString()} />}
      />

      <div className="mb-5">
        <OrderActions
          order={{
            id: order.id,
            reference: order.reference,
            status: order.status,
            priority: order.priority,
            driverId: order.driverId,
            driverName: driver?.name ?? null,
            areaId: delivery.areaId,
          }}
          drivers={drivers}
          can={{
            assign: can(actor.role, "order:assign"),
            priority: can(actor.role, "order:priority"),
            cancel: can(actor.role, "order:cancel"),
            advance: can(actor.role, "order:advance_any") || (isDriver && can(actor.role, "order:advance_own")),
            raise: can(actor.role, "exception:raise"),
          }}
        />
      </div>

      {openExceptions.length > 0 && (
        <section aria-label="Open exceptions" className="mb-5 space-y-2">
          {openExceptions.map((x) => (
            <div key={x.id} className="rounded-lg border border-warning-border bg-warning-soft p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-warning-foreground">{EXCEPTION_TYPE_LABEL[x.type]}</span>
                <SeverityBadge severity={x.severity} />
                <span className="text-xs text-warning-foreground/80">
                  raised {formatDateTime(x.raisedAt, tz)}
                  {x.raisedByName ? ` by ${x.raisedByName}` : ""}
                </span>
              </div>
              {x.description && <p className="mt-1 text-sm text-warning-foreground">{x.description}</p>}
              {can(actor.role, "exception:resolve") && (
                <div className="mt-2">
                  <ResolveException exceptionId={x.id} />
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-5">
          <Card>
            <CardContent className="pt-4">
              <Tabs defaultValue="timeline">
                <TabsList className="mb-4">
                  <TabsTrigger value="timeline">Timeline</TabsTrigger>
                  <TabsTrigger value="history">Status history</TabsTrigger>
                  <TabsTrigger value="assignments">Assignments</TabsTrigger>
                  <TabsTrigger value="exceptions">
                    Exceptions{detail.exceptions.length > 0 ? ` (${detail.exceptions.length})` : ""}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="timeline">
                  <OrderTimeline events={detail.events} tz={tz} />
                </TabsContent>

                <TabsContent value="history">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <caption className="sr-only">Status history, oldest first</caption>
                      <thead>
                        <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                          <th scope="col" className="py-2 pr-3 font-medium">When</th>
                          <th scope="col" className="py-2 pr-3 font-medium">Change</th>
                          <th scope="col" className="py-2 pr-3 font-medium">By</th>
                          <th scope="col" className="py-2 font-medium">Note</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.history.map((h) => (
                          <tr key={h.id} className="border-b last:border-0 align-top">
                            <td className="whitespace-nowrap py-2 pr-3 tabular-nums text-muted-foreground">{formatDateTime(h.at, tz)}</td>
                            <td className="py-2 pr-3">
                              <span className="inline-flex flex-wrap items-center gap-1.5">
                                {h.from ? <StatusBadge status={h.from} /> : <span className="text-xs text-muted-foreground">—</span>}
                                <span aria-hidden className="text-muted-foreground">→</span>
                                <span className="sr-only">to</span>
                                <StatusBadge status={h.to} />
                              </span>
                            </td>
                            <td className="whitespace-nowrap py-2 pr-3">{h.byName ?? "System"}</td>
                            <td className="py-2 text-muted-foreground">{h.note ?? ""}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    The status history is a permanent audit trail: entries are never edited or deleted.
                  </p>
                </TabsContent>

                <TabsContent value="assignments">
                  {detail.assignments.length === 0 ? (
                    <p className="py-4 text-sm text-muted-foreground">This order has not been assigned yet.</p>
                  ) : (
                    <ol className="space-y-2">
                      {detail.assignments.map((a) => (
                        <li key={a.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
                          <DriverAvatar name={a.driverName} size="sm" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium">{a.driverName}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatDateTime(a.assignedAt, tz)}
                              {a.assignedByName ? ` by ${a.assignedByName}` : ""}
                              {a.endedAt ? ` · ended ${formatDateTime(a.endedAt, tz)}` : ""}
                            </p>
                            {a.reason && <p className="mt-0.5 text-xs text-muted-foreground">“{a.reason}”</p>}
                          </div>
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
                              a.status === "active"
                                ? "bg-indigo-50 text-indigo-700 ring-indigo-200"
                                : a.status === "completed"
                                  ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                                  : "bg-slate-100 text-slate-600 ring-slate-200",
                            )}
                          >
                            {a.status === "active" ? "Current" : a.status === "replaced" ? "Replaced" : a.status === "completed" ? "Completed" : "Cancelled"}
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}
                </TabsContent>

                <TabsContent value="exceptions">
                  {detail.exceptions.length === 0 ? (
                    <p className="py-4 text-sm text-muted-foreground">No exceptions have been raised on this order.</p>
                  ) : (
                    <ul className="space-y-2">
                      {detail.exceptions.map((x) => (
                        <li key={x.id} className="rounded-lg border p-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium">{EXCEPTION_TYPE_LABEL[x.type]}</span>
                            <SeverityBadge severity={x.severity} />
                            {x.status === "resolved" ? (
                              <span className="inline-flex items-center gap-1 text-xs text-success">
                                <CheckCircle2Icon className="size-3.5" /> Resolved
                              </span>
                            ) : (
                              <span className="text-xs font-medium text-warning-foreground">Open</span>
                            )}
                          </div>
                          {x.description && <p className="mt-1 text-sm">{x.description}</p>}
                          <p className="mt-1 text-xs text-muted-foreground">
                            Raised {formatDateTime(x.raisedAt, tz)}
                            {x.raisedByName ? ` by ${x.raisedByName}` : ""}
                            {x.resolvedAt ? ` · resolved ${formatDateTime(x.resolvedAt, tz)}${x.resolvedByName ? ` by ${x.resolvedByName}` : ""}` : ""}
                          </p>
                          {x.resolutionNote && <p className="mt-0.5 text-xs text-muted-foreground">“{x.resolutionNote}”</p>}
                        </li>
                      ))}
                    </ul>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>

        <aside className="min-w-0 space-y-5">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Delivery</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <dl className="grid gap-3">
                <Field label="Window">
                  <span className="flex items-center gap-1.5 tabular-nums">
                    <ClockIcon className="size-3.5 text-muted-foreground" />
                    {formatWindow(order.windowStart, order.windowEnd, tz)}
                  </span>
                  {timing.tone !== "none" && (
                    <span className={cn("ml-5 block text-xs tabular-nums", TIMING_TEXT_CLASS[timing.tone])}>{timing.label}</span>
                  )}
                </Field>
                <Field label="Deliver to">
                  <span className="flex items-start gap-1.5">
                    <MapPinIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                    <span>
                      {delivery.line1}
                      {delivery.line2 ? `, ${delivery.line2}` : ""}
                      <br />
                      {delivery.city} {delivery.postcode}
                      <span className="block text-xs text-muted-foreground">
                        {delivery.areaName} ({delivery.areaCode})
                      </span>
                    </span>
                  </span>
                </Field>
                <Field label="Customer">
                  <span className="block font-medium">{customer.name}</span>
                  {customer.phone && (
                    <a href={`tel:${customer.phone}`} className="mt-0.5 flex items-center gap-1.5 text-primary hover:underline">
                      <PhoneIcon className="size-3.5" /> {customer.phone}
                    </a>
                  )}
                  {customer.email && !isDriver && (
                    <span className="mt-0.5 flex items-center gap-1.5 text-muted-foreground">
                      <MailIcon className="size-3.5" /> {customer.email}
                    </span>
                  )}
                </Field>
                <Field label="Pickup">
                  <span className="flex items-start gap-1.5">
                    <WarehouseIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                    <span>
                      {pickup.label ?? order.merchantName}
                      <span className="block text-xs text-muted-foreground">
                        {pickup.line1}, {pickup.postcode}
                      </span>
                    </span>
                  </span>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Packages">
                    <span className="flex items-center gap-1.5">
                      <BoxesIcon className="size-3.5 text-muted-foreground" /> {order.packages}
                    </span>
                  </Field>
                  <Field label="Weight">
                    <span className="flex items-center gap-1.5">
                      <WeightIcon className="size-3.5 text-muted-foreground" /> {order.weightKg} kg
                    </span>
                  </Field>
                </div>
                {order.notes && (
                  <Field label="Notes">
                    <span className="flex items-start gap-1.5">
                      <StickyNoteIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" /> {order.notes}
                    </span>
                  </Field>
                )}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Driver</CardTitle>
            </CardHeader>
            <CardContent>
              {driver ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <DriverAvatar name={driver.name} size="lg" />
                    <div className="min-w-0">
                      {can(actor.role, "driver:view") ? (
                        <Link href={`/drivers/${driver.id}`} className="block truncate font-medium hover:text-primary hover:underline">
                          {driver.name}
                        </Link>
                      ) : (
                        <span className="block truncate font-medium">{driver.name}</span>
                      )}
                      <a href={`tel:${driver.phone}`} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
                        <PhoneIcon className="size-3.5" /> {driver.phone}
                      </a>
                      <div className="mt-1">
                        <AvailabilityBadge availability={driver.availability} />
                      </div>
                    </div>
                  </div>
                  {driver.vehicle && (
                    <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-2">
                      <VehicleThumb type={driver.vehicle.type} className="w-20 shrink-0" />
                      <div className="min-w-0 text-sm">
                        <p className="font-medium">{VEHICLE_TYPE_LABEL[driver.vehicle.type]}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {driver.vehicle.make} {driver.vehicle.model}
                        </p>
                        <p className="font-mono text-xs">{driver.vehicle.plate}</p>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {finished ? "No driver was assigned." : `Not assigned yet. ${order.status === "unassigned" ? "Use “Assign driver” above." : ""}`}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Key times</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-2 text-sm">
                {(
                  [
                    ["Created", order.createdAt],
                    ["First assigned", order.firstAssignedAt],
                    ["Picked up", order.pickedUpAt],
                    ["Delivered", order.deliveredAt],
                  ] as const
                ).map(([label, at]) => (
                  <div key={label} className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="tabular-nums">{at ? formatDateTime(at, tz) : "—"}</dd>
                  </div>
                ))}
                {order.firstAssignedAt && (
                  <div className="flex justify-between gap-3 border-t pt-2">
                    <dt className="text-muted-foreground">Time to assign</dt>
                    <dd className="tabular-nums">{formatDuration((order.firstAssignedAt.getTime() - order.createdAt.getTime()) / 60_000)}</dd>
                  </div>
                )}
                {order.deliveredAt && order.pickedUpAt && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Pickup → delivered</dt>
                    <dd className="tabular-nums">{formatDuration((order.deliveredAt.getTime() - order.pickedUpAt.getTime()) / 60_000)}</dd>
                  </div>
                )}
                <div className="flex justify-between gap-3 text-xs text-muted-foreground">
                  <dt>Status</dt>
                  <dd>{ORDER_STATUS_META[order.status].label}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </aside>
      </div>
    </>
  );
}
