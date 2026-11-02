import "server-only";

// Minimal brute-force brake: after MAX_FAILURES wrong passwords for an email, further
// attempts are refused for LOCKOUT_MS. In-memory, so it is per server instance — it slows
// down guessing but is not a substitute for a shared rate limiter in a multi-instance deploy.
const MAX_FAILURES = 5;
const LOCKOUT_MS = 60_000;

type Entry = { failures: number; lockedUntil: number };
const globalForThrottle = globalThis as unknown as { __fpLoginThrottle?: Map<string, Entry> };
const attempts = (globalForThrottle.__fpLoginThrottle ??= new Map<string, Entry>());

export function secondsLocked(email: string, now = Date.now()): number {
  const e = attempts.get(email);
  if (!e || e.lockedUntil <= now) return 0;
  return Math.ceil((e.lockedUntil - now) / 1000);
}

export function recordFailure(email: string, now = Date.now()) {
  const e = attempts.get(email) ?? { failures: 0, lockedUntil: 0 };
  // A lock that already expired starts a fresh count.
  if (e.lockedUntil && e.lockedUntil <= now) {
    e.failures = 0;
    e.lockedUntil = 0;
  }
  e.failures += 1;
  if (e.failures >= MAX_FAILURES) e.lockedUntil = now + LOCKOUT_MS;
  attempts.set(email, e);
}

export function recordSuccess(email: string) {
  attempts.delete(email);
}
