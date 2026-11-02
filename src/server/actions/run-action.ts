import "server-only";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";
import { failResult, okResult, type ActionResult } from "@/lib/action-result";
import { DomainError } from "@/lib/errors";

/**
 * Wrap a Server Action body: expected failures (business rules, validation, permissions)
 * become `{ ok: false, error }`; Next.js control-flow errors (redirect/notFound) pass through;
 * anything else is logged and reported generically (no internals leaked to the client).
 */
export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return okResult(await fn());
  } catch (err) {
    unstable_rethrow(err);
    if (err instanceof DomainError) return failResult(err.message);
    if (err instanceof ZodError) return failResult(err.issues[0]?.message ?? "Invalid input.");
    console.error("Server action failed:", err);
    return failResult("Something went wrong. Please try again.");
  }
}

/** Operational data changed: refresh every screen that shows orders, drivers or metrics. */
export function revalidateOperations() {
  revalidatePath("/", "layout");
}
