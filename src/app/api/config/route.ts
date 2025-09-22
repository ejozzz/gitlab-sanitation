// src/app/api/config/route.ts
import { NextRequest, NextResponse } from "next/server";
import { Projects, Config } from "@/lib/db";
import { encryptToken } from "@/lib/config.server";
import { GitLabAPIClient } from "@/lib/gitlab";

/**
 * GET
 * Returns current setup status and the list of saved projects (minimal fields).
 */
export async function GET() {
  try {
    const projectsCol = await Projects();
    const configCol  = await Config();
    const rows = await projectsCol
      .find({}, { projection: { name: 1, gitlab_url: 1, projectId: 1, created_at: 1, updated_at: 1, isActive: 1 } })
      .sort({ created_at: -1 })
      .toArray();

    const projects = rows.map((r: any) => ({
      id: String(r._id),
      name: r.name,
      gitlabHost: typeof r.gitlab_url === "string" && r.gitlab_url.includes("/api/v4/projects/")
        ? r.gitlab_url.split("/api/v4/projects/")[0]
        : (r.gitlabHost ?? ""),
      projectId: r.projectId,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      isActive: !!r.isActive,
    }));

    return NextResponse.json({
      configured: rows.length > 0,
      projects,
    });
  } catch (e: any) {
    console.error("GET /api/config", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/**
 * POST
 * - If body.save !== true → validate token/connection
 * - If body.save === true → upsert the project (encrypted token), optionally set active
 *
 * Expected payload from SettingsForm (camelCase):
 * { name, gitlabHost, projectId, gitlabToken, isActive?, save? }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const name = String(body?.name ?? "");
    const gitlabHost = String(body?.gitlabHost ?? "").replace(/\/+$/, "");
    const projectId = String(body?.projectId ?? "").trim();
    const gitlabToken = body?.gitlabToken ? String(body.gitlabToken) : "";
    const isActive = !!body?.isActive;
    const isSave = !!body?.save;

    if (!name || !gitlabHost || !projectId) {
      return NextResponse.json({ error: "name, gitlabHost, projectId are required" }, { status: 400 });
    }

    if (!isSave) {
      // Validation path: hit GitLab /user and /projects/:id
      if (!gitlabToken) {
        return NextResponse.json({ error: "gitlabToken is required for validation" }, { status: 400 });
      }
      const client = new GitLabAPIClient(gitlabHost, gitlabToken, Number(projectId));
      // Will throw if invalid
      const result = await client.validateToken();
      return NextResponse.json({ ok: true, user: result.user, project: result.project });
    }

    // Save path: encrypt token and upsert
    if (!gitlabToken) {
      return NextResponse.json({ error: "gitlabToken is required to save a project" }, { status: 400 });
    }

    const { ciphertext, nonce, tag } = encryptToken(gitlabToken);
    const projectsCol = await Projects();
    const now = new Date();

    // Compose canonical GitLab project API URL
    const gitlab_url = `${gitlabHost}/api/v4/projects/${projectId}`;

    const existing = await projectsCol.findOne({ projectId });

    if (existing) {
      await projectsCol.updateOne(
        { _id: existing._id },
        {
          $set: {
            name,
            gitlab_url,
            // store encrypted token in a nested object
            token: { ciphertext, nonce, tag },
            isActive,
            updated_at: now,
          },
          $setOnInsert: { created_at: existing.created_at ?? now },
          $unset: { access_token: "" }, // remove any legacy plaintext
        }
      );
    } else {
      await projectsCol.insertOne({
        name,
        gitlab_url,
        projectId,
        token: { ciphertext, nonce, tag },
        isActive,
        created_at: now,
        updated_at: now,
      });
    }

    // Update the active project pointer if requested or if it's the first project
    const configCol = await Config();
    const count = await projectsCol.countDocuments();
    if (isActive || count === 1) {
      await configCol.updateOne(
        { key: "activeProjectId" },
        { $set: { value: String(projectId) } },
        { upsert: true }
      );
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("POST /api/config", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
