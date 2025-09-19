import { NextResponse } from "next/server";
import { Projects } from "@/lib/db";

export async function GET() {
  try {
    const projectsCol = await Projects();

    const doc = await projectsCol
      .find({}, { projection: { name: 1, gitlab_url: 1, projectId: 1, created_at: 1 } })
      .sort({ created_at: -1 })
      .limit(1)
      .next();

    if (!doc) {
      return NextResponse.json({ error: "No project configured" }, { status: 404 });
    }

    return NextResponse.json({
      id: doc._id.toString(),        // ✅ always `id`
      name: doc.name,
      gitlab_url: doc.gitlab_url,
      projectid: String(doc.projectId), // ✅ always `projectid`
      createdAt: doc.created_at,
    });
  } catch (e: any) {
    console.error("GET /api/projects/active", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
