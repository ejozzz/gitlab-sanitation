// src/app/api/gitlab/repository/overview/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { decryptToken } from '@/lib/config.server';

export const dynamic = 'force-dynamic'; // prevent static caching

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);

    // ---- Get active project using caller's cookies (same pattern as /branches) ----
    const cookie = req.headers.get('cookie') ?? '';
    const activeUrl = new URL('/api/projects/active', url.origin).toString();
    const activeRes = await fetch(activeUrl, {
      headers: cookie ? { cookie } : undefined,
      cache: 'no-store',
    });

    // If no active project, return an "empty" overview (like branches returns empty list)
    if (!activeRes.ok) {
      return NextResponse.json(emptyOverview());
    }

    const cfg = await activeRes.json().catch(() => null);
    if (!cfg || !cfg.gitlabHost || !cfg.projectId || !cfg.token) {
      return NextResponse.json(emptyOverview());
    }

    // cfg.token is encrypted { ciphertext, nonce, tag }
    const plainToken = decryptToken(cfg.token.ciphertext, cfg.token.nonce, cfg.token.tag);

    // ---- Build GitLab base URL ----
    const gitlabHost = String(cfg.gitlabHost).replace(/\/+$/, ''); // trim trailing slash
    const projectIdStr = encodeURIComponent(String(cfg.projectId));
    const base = `${gitlabHost}/api/v4/projects/${projectIdStr}`;

    // ---- Helper to fetch+parse safely (raw then JSON.parse), using Bearer token ----
    async function gFetch(pathOrFull: string) {
      const full = pathOrFull.startsWith('http') ? pathOrFull : `${base}${pathOrFull}`;
      const r = await fetch(full, {
        headers: { Authorization: `Bearer ${plainToken}`, Accept: 'application/json' },
        cache: 'no-store',
      });
      const raw = await r.text();
      let json: unknown = undefined;
      try { json = raw ? JSON.parse(raw) : undefined; } catch { /* keep undefined */ }
      return { ok: r.ok, status: r.status, headers: r.headers, raw, json };
    }

    // ---- 1) Project meta (must succeed) ----
    const projRes = await gFetch('');
    if (!projRes.ok) {
      return NextResponse.json(
        { error: projRes.raw || `GitLab project request failed (${projRes.status})` },
        { status: projRes.status },
      );
    }
    const project = (projRes.json || {}) as any;
    const defaultBranch: string = project?.default_branch ?? 'main';

    // ---- 2) Parallel data (best effort; degrade if one fails) ----
    const [
      commitsRes,
      mrsRes,
      pipelinesRes,
      languagesRes,
      tagsRes,
    ] = await Promise.all([
      gFetch(`/repository/commits?ref_name=${encodeURIComponent(defaultBranch)}&per_page=5`),
      gFetch(`/merge_requests?state=opened&scope=all&per_page=1`), // we just need X-Total
      gFetch(`/pipelines?ref=${encodeURIComponent(defaultBranch)}&per_page=1`),
      gFetch(`/languages`),
      gFetch(`/repository/tags?per_page=1`),
    ]);

    // ---- Parse pieces with safe fallbacks ----
    const recentCommits = Array.isArray(commitsRes.json) ? (commitsRes.json as any[]) : [];
    const latestCommit = recentCommits[0] ?? null;

    const openMrTotalHeader = Number(mrsRes.headers?.get('x-total') ?? '');
    const openMrTotal =
      Number.isFinite(openMrTotalHeader) && openMrTotalHeader >= 0
        ? openMrTotalHeader
        : (Array.isArray(mrsRes.json) ? (mrsRes.json as any[]).length : 0);

    const latestPipeline =
      Array.isArray(pipelinesRes.json) && (pipelinesRes.json as any[])[0]
        ? (pipelinesRes.json as any[])[0]
        : null;

    const languages = (languagesRes.json && typeof languagesRes.json === 'object')
      ? (languagesRes.json as Record<string, number>)
      : {};

    const latestTag =
      Array.isArray(tagsRes.json) && (tagsRes.json as any[])[0]
        ? (tagsRes.json as any[])[0]
        : null;

    // ---- Final JSON (shape is stable even if some pieces failed) ----
    return NextResponse.json({
      project: {
        id: project?.id,
        name: project?.name ?? '',
        path_with_namespace: project?.path_with_namespace,
        web_url: project?.web_url,
        ssh_url_to_repo: project?.ssh_url_to_repo,
        http_url_to_repo: project?.http_url_to_repo,
        visibility: project?.visibility,
        default_branch: defaultBranch,
        last_activity_at: project?.last_activity_at,
        star_count: project?.star_count,
        forks_count: project?.forks_count,
      },
      languages,          // map<string, number>
      latestTag,          // first tag or null
      latestPipeline,     // latest pipeline on default branch or null
      openMrTotal,        // total opened MRs (from X-Total or fallback)
      recentCommits,      // last 5 commits on default branch
      latestCommit,       // same as recentCommits[0]
    });
  } catch (err: any) {
    console.error('[api/gitlab/repository/overview] error', err);
    return NextResponse.json({ error: err?.message ?? 'Unexpected error' }, { status: 500 });
  }
}

/** Returns an empty but well-shaped overview when no active project is set */
function emptyOverview() {
  return {
    project: null,
    languages: {},
    latestTag: null,
    latestPipeline: null,
    openMrTotal: 0,
    recentCommits: [],
    latestCommit: null,
  };
}
