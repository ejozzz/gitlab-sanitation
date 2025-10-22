// app/api/auth/login/route.ts
import { NextRequest, NextResponse } from "next/server";
import { loginUser } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/config.shared";

export async function POST(req: NextRequest) {
  try {
    const { username, password, remember } = await req.json();
    if (!username || !password) {
      return NextResponse.json({ error: "missing credentials" }, { status: 400 });
    }

    // Detect protocol (Cloudflare sets x-forwarded-proto=https)
    const proto =
      (req.headers.get("x-forwarded-proto") ??
        new URL(req.url).protocol.replace(":", "")).toLowerCase();
    const isHttps = proto === "https";

    const { sessionId, userId } = await loginUser(username, password);

    const res = NextResponse.json({ ok: true });

    // Choose flags per environment
    const common = {
      path: "/",
      maxAge: remember ? 60 * 60 * 24 * 30 : 60 * 60 * 8,
    } as const;

    res.cookies.set({
      name: SESSION_COOKIE, // "session-id"
      value: sessionId,
      httpOnly: true,
      secure: isHttps,
      sameSite: isHttps ? "none" : "lax",
      ...common,
    });

    res.cookies.set({
      name: "userid",
      value: String(userId),
      httpOnly: false,
      secure: isHttps,
      sameSite: isHttps ? "none" : "lax",
      ...common,
    });

    return res;
  } catch (e: any) {
    const msg = String(e?.message || "login failed");
    const isAuthErr = /invalid username or password/i.test(msg);
    return NextResponse.json({ error: msg }, { status: isAuthErr ? 401 : 500 });
  }
}
