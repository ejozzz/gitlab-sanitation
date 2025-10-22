// src/app/api/projects/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { Projects } from "@/lib/db";
import { encryptToken } from "@/lib/config.server";

export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let query;
  try {
    query = { _id: new ObjectId(id) };
  } catch {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const col = await Projects();
  const doc = await col.findOne(query);
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const item = {
    id: String(doc._id),
    name: doc.name,
    gitlabHost:
      typeof doc.gitlab_url === "string" && doc.gitlab_url.includes("/api/v4/projects/")
        ? doc.gitlab_url.split("/api/v4/projects/")[0]
        : "",
    projectId: String(doc.projectId ?? ""),
    createdAt: doc.created_at,
    updatedAt: doc.updated_at,
    isActive: !!doc.isActive,
  };

  return NextResponse.json(item);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let oid: ObjectId;
  try {
    oid = new ObjectId(id);
  } catch {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const name = String(body?.name ?? "").trim();
  const gitlabHost = String(body?.gitlabHost ?? "").trim().replace(/\/+$/, "");
  const projectId = String(body?.projectId ?? "").trim();
  const gitlabToken = String(body?.gitlabToken ?? "").trim();
  const isActive = Boolean(body?.isActive);

  if (!name || !gitlabHost || !projectId) {
    return NextResponse.json(
      { error: "name, gitlabHost, projectId are required" },
      { status: 400 }
    );
  }

  const col = await Projects();
  const now = new Date();

  const update: any = {
    name,
    gitlab_url: `${gitlabHost}/api/v4/projects/${projectId}`,
    projectId,
    updated_at: now,
  };

  if (gitlabToken) {
    const token = await encryptToken(gitlabToken);
    update.token = token;
  }

  if (isActive) {
    await col.updateMany({ isActive: true }, { $set: { isActive: false, updated_at: now } });
    update.isActive = true;
  } else if (typeof body?.isActive === "boolean") {
    update.isActive = false;
  }

  const res = await col.updateOne({ _id: oid }, { $set: update });
  if (res.matchedCount === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ ok: true });
}
