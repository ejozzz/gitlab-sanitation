// src/app/api/projects/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { Projects } from "@/lib/db";

export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> } // <- Promise-wrapped
) {
  const { id } = await params; // <- await before use

  let query;
  try {
    query = { _id: new ObjectId(id) };
  } catch {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const col = await Projects();
  const doc = await col.findOne(query, {
    projection: {
      name: 1,
      gitlab_url: 1,
      projectId: 1,
      created_at: 1,
      updated_at: 1,
      isActive: 1,
    },
  });

  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const item = {
    id: String(doc._id),
    name: doc.name,
    gitlabHost:
      typeof doc.gitlab_url === "string" &&
      doc.gitlab_url.includes("/api/v4/projects/")
        ? doc.gitlab_url.split("/api/v4/projects/")[0]
        : "",
    projectId: doc.projectId,
    createdAt: doc.created_at,
    updatedAt: doc.updated_at,
    isActive: !!doc.isActive,
  };

  return NextResponse.json(item);
}