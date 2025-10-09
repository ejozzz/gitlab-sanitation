// app/api/auth/logout/route.ts
import { NextRequest, NextResponse } from "next/server";
import { deleteSession } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/config.shared";
import { cookies } from "next/headers";

async function performLogout(req: NextRequest) {
  const store = await cookies();
  const sid = store.get(SESSION_COOKIE)?.value;
  if (sid) await deleteSession(sid);

  // Build a redirect response to /login
  const loginUrl = new URL("/login", req.url);
  const res = NextResponse.redirect(loginUrl, { status: 303 });

  // Clear both cookies on the redirect response
  res.cookies.set({
    name: SESSION_COOKIE,
    value: "",
    path: "/",
    expires: new Date(0),
  });
  res.cookies.set({
    name: "userid",
    value: "",
    path: "/",
    expires: new Date(0),
  });

  return res;
}

export async function GET(req: NextRequest) {
  return performLogout(req);
}

export async function POST(req: NextRequest) {
  return performLogout(req);
}
