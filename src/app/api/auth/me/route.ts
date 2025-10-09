// app/api/auth/me/route.ts
import { NextRequest, NextResponse } from "next/server";
import { validateSession, getUserById } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/config.shared";
import { cookies } from "next/headers";
import { readSessionId } from "@/lib/cookie";

export async function GET(_req: NextRequest) {
  const sid = await readSessionId(); // ✅ no TS error
if (!sid) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const session = await validateSession(sid);
  if (!session) return NextResponse.json({ error: "Invalid session" }, { status: 401 });

  const user = await getUserById(session.userId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  return NextResponse.json({
    userId: user.id,
    username: user.username,
    createdAt: user.created_at,
  });
}
