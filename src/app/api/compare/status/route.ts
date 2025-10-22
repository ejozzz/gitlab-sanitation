import { NextRequest, NextResponse } from 'next/server';
import { decryptToken } from '@/lib/config.server';

export const dynamic = 'force-dynamic';

/**
 * Request body:
 * { items: { projectId: number; sourceBranch: string; targetBranch: string; }[] }
 *
 * Response:
 * { items: StatusOutput[] }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const items = Array.isArray(body?.items) ? body.items : [];
    if (!items.length) {
      return NextResponse.json({ items: [] });
    }

    // We'll need project metadata (host + token) to hit GitLab directly for compare & commit search.
    // Reuse your existing /api/projects GET to fetch all and pick by projectId.
    const origin = new URL(req.url).origin;
    const cookie = req.headers.get('cookie') ?? '';
    const projRes = await fetch(`${origin}/api/projects`, {
      headers: cookie ? { cookie } : undefined,
      cache: 'no-store',
    });
    if (!projRes.ok) {
      throw new Error('Unable to load projects');
    }
    const { projects } = await projRes.json(); // includes encrypted tokens
    const byGitlabId: Record<number, any> = {};
    for (const p of (projects ?? [])) {
      if (p?.projectId) byGitlabId[p.projectId] = p;
    }

    // For each item: run "merged?" via /repository/compare (commits.length === 0)
    // If not merged: sample last N commits on source and check if short_ids appear on target via search scope=commits.
    const out = await Promise.all(items.map(async (it: any) => {
      const pid = it?.projectId;
      const source = String(it?.sourceBranch ?? '');
      const target = String(it?.targetBranch ?? '');
      const p = byGitlabId[pid];

      if (!pid || !source || !target || !p) {
        return {
          projectId: pid,
          sourceBranch: source,
          targetBranch: target,
          merged: false,
          cherryPicked: false,
          error: 'invalid project/branches',
        };
      }

      try {
        const host = p.gitlabHost?.replace(/\/+$/, '');
        const token = decryptToken(p.gitlabToken); // your existing helper
        const authHeaders = {
          'PRIVATE-TOKEN': token,
        };

        // 1) Compare: from = target, to = source
        // If commits.length === 0 => already merged
        const compareUrl = `${host}/api/v4/projects/${encodeURIComponent(pid)}/repository/compare?from=${encodeURIComponent(target)}&to=${encodeURIComponent(source)}`;
        const r1 = await fetch(compareUrl, { headers: authHeaders, cache: 'no-store' });
        if (!r1.ok) {
          const txt = await r1.text();
          throw new Error(`compare failed: ${r1.status} ${txt}`);
        }
        const cmp = await r1.json();
        const merged = Array.isArray(cmp?.commits) ? cmp.commits.length === 0 : false;

        // 2) If not merged, check cherry-pick hints.
        // Strategy: take up to 10 latest commits on source, check if any appear in target via search scope=commits + ref=target.
        let cherryPicked = false;
        let sampleCommits: string[] = [];
        if (!merged) {
          // fetch latest source commits
          const srcCommitsUrl = `${host}/api/v4/projects/${encodeURIComponent(pid)}/repository/commits?ref_name=${encodeURIComponent(source)}&per_page=10`;
          const r2 = await fetch(srcCommitsUrl, { headers: authHeaders, cache: 'no-store' });
          const srcCommits = r2.ok ? await r2.json() : [];
          const shortIds: string[] = (srcCommits ?? []).map((c: any) => c.short_id).filter((s: string) => !!s).slice(0, 10);

          // Check existence on target via search scope=commits&search=<sha>&ref=<target>
          for (const sid of shortIds) {
            const searchUrl = `${host}/api/v4/projects/${encodeURIComponent(pid)}/search?scope=commits&search=${encodeURIComponent(sid)}&ref=${encodeURIComponent(target)}`;
            const rs = await fetch(searchUrl, { headers: authHeaders, cache: 'no-store' });
            if (rs.ok) {
              const arr = await rs.json();
              if (Array.isArray(arr) && arr.length > 0) {
                cherryPicked = true;
                sampleCommits.push(sid);
                // no break; collect a few
                if (sampleCommits.length >= 3) break;
              }
            }
          }
        }

        return {
          projectId: pid,
          sourceBranch: source,
          targetBranch: target,
          merged,
          cherryPicked,
          evidence: {
            compareUrl,
            sampleCommits: sampleCommits.length ? sampleCommits : undefined,
          },
        };
      } catch (err: any) {
        return {
          projectId: pid,
          sourceBranch: String(it?.sourceBranch ?? ''),
          targetBranch: String(it?.targetBranch ?? ''),
          merged: false,
          cherryPicked: false,
          error: err?.message ?? 'status check failed',
        };
      }
    }));

    return NextResponse.json({ items: out });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'compare status failed' }, { status: 500 });
  }
}
