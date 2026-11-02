import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/token";

/**
 * Optimistic gate only: sends signed-out visitors to /login and signed-in ones away from it.
 * It reads the cookie and nothing else (no database). Real authorization happens in the
 * Data Access Layer (`requireActor`), every Server Action and every Route Handler.
 */
export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const userId = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);

  if (pathname === "/login") {
    return userId ? NextResponse.redirect(new URL("/", req.nextUrl)) : NextResponse.next();
  }

  if (!userId) {
    const url = new URL("/login", req.nextUrl);
    if (pathname !== "/") url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Everything except API routes (they authorise themselves), Next internals and static files.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)"],
};
