// src/app/api/projects/route.ts
import { NextRequest, NextResponse } from "next/server";
import { settingsFormSchema, encryptToken } from "@/lib/config"; // ensure isActive has .default(false)
import { GitLabAPIClient } from "@/lib/gitlab";
import { Projects } from "@/lib/db";

const ENCRYPTION_KEY = process.env.CONFIG_ENCRYPTION_KEY;
if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 32) {
  throw new Error("CONFIG_ENCRYPTION_KEY must be set and 32 characters long");
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

/* ----------  GET  ---------- */
export async function GET() {
  try {
    const projectsCol = await Projects();

    const rows = await projectsCol
      .find({}, { projection: { _id: 1, name: 1, gitlab_url: 1, projectId: 1, created_at: 1, updated_at: 1, isActive: 1 } })
      .sort({ name: 1 })
      .toArray();

    const payload = rows.map((r) => {
      // convenience: derive host for UI
      let gitlabHost = "";
      try {
        const u = new URL(r.gitlab_url);
        gitlabHost = `${u.protocol}//${u.host}`;
      } catch {} // ignore parse errors

      return {
        id: r._id.toString(),
        name: r.name,
        gitlab_url: r.gitlab_url,
        gitlabHost,                         // ← optional helper for your cards
        projectid: String(r.projectId),     // always `projectid`
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        isActive: !!r.isActive,
      };
    });

    return NextResponse.json(payload, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    });
  } catch (e: any) {
    console.error("GET /api/projects", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/* ----------  POST  ---------- */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = settingsFormSchema.parse(body); // isActive will default(false) if omitted)

    // 1) validate credentials
    const client = new GitLabAPIClient(
      validated.gitlabHost,
      validated.gitlabToken,
      validated.projectId
    );
    const { user, project } = await client.validateToken();

    // 2) encrypt (optional; you currently store plaintext like before)
    const encrypted = encryptToken(validated.gitlabToken, ENCRYPTION_KEY!);

    // 3) persist
    const projectsCol = await Projects();
    const gitlabUrl = `${validated.gitlabHost}/api/v4/projects/${validated.projectId}`;

    const insertRes = await projectsCol.insertOne({
      name: validated.name,
      gitlab_url: gitlabUrl,
      projectId: String(validated.projectId),
      access_token: validated.gitlabToken, // or encrypted.ciphertext
      isActive: !!validated.isActive,
      created_at: new Date(),
      updated_at: new Date(),
    });

    // 4) respond
    return NextResponse.json({
      project: {
        id: insertRes.insertedId.toString(),
        name: validated.name,
        gitlab_url: gitlabUrl,
        projectid: String(validated.projectId),
        isActive: !!validated.isActive,
      },
      user: { name: user.name, username: user.username },
      projectDetails: {
        name: project.name,
        path_with_namespace: project.path_with_namespace,
      },
    });
  } catch (error: any) {
    if (error?.code === 11000) {
      return NextResponse.json(
        { error: "Project already exists (duplicate key)" },
        { status: 409 }
      );
    }
    console.error("POST /api/projects", error);
    return NextResponse.json(
      { error: error.message || "Failed to add project" },
      { status: 400 }
    );
  }
}
