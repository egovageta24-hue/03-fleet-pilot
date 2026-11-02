/** Uniform result of every Server Action: never throws to the client for expected failures. */
export type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: string };

export const okResult = <T>(data: T): ActionResult<T> => ({ ok: true, data });
export const failResult = (error: string): ActionResult<never> => ({ ok: false, error });
