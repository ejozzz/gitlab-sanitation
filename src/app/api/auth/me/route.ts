//app/api/auth/me/route.ts
import { NextRequest, NextResponse } from "next/server";
import { validateSession, getUserById } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const sessionId = request.cookies.get("session-id")?.value;

    if (!sessionId) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const session = await validateSession(sessionId);
    if (!session) {
      return NextResponse.json(
        { error: "Invalid session" },
        { status: 401 }
      );
    }

    const user = await getUserById(session.userId);
    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      userId: user.id,               // stringified _id
      username: user.username,
      createdAt: user.created_at,    // Date from Mongo
    });
  } catch (error) {
    console.error("GET /api/auth/me error:", error);
    return NextResponse.json(
      { error: "Failed to get user info" },
      { status: 500 }
    );
  }
}
