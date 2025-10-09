// app/api/projects/active/route.ts
import { NextRequest, NextResponse } from "next/server";
import { Projects } from "@/lib/db";
import { validateSession } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/config.shared";
import { cookies } from "next/headers";
import { ObjectId } from "mongodb";

function toObjectId(v: any): ObjectId {
  return v instanceof ObjectId ? v : new ObjectId(String(v));
}

async function requireUserId(): Promise<ObjectId | null> {
  const cookieStore = await cookies();
  const sid = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sid) return null;
  const s = await validateSession(sid);
  if (!s) return null;
  // your validateSession returns { userId: string, ... }
  return toObjectId(s.userId);
}

export async function GET() {
  try {
    const uid = await requireUserId();
    if (!uid) return NextResponse.json(null);

    const col = await Projects();
    const active = await col
      .find(
        { userid: uid, isActive: true },
        { projection: { name: 1, gitlab_url: 1, projectId: 1, token:1, created_at: 1, updated_at: 1, isActive: 1 } }
      )
      .sort({ updated_at: -1 })
      .limit(1)
      .next();

      

    if (!active) return NextResponse.json(null);

    return NextResponse.json({
      id: String(active._id),
      name: active.name,
      gitlabHost:
        typeof active.gitlab_url === "string" && active.gitlab_url.includes("/api/v4/projects/")
          ? active.gitlab_url.split("/api/v4/projects/")[0]
          : (active.gitlab_url ?? ""),
      projectId: active.projectId,
      createdAt: active.created_at,
      token: active.token,
      updatedAt: active.updated_at,
      isActive: !!active.isActive,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "failed to fetch active project" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const uid = await requireUserId();
    if (!uid) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    // Accept multiple payload shapes: {activeProjectId} | {id} | {projectId}
    const candidate = body?.activeProjectId ?? body?.id ?? body?.projectId;
    if (!candidate) {
      return NextResponse.json({ error: "id / activeProjectId / projectId required" }, { status: 400 });
    }

    const col = await Projects();
    const now = new Date();

    // Determine whether the identifier is a Mongo _id (24-hex) or a GitLab projectId
    const isMongoId = typeof candidate === "string" && /^[a-f0-9]{24}$/i.test(candidate);
    let target;

    if (isMongoId) {
      const _id = new ObjectId(String(candidate));
      target = await col.findOne({ _id, userid: uid });
      if (!target) return NextResponse.json({ error: "Project not found" }, { status: 404 });

      // Deactivate current user’s active projects, then activate this one
      await col.updateMany({ userid: uid, isActive: true }, { $set: { isActive: false, updated_at: now } });
      await col.updateOne({ _id }, { $set: { isActive: true, updated_at: now } });
    } else {
      const projectId = String(candidate);
      target = await col.findOne({ projectId, userid: uid });
      if (!target) return NextResponse.json({ error: "Project not found" }, { status: 404 });

      await col.updateMany({ userid: uid, isActive: true }, { $set: { isActive: false, updated_at: now } });
      await col.updateOne({ projectId, userid: uid }, { $set: { isActive: true, updated_at: now } });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "failed to set active project" }, { status: 500 });
  }
}
