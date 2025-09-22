// src/app/api/projects/active/route.ts
import { NextRequest, NextResponse } from "next/server";
import { Projects, Config } from "@/lib/db";

/** GET returns the active project metadata (no token). */
export async function GET() {
  const projectsCol = await Projects();
  const configCol = await Config();
  const kv = await configCol.findOne({ key: "activeProjectId" });

  let p: any = null;
  if (kv?.value) p = await projectsCol.findOne({ projectId: String(kv.value) });
  if (!p) p = await projectsCol.find({}).sort({ created_at: -1 }).limit(1).next();
  if (!p) return NextResponse.json({ error: "No project configured" }, { status: 404 });

  const { token, access_token, ...rest } = p;
  return NextResponse.json({ ...rest, id: String(p._id) });
}

/** POST { projectId } marks it active. */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const projectId = String(body?.projectId ?? body?.projectid ?? "");
  if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });

  const projectsCol = await Projects();
  const exists = await projectsCol.findOne({ projectId });
  if (!exists) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const configCol = await Config();
  await configCol.updateOne(
    { key: "activeProjectId" },
    { $set: { value: String(projectId) } },
    { upsert: true }
  );

  // also reflect on document for convenience
  await projectsCol.updateMany({}, { $set: { isActive: false } });
  await projectsCol.updateOne({ projectId }, { $set: { isActive: true } });

  return NextResponse.json({ ok: true });
}
