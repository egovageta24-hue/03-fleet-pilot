"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChartColumn,
  LayoutDashboard,
  MenuIcon,
  Package,
  Settings,
  SquareKanban,
  Truck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { UserRole } from "@/lib/domain";
import { canAccessSection, type Section } from "@/lib/permissions";
import { cn } from "@/lib/utils";

const NAV: { href: Section; label: string; icon: LucideIcon }[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/orders", label: "Orders", icon: Package },
  { href: "/board", label: "Delivery board", icon: SquareKanban },
  { href: "/drivers", label: "Drivers", icon: Users },
  { href: "/reports", label: "Reports", icon: ChartColumn },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/my-deliveries", label: "My deliveries", icon: Truck },
];

function NavList({ role, onNavigate }: { role: UserRole; onNavigate?: () => void }) {
  const pathname = usePathname();
  const items = NAV.filter((item) => canAccessSection(role, item.href));

  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {items.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-ring",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
            )}
          >
            <Icon className={cn("size-4 shrink-0", active ? "text-indigo-400" : "text-slate-500")} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Desktop sidebar content. */
export function SidebarNav({ role }: { role: UserRole }) {
  return (
    <div className="flex h-full flex-col gap-6 px-3 py-4">
      <Link href="/" className="px-2 text-white focus-visible:outline-2 focus-visible:outline-sidebar-ring">
        <Logo />
      </Link>
      <NavList role={role} />
    </div>
  );
}

/** Hamburger + slide-over nav for screens below `lg`. */
export function MobileNav({ role }: { role: UserRole }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="xl:hidden" aria-label="Open navigation">
          <MenuIcon />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 gap-0 border-sidebar-border bg-sidebar p-0 text-sidebar-foreground">
        <SheetHeader className="sr-only">
          <SheetTitle>Navigation</SheetTitle>
          <SheetDescription>Move between FleetPilot sections</SheetDescription>
        </SheetHeader>
        <div className="flex h-full flex-col gap-6 px-3 py-4">
          <div className="px-2 text-white">
            <Logo />
          </div>
          <NavList role={role} onNavigate={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
