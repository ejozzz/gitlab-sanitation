import { NextRequest, NextResponse } from 'next/server';
import { decryptToken } from '@/lib/config.server';

export const dynamic = 'force-dynamic';

async function loadProjects(origin: string, cookie: string) {
  const r = await fetch(new URL('/api/projects', origin).toString(), {
    headers: cookie ? { cookie } : undefined,
    cache: 'no-store',
  });
  if (!r.ok) throw new Error('Unable to load projects');
  const j = await r.json();
  return Array.isArray(j) ? j : (j?.projects ?? []);
}

async function loadWatchlist(origin: string, cookie: string) {
  const r = await fetch(new URL('/api/watchlist', origin).toString(), {
    headers: cookie ? { cookie } : undefined,
    cache: 'no-store',
  });
  if (!r.ok) return [];
  const j = await r.json();
  return Array.isArray(j?.branches) ? j.branches as string[] : [];
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const selections: Array<{ projectId: number | string; projectName?: string; sourceBranch: string }> =
      Array.isArray(body?.selections) ? body.selections : [];

    if (!selections.length) return NextResponse.json({ projects: [] });

    const origin = new URL(req.url).origin;
    const cookie = req.headers.get('cookie') ?? '';

    const projects = await loadProjects(origin, cookie);
    const byId: Record<string, any> = {};
    for (const p of projects) {
      const key = String(p?.projectId ?? '').trim();
      if (key) byId[key] = p;
    }

    const targets = await loadWatchlist(origin, cookie);
    if (!targets.length) {
      return NextResponse.json({ projects: [], error: 'Watchlist is empty' }, { status: 200 });
    }

    const out = await Promise.all(selections.map(async (sel) => {
      const pidStr = String(sel.projectId ?? '').trim();
      const proj = byId[pidStr];
      if (!proj || !sel.sourceBranch) {
        return { projectId: sel.projectId, projectName: sel.projectName, sourceBranch: sel.sourceBranch, targets: [], error: 'invalid project/branch' };
      }

      try {
        let host = (proj.gitlabHost || proj.gitlab_url || '').toString().replace(/\/+$/, '');
        if (host.includes('/api/v4/projects/')) host = host.split('/api/v4/projects/')[0];
        const token = decryptToken(proj.gitlabToken ?? proj.token);
        const headers = { 'PRIVATE-TOKEN': token };

        const results = await Promise.all(targets.map(async (targetBranch: string) => {
          try {
            // 1) merged?
            const cmpUrl = `${host}/api/v4/projects/${encodeURIComponent(pidStr)}/repository/compare?from=${encodeURIComponent(targetBranch)}&to=${encodeURIComponent(sel.sourceBranch)}`;
            const r1 = await fetch(cmpUrl, { headers, cache: 'no-store' });
            if (!r1.ok) {
              const txt = await r1.text().catch(() => '');
              throw new Error(`compare ${r1.status} ${txt.slice(0, 200)}`);
            }
            const cmp = await r1.json();
            const merged = Array.isArray(cmp?.commits) ? cmp.commits.length === 0 : false;

            // 2) cherry-pick inference
            let cherryPicked = false;
            let sampleCommits: string[] = [];
            if (!merged) {
              const commitsUrl = `${host}/api/v4/projects/${encodeURIComponent(pidStr)}/repository/commits?ref_name=${encodeURIComponent(sel.sourceBranch)}&per_page=10`;
              const r2 = await fetch(commitsUrl, { headers, cache: 'no-store' });
              const srcCommits = r2.ok ? await r2.json() : [];
              const shortIds: string[] = (srcCommits ?? []).map((c: any) => c?.short_id).filter(Boolean).slice(0, 10);

              for (const sid of shortIds) {
                const searchUrl = `${host}/api/v4/projects/${encodeURIComponent(pidStr)}/search?scope=commits&ref=${encodeURIComponent(targetBranch)}&search=${encodeURIComponent(sid)}`;
                const rs = await fetch(searchUrl, { headers, cache: 'no-store' });
                if (rs.ok) {
                  const arr = await rs.json();
                  if (Array.isArray(arr) && arr.length > 0) {
                    cherryPicked = true;
                    sampleCommits.push(sid);
                    if (sampleCommits.length >= 4) break;
                  }
                }
              }
            }

            return {
              targetBranch,
              merged,
              cherryPicked,
              evidence: {
                compareUrl: `${host}/${encodeURIComponent(pidStr)}/-/compare/${encodeURIComponent(targetBranch)}...${encodeURIComponent(sel.sourceBranch)}`,
                sampleCommits: sampleCommits.length ? sampleCommits : undefined,
              },
            };
          } catch (err: any) {
            return { targetBranch, merged: false, cherryPicked: false, evidence: undefined, error: err?.message ?? 'target check failed' };
          }
        }));

        return {
          projectId: sel.projectId,
          projectName: sel.projectName ?? proj.name,
          sourceBranch: sel.sourceBranch,
          targets: results,
        };
      } catch (e: any) {
        return { projectId: sel.projectId, projectName: sel.projectName, sourceBranch: sel.sourceBranch, targets: [], error: e?.message ?? 'execute failed' };
      }
    }));

    return NextResponse.json({ projects: out });
  } catch (e: any) {
    return NextResponse.json({ projects: [], error: e?.message ?? 'execute error' }, { status: 200 });
  }
}
