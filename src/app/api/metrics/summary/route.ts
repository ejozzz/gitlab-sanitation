//app/api/metrics/summary/route.ts
import { NextResponse } from "next/server";
import { getActiveProject, materializeToken } from "@/lib/repos/projects-repo";
import { GitLabAPIClient } from "@/lib/gitlab";
import type { SummaryResponse } from "@/lib/types";

const DEFAULT_STALE_DAYS = Number(process.env.STALE_DAYS || 30);
const DEFAULT_REGEX = process.env.BRANCH_NAME_REGEX || "^(feature|bugfix|hotfix|release)\\/[a-z0-9._-]+$";

type GitLabBranch = { name: string; commit: { committed_date: string; author_name: string } };
type GitLabMR = { source_branch: string };

async function paginate<T>(client: GitLabAPIClient, base: string, perPage = 100) {
  let page = 1, all: T[] = [];
  while (true) {
    const sep = base.includes("?") ? "&" : "?";
    const batch = await client.fetchGitLab<T[]>(`${base}${sep}per_page=${perPage}&page=${page}`);
    all.push(...batch);
    if (batch.length < perPage) break;
    page++;
  }
  return all;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const staleDays = Number(searchParams.get("staleDays") || DEFAULT_STALE_DAYS);
    const nameRegex = new RegExp(searchParams.get("nameRegex") || DEFAULT_REGEX);

    const proj = await getActiveProject();
    if (!proj) return NextResponse.json({ error: "No active project set" }, { status: 400 });

    const token = materializeToken(proj);
    const gl = new GitLabAPIClient(proj.gitlabhost, token, proj.projectid);

    const now = new Date();
    const from = new Date(now.getTime() - 30 * 24 * 3600 * 1000);

    const context: SummaryResponse["context"] = {
      projectId: proj.projectid,       // keep Response casing consistent with your UI if needed
      gitlabHost: proj.gitlabhost,
      defaultBranch: "main",
      timeRange: { from: from.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) },
    };

    const branches = await paginate<GitLabBranch>(gl, `/projects/${proj.projectid}/repository/branches`);
    const openMrs  = await paginate<GitLabMR>(gl, `/projects/${proj.projectid}/merge_requests?state=opened`);

    const mrBySource = new Map<string, number>();
    openMrs.forEach(mr => mrBySource.set(mr.source_branch, (mrBySource.get(mr.source_branch) || 0) + 1));

    const ageBuckets = [
      { label: "0–7d", count: 0 },
      { label: "8–30d", count: 0 },
      { label: "31–90d", count: 0 },
      { label: "90d+", count: 0 },
    ];
    const staleCutoff = new Date(now.getTime() - staleDays * 24 * 3600 * 1000);

    let stale = 0, orphaned = 0, compliant = 0;
    const staleList: { name: string; daysSinceCommit: number; author: string }[] = [];
    const nonCompliant: { name: string; author: string }[] = [];
    const orphanedList: { name: string; author: string }[] = [];

    for (const b of branches) {
      const committed = new Date(b.commit.committed_date);
      const days = Math.max(0, Math.round((now.getTime() - committed.getTime()) / (24 * 3600 * 1000)));

      if (days <= 7) ageBuckets[0].count++;
      else if (days <= 30) ageBuckets[1].count++;
      else if (days <= 90) ageBuckets[2].count++;
      else ageBuckets[3].count++;

      if (committed < staleCutoff) { stale++; staleList.push({ name: b.name, daysSinceCommit: days, author: b.commit.author_name }); }
      if (nameRegex.test(b.name)) compliant++; else nonCompliant.push({ name: b.name, author: b.commit.author_name });
      if (!mrBySource.has(b.name)) { orphaned++; orphanedList.push({ name: b.name, author: b.commit.author_name }); }
    }

    staleList.sort((a, b) => b.daysSinceCommit - a.daysSinceCommit);
    const total = branches.length || 1;
    const namingCompliancePct = Math.round((compliant / total) * 1000) / 10;

    const resp: SummaryResponse = {
      context,
      kpis: {
        branchHygiene: {
          totalBranches: total,
          staleCount: stale,
          orphanedCount: orphaned,
          namingCompliancePct,
          protectedViolations: 0,
          ageBuckets,
        },
      },
      topLists: {
        staleBranches: staleList.slice(0, 15),
        nonCompliantNames: nonCompliant.slice(0, 15),
        orphanedBranches: orphanedList.slice(0, 15),
      },
      highlights: [
        ...(stale > 20 ? [{ type: "alert", severity: "high", title: "Too many stale branches", summary: `${stale} branches older than ${staleDays} days.`, link: "/dashboards/branch-hygiene#stale" } as const] : []),
        ...(namingCompliancePct < 85 ? [{ type: "alert", severity: "medium", title: "Low naming compliance", summary: `${namingCompliancePct}% branches follow the convention.`, link: "/dashboards/branch-hygiene#naming" } as const] : []),
      ],
    };

    return NextResponse.json(resp);
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Unknown error" }, { status: 500 });
  }
}
