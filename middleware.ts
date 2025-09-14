// middleware.ts  (place in project root, next to package.json)
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// 1. Set the cookie name you use for auth
const AUTH_COOKIE = 'gitlab-token';

// 2. Protected routes (anything under /dashboard/*)
const protectedPaths = ['/dashboard'];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Only run on protected routes
  const isProtected = protectedPaths.some((p) => pathname.startsWith(p));
  if (!isProtected) return NextResponse.next();

  // Check cookie
  const token = req.cookies.get(AUTH_COOKIE)?.value;
  if (!token) {
    // Redirect to login while preserving the intended URL
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirect', pathname);
    return NextResponse.redirect(url);
  }

  // Token exists – let the request continue
  return NextResponse.next();
}

export const config = {
  // Run middleware on dashboard routes only
  matcher: ['/dashboard/:path*'],
};