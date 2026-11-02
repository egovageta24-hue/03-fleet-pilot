"use client";

import { ChevronDownIcon, LogOutIcon } from "lucide-react";
import { logout } from "@/app/(auth)/login/actions";
import { DriverAvatar } from "@/components/shared/driver-avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { UserRole } from "@/lib/domain";

const ROLE_LABEL: Record<UserRole, string> = {
  admin: "Administrator",
  dispatcher: "Dispatcher",
  manager: "Operations manager",
  driver: "Driver",
};

export function UserMenu({ name, role }: { name: string; role: UserRole }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">
        <DriverAvatar name={name} size="sm" />
        <span className="hidden min-w-0 sm:block">
          <span className="block truncate text-sm font-medium leading-tight">{name}</span>
          <span className="block truncate text-xs leading-tight text-muted-foreground">{ROLE_LABEL[role]}</span>
        </span>
        <ChevronDownIcon className="hidden size-4 text-muted-foreground sm:block" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <span className="block text-sm font-medium">{name}</span>
          <span className="block text-xs text-muted-foreground">{ROLE_LABEL[role]}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <form action={logout}>
          <DropdownMenuItem asChild>
            <button type="submit" className="w-full cursor-pointer">
              <LogOutIcon /> Sign out
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
