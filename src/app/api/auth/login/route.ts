// app/api/auth/login/route.ts
import { NextRequest, NextResponse } from "next/server";
import { loginUser } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/config.shared";

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json();
    if (!username || !password) {
      return NextResponse.json({ error: "missing credentials" }, { status: 400 });
    }

    // lib/auth.ts returns { sessionId, userId, username }
    const { sessionId, userId } = await loginUser(username, password);

    const res = NextResponse.json({ ok: true });

    // 1) httpOnly session cookie (server reads this)
    res.cookies.set({
      name: SESSION_COOKIE,           // "session-id"
      value: sessionId,
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 7,       // 7 days
    });

    // 2) NON-httpOnly userid cookie (client reads this in /projects)
    res.cookies.set({
      name: "userid",
      value: String(userId),
      httpOnly: false,                // must be readable by client JS
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 7,
    });

    return res;
  } catch (e: any) {
    const msg = String(e?.message || "login failed");
    const isAuthErr = /invalid username or password/i.test(msg);
    return NextResponse.json({ error: msg }, { status: isAuthErr ? 401 : 500 });
  }
}
