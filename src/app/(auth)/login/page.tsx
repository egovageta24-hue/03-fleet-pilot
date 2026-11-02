import type { Metadata } from "next";
import { Logo } from "@/components/brand/logo";
import { isDemoMode } from "@/env";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

const DEMO_ACCOUNTS = [
  { role: "Dispatcher", email: "priya@fleetpilot.test" },
  { role: "Operations manager", email: "elena@fleetpilot.test" },
  { role: "Driver", email: "sofia@fleetpilot.test" },
  { role: "Administrator", email: "admin@fleetpilot.test" },
];

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : "";
  const demo = isDemoMode();

  return (
    <main className="grid min-h-screen lg:grid-cols-[1fr_minmax(0,28rem)]">
      <section className="relative hidden overflow-hidden bg-sidebar text-sidebar-foreground lg:flex lg:flex-col lg:justify-between lg:p-12">
        <Logo className="text-white" />
        <div className="max-w-md space-y-4">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight text-white">
            Today&rsquo;s deliveries, one control center.
          </h1>
          <p className="text-sm leading-relaxed text-slate-400">
            See what needs attention the moment you sign in, assign drivers in a click and follow every
            order from pickup to doorstep.
          </p>
        </div>
        <p className="text-xs text-slate-500">FleetPilot &middot; Last-mile delivery operations</p>
        <svg
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 size-[28rem] text-indigo-500/10"
          viewBox="0 0 100 100"
          fill="none"
          stroke="currentColor"
          strokeWidth="0.6"
        >
          {Array.from({ length: 9 }).map((_, i) => (
            <g key={i}>
              <path d={`M${i * 12.5} 0V100`} />
              <path d={`M0 ${i * 12.5}H100`} />
            </g>
          ))}
          <circle cx="50" cy="50" r="30" />
          <circle cx="50" cy="50" r="12" />
        </svg>
      </section>

      <section className="flex items-center justify-center bg-background px-6 py-12">
        <div className="w-full max-w-sm space-y-8">
          <Logo className="lg:hidden" />
          <div className="space-y-1.5">
            <h2 className="text-2xl font-semibold tracking-tight">Sign in</h2>
            <p className="text-sm text-muted-foreground">Use your FleetPilot account to continue.</p>
          </div>
          {/* Credentials are only ever sent to the browser in demo mode. */}
          <LoginForm
            next={next}
            demoAccounts={demo ? DEMO_ACCOUNTS : []}
            demoPassword={demo ? (process.env.SEED_PASSWORD ?? "fleetpilot") : ""}
          />
        </div>
      </section>
    </main>
  );
}
