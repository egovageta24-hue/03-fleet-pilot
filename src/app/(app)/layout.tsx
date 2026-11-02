import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { requireActor } from "@/server/auth/dal";

export default async function AppLayout({ children }: { children: ReactNode }) {
  // Layouts do not re-run on client navigation, so every page also calls requireActor(...)
  // with the permission it needs. This call supplies the shell (nav + user menu).
  const actor = await requireActor();
  return <AppShell actor={actor}>{children}</AppShell>;
}
