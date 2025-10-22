// src/middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/config.shared";

export function middleware(req: NextRequest) {
  const url = req.nextUrl;
  const { pathname } = url;

  // Read session cookie once
  const sid = req.cookies.get(SESSION_COOKIE)?.value || null;

  // --- Public routes (always allowed) ---
  const isPublic =
    pathname === "/login" ||
    pathname === "/register" ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt";

  // If user is authenticated and visits /login, send them to ?next or home
  if (pathname === "/login") {
    if (sid) {
      const next = url.searchParams.get("next") || "/";
      const dest = new URL(next, url);
      dest.search = ""; // avoid keeping ?next to prevent loops
      return NextResponse.redirect(dest);
    }
    return NextResponse.next();
  }

  if (isPublic) {
    return NextResponse.next();
  }

  // --- Wizard internal fetch whitelist (leave as you had it) ---
  const isProjectsApi = pathname.startsWith("/api/projects");
  const isWizardInternalFetch =
    req.headers.get("x-compare-wizard") === "1" ||
    req.headers.get("x-internal-fetch") === "1";
  if (isProjectsApi && isWizardInternalFetch) {
    return NextResponse.next();
  }
  // -------------------------------------------------------------

  // Require a session cookie for all other routes
  if (!sid) {
    const loginUrl = new URL("/login", req.url);
    // optional: preserve deep path
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // ✅ Trust the cookie here; don't call /api/auth/me from middleware.
  return NextResponse.next();
}

// Keep your matcher; optionally tighten static skips.
export const config = {
  matcher: ["/((?!_next|favicon.ico|robots.txt|api/projects/validate).*)"],
};
