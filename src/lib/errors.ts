export type DomainErrorCode =
  | "forbidden"
  | "not_found"
  | "conflict"
  | "invalid"
  | "unauthenticated";

/** A business-rule failure with a message that is safe to show to the user. */
export class DomainError extends Error {
  constructor(
    public readonly code: DomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export const forbidden = (msg = "You do not have permission to do that.") =>
  new DomainError("forbidden", msg);
export const notFound = (what = "Record") => new DomainError("not_found", `${what} not found.`);
export const conflict = (msg: string) => new DomainError("conflict", msg);
export const invalid = (msg: string) => new DomainError("invalid", msg);
