// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/config.shared";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Public routes that should never be blocked
  const isPublic =
    pathname === "/login" ||
    pathname === "/register" ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt";

  if (isPublic) return NextResponse.next();

  // 1) Cookie present?
  const sid = req.cookies.get(SESSION_COOKIE)?.value;
  if (!sid) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // 2) Validate cookie (defend against stale/invalid sessions)
  try {
    const origin = req.nextUrl.origin; // http://localhost:3000 in dev
    const meRes = await fetch(`${origin}/api/auth/me`, {
      // Pass through the cookie so /api/auth/me can read it
      headers: { cookie: `${SESSION_COOKIE}=${sid}` },
      // Keep it snappy; don't block excessively
      cache: "no-store",
    });

    if (!meRes.ok) {
      const url = new URL("/login", req.url);
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
  } catch {
    // If validation failed for any reason, fail closed
    const url = new URL("/login", req.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

// Exclude only the one validation endpoint you already had
export const config = { matcher: ["/((?!api/projects/validate).*)"] };
