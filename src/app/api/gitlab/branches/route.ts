// src/app/api/gitlab/branches/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getActiveProjectConfig } from "@/lib/active-project.server";
import { GitLabAPIClient } from "@/lib/gitlab";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || undefined;

    const cfg = await getActiveProjectConfig();
    if (!cfg) return NextResponse.json({ error: "No active project set" }, { status: 400 });

    const client = new GitLabAPIClient(cfg.gitlabHost, cfg.token, cfg.projectId);
    const branches = await client.getBranches(search);

    return NextResponse.json(branches);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Unknown error" }, { status: 500 });
  }
}
