// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function isAuthed(req: NextRequest) {
  // your cookie/session check
  const session = req.cookies.get("session-id")?.value;
  return Boolean(session);
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1) Always allow static & public assets
  if (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/fonts") ||
    pathname === "/"
  ) {
    return NextResponse.next();
  }

  // 2) Allow auth pages themselves
  if (pathname === "/login" || pathname === "/register") {
    return NextResponse.next();
  }

  // 3) API handling
  if (pathname.startsWith("/api")) {
    // allow public auth endpoints
    if (
      pathname === "/api/auth/login" ||
      pathname === "/api/auth/register"
    ) {
      return NextResponse.next();
    }

    // for other API routes, return 401 JSON instead of redirecting
    if (!isAuthed(req)) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    return NextResponse.next();
  }

  // 4) App pages: redirect unauthenticated users to /login
  if (!isAuthed(req)) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

// Only run on what we need (exclude static/image routes by pattern)
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
