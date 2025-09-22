// src/app/api/projects/route.ts
import { NextRequest, NextResponse } from "next/server";
import { Projects, Config } from "@/lib/db";
import { encryptToken } from "@/lib/config.server";

export async function GET() {
  const col = await Projects();
  const rows = await col
    .find({}, { projection: { name: 1, gitlab_url: 1, projectId: 1, created_at: 1, updated_at: 1, isActive: 1 } })
    .sort({ created_at: -1 })
    .toArray();

  const items = rows.map((r: any) => ({
    id: String(r._id),
    name: r.name,
    gitlabHost: (typeof r.gitlab_url === "string" && r.gitlab_url.includes("/api/v4/projects/"))
      ? r.gitlab_url.split("/api/v4/projects/")[0]
      : (r.gitlabHost ?? ""),
    projectId: r.projectId,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    isActive: !!r.isActive,
  }));

  return NextResponse.json(items);
}

/**
 * Accepts camelCase payload from Settings:
 * { name, gitlabHost, projectId, gitlabToken?, isActive? }
 * - CREATE (no existing doc): gitlabToken REQUIRED → encrypt and insert
 * - UPDATE (doc exists): gitlabToken OPTIONAL → rotate if provided
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const name: string = body?.name;
    const gitlabHost: string = (body?.gitlabHost || "").trim().replace(/\/+$/, "");
    const projectId: string = String(body?.projectId ?? "").trim();
    const gitlabToken: string | undefined = body?.gitlabToken ? String(body.gitlabToken) : undefined;
    const isActive: boolean = !!body?.isActive;

    if (!name || !gitlabHost || !projectId) {
      return NextResponse.json(
        { error: "name, gitlabHost, projectId are required", receivedKeys: Object.keys(body || {}) },
        { status: 400 }
      );
    }

    const projectsCol = await Projects();
    const configCol = await Config();
    const now = new Date();
    const gitlab_url = `${gitlabHost}/api/v4/projects/${projectId}`;

    const existing = await projectsCol.findOne({ projectId });

    if (existing) {
      // UPDATE
      const update: any = {
        name,
        gitlab_url,
        isActive,
        updated_at: now,
      };
      if (gitlabToken && gitlabToken.trim().length > 0) {
        const { ciphertext, nonce, tag } = encryptToken(gitlabToken);
        update.token = { ciphertext, nonce, tag };
      }
      await projectsCol.updateOne(
        { _id: existing._id },
        { $set: update, $unset: { access_token: "" } }
      );
    } else {
      // CREATE (token required)
      if (!gitlabToken || gitlabToken.trim().length === 0) {
        return NextResponse.json({ error: "gitlabToken is required when creating a new project" }, { status: 400 });
      }
      const { ciphertext, nonce, tag } = encryptToken(gitlabToken);
      const doc: import("@/lib/db").Project = {
        name,
        gitlab_url,
        projectId,
        token: { ciphertext, nonce, tag },
        isActive,
        created_at: now,
        updated_at: now,
      };
      await projectsCol.insertOne(doc);
    }

    // maintain active pointer & mirror flag
    const count = await projectsCol.countDocuments();
    if (isActive || count === 1) {
      await configCol.updateOne(
        { key: "activeProjectId" },
        { $set: { value: String(projectId) } },
        { upsert: true }
      );
      await projectsCol.updateMany({}, { $set: { isActive: false } });
      await projectsCol.updateOne({ projectId }, { $set: { isActive: true } });
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Save failed" }, { status: 500 });
  }
}
