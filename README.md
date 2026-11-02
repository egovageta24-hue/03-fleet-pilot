# FleetPilot

Last-mile delivery operations platform: a control center for today's orders, driver assignments and delivery status. Dispatchers see what needs attention the moment they sign in, assign drivers in a click and follow every order from pickup to doorstep; drivers work their run from a phone; managers filter performance and export it.

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind v4 · shadcn/ui · Drizzle ORM · Postgres (Neon) · TanStack Table · Recharts · Zod · Vitest · Playwright

## Quick start

```bash
npm install
cp .env.example .env.local        # then set AUTH_SECRET (see below); leave DATABASE_URL empty for local dev
npm run db:seed                   # demo data (use -- --reset to wipe and reseed)
npm run dev                       # http://localhost:3000
```

With `DATABASE_URL` empty, development uses an embedded Postgres ([PGlite](https://pglite.dev)) stored in `.data/pglite`, so nothing needs installing. **Stop the dev server before running `db:seed` or `db:migrate`** in this mode — PGlite is single-process.

Generate a secret: `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"`

### Demo accounts (password `fleetpilot`)

| Role | Email | Lands on |
|---|---|---|
| Dispatcher | `priya@fleetpilot.test` (also `marcus@…`) | Dashboard |
| Operations manager | `elena@fleetpilot.test` | Dashboard (+ Reports, export) |
| Administrator | `admin@fleetpilot.test` | Dashboard (+ Settings, users) |
| Driver | `sofia@fleetpilot.test` (every driver: `<first name>@fleetpilot.test`) | My deliveries |

The login screen shows these when not in production (`DEMO_MODE`).

## Using Neon (production)

1. Create a Neon project and copy the **pooled** connection string.
2. Set `DATABASE_URL` and `AUTH_SECRET` in your host's environment.
3. `npm run db:migrate` (applies `src/db/migrations`), then optionally `npm run db:seed`.

The app uses Drizzle's `neon-serverless` (WebSocket pool) driver rather than `neon-http`, because assignment needs real interactive transactions.
In production the embedded fallback is **refused** unless you also set `ALLOW_PGLITE=true` (its storage is ephemeral on serverless hosts), so a missing `DATABASE_URL` fails loudly instead of silently losing data.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run typecheck` / `lint` | `tsc --noEmit` / ESLint |
| `npm test` | Vitest: unit + database integration tests on in-memory PGlite |
| `npm run e2e` | Playwright journeys against a running dev server (they mutate demo data; reseed afterwards) |
| `npm run db:generate` | Generate a migration from the Drizzle schema |
| `npm run db:migrate` | Apply migrations (Neon or PGlite) |
| `npm run db:seed [-- --reset]` | Demo data; refuses to touch a non-empty database without `--reset` |
| `npm run db:verify` | Data-integrity checks (12 invariants) against the configured database |

## Screens

| Route | Who | Purpose |
|---|---|---|
| `/login` | everyone | Email + password |
| `/dashboard` | dispatcher, manager, admin | KPIs, ranked **Needs attention** queue with inline Assign, driver activity, operational-area map, orders by hour, status mix |
| `/orders` | dispatcher, manager, admin | Server-side search / filter / sort / pagination (URL-driven), bulk assign, New order |
| `/orders/[id]` | staff; drivers for their own orders | Actions, delivery timeline, status history, assignments, exceptions |
| `/drivers`, `/drivers/[id]` | dispatcher, manager, admin | Profiles, availability, vehicle thumbnails, run in stop order (re-sequence), 14-day performance |
| `/board` | dispatcher, manager, admin | Kanban by status, or lanes by driver |
| `/my-deliveries` | drivers | Mobile-first stops: customer details, one-tap next step, report a problem |
| `/reports` | manager, admin | Filter by date / driver / status / area, charts, table, **CSV export** |
| `/settings` | manager (read-only), admin | Timezone, at-risk threshold, operating hours; users & roles; zones |

## How it works

- **One write path for order state.** Every status change goes through `applyTransition` (`src/server/orders/core.ts`): inside a single transaction it locks the order row, validates the move against the state machine (`src/lib/orders/state-machine.ts`), updates the order, and appends a status-history row and a timeline event. Assign / reassign / unassign / cancel / exceptions are built on it, so assignments always leave the order in a correct state.
- **History is preserved.** `order_status_history` and `delivery_events` are append-only, enforced by a database trigger (migration `0001`), not just by convention. Reassignment keeps the old assignment as `replaced`.
- **Two dispatchers, one order.** Assign carries the driver the user *saw*; if someone else changed the order in the meantime it fails with a clear message instead of silently overwriting.
- **Authorization is enforced where the data is.** `proxy.ts` only redirects signed-out visitors. Every page calls `requireActor(permission)`, every Server Action and Route Handler re-checks, and the services check again (`src/lib/permissions.ts` is the single role → permission matrix). Drivers can only read and advance orders currently assigned to them; anything else is reported as "not found".
- **Business rules in one place.** What counts as overdue / at risk (`orderTiming`) and what needs attention (`attentionReasons`) are single pure, tested definitions used by the table, board, dashboard and driver view.
- **"Live" without realtime.** Pages refresh their server data every 30 s while visible and on demand; the chip shows data age. True realtime is Phase 2.

### Definitions worth knowing

- **Today** is the calendar day in the timezone set in Settings (defaults to the machine's timezone when seeding).
- **Delivery date** (reports, date filters) is the day the delivery window *ends*.
- **At risk:** an open order whose window ends within the at-risk threshold (default 45 min); **overdue:** its window has passed. Unassigned orders count.
- **On time:** delivered at or before the window end. **Time to assign:** creation → first assignment.
- A driver's **state** (on route, picked up, assigned, available…) is derived from their orders and availability, never stored, so it cannot drift.

## Decisions & deviations

- **Cache Components is turned off** (`next.config.ts`). The scaffold enabled it, but FleetPilot is entirely authenticated, per-request data, so a static shell gives nothing and would force `<Suspense>` around every read. Easy to revisit.
- **Own session auth** (signed httpOnly JWT cookie via `jose`, bcrypt hashes) rather than an auth library. Role and active status are re-read from the database on every request, so deactivating a user takes effect immediately. Login has a small in-memory brute-force brake (per server instance).
- **Avatars and vehicle thumbnails are local**: generated initials avatars and SVG illustrations in `public/vehicles/`. No external image service. A real photo URL can replace an avatar later.
- **The "map" is a stylised SVG** of the zones with open orders and driver pins at their next stop (labelled approximate). No map API is used.
- **Drivers list** is a table on wide screens and cards on small ones; filtering there is in-memory (fine for fleets of hundreds). Orders and Reports filter/sort/paginate in SQL.

## Testing

`npm test` runs ~90 tests, including database tests against a real (in-memory) Postgres: assignment and reassignment, concurrent assignment, the full driver lifecycle, permissions, append-only history triggers, exception handling, availability rules, user-management safeguards, dashboard KPIs, report/CSV consistency, timezone and DST handling, and CSV injection. `npm run db:verify` checks the same data invariants on any database.
`npm run e2e` drives the three journeys from the brief in a real browser: dispatcher assigns, driver works a delivery, manager filters and exports.

## Known limitations / not in Phase 1

- **Neon itself was not exercised** during development (no connection string was available); the same Drizzle code runs on PGlite in tests. The concurrency test proves the optimistic-concurrency logic; PGlite serialises transactions, so true row-lock contention on Neon is untested here.
- Board drag-and-drop assignment was not built; assignment uses the Assign dialog everywhere (also from the board).
- Phase 2: realtime updates, simulated GPS / route visualisation, driver PWA and automated exception alerts. The schema and event model leave room for them.
- Vehicles are shown and enforced at assignment time (a driver whose vehicle is in maintenance cannot be assigned) but there is no vehicle-editing UI.
- The login throttle and the 30 s polling are per-process / per-tab; a multi-instance deployment would want a shared rate limiter.
- `npm audit` reports advisories only in dev tooling (ESLint's glob chain, drizzle-kit's bundled esbuild); production dependencies are clean. The suggested "fixes" are major downgrades, so they were not applied.
