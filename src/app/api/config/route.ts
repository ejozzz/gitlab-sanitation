import { NextRequest, NextResponse } from "next/server";
import { Projects, Config } from "@/lib/db";

/* ----------  GET  ---------- */
export async function GET() {
  try {
    const projectsCol = await Projects();

    // Fetch all projects, newest first
    const rows = await projectsCol
      .find({}, { projection: { name: 1, gitlab_url: 1, created_at: 1, updated_at: 1 } })
      .sort({ created_at: -1 })
      .toArray();

    return NextResponse.json({
      configured: rows.length > 0,
      activeProjectId: rows[0]?._id?.toString() ?? null, // newest = active
      projectCount: rows.length,
      projects: rows.map((r) => ({
        id: r._id.toString(),
        name: r.name,
        gitlabHost: r.gitlab_url.split("/api/v4/projects/")[0], // derive host
        projectId: r.gitlab_url.split("/api/v4/projects/")[1],
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
      updatedAt: rows[0]?.updated_at ?? null,
    });
  } catch (e: any) {
    console.error("GET /api/config", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/* ----------  POST  – switch active project ---------- */
export async function POST(request: NextRequest) {
  try {
    const { activeProjectId } = await request.json();

    const configCol = await Config();

    // Upsert into config collection
    await configCol.updateOne(
      { key: "activeProjectId" },
      { $set: { value: String(activeProjectId) } },
      { upsert: true }
    );

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("POST /api/config", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
