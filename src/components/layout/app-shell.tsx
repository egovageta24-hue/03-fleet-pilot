import type { ReactNode } from "react";
import { SearchIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { can, type Actor } from "@/lib/permissions";
import { MobileNav, SidebarNav } from "./app-nav";
import { UserMenu } from "./user-menu";

export function AppShell({ actor, children }: { actor: Actor; children: ReactNode }) {
  const canSearch = can(actor.role, "order:view");

  return (
    <div className="min-h-screen xl:grid xl:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-screen bg-sidebar text-sidebar-foreground xl:block">
        <SidebarNav role={actor.role} />
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-card/90 px-3 backdrop-blur sm:px-4 lg:px-6">
          <MobileNav role={actor.role} />
          {canSearch ? (
            <form action="/orders" role="search" className="relative w-full max-w-md">
              <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                name="q"
                type="search"
                aria-label="Search orders, customers or drivers"
                placeholder="Search orders, customers, drivers…"
                className="h-9 pl-8"
              />
            </form>
          ) : (
            <div className="flex-1" />
          )}
          <div className="ml-auto">
            <UserMenu name={actor.name} role={actor.role} />
          </div>
        </header>

        <main className="min-w-0 flex-1 p-3 sm:p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
