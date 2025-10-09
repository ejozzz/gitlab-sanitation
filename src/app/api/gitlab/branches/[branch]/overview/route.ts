// src/app/api/gitlab/branches/[branch]/overview/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { decryptToken } from '@/lib/config.server';

export const dynamic = 'force-dynamic';

function safeDecodeOnce(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

// Dual-auth: try PRIVATE-TOKEN (PAT), then Authorization: Bearer (OAuth/JWT)
async function dualFetch(url: URL, token: string, init?: RequestInit) {
  const h1 = new Headers(init?.headers || {});
  h1.set('PRIVATE-TOKEN', token);
  const r1 = await fetch(url, { ...init, headers: h1, cache: 'no-store' });
  if (r1.ok || r1.status !== 401) return r1;

  const h2 = new Headers(init?.headers || {});
  h2.set('Authorization', `Bearer ${token}`);
  return fetch(url, { ...init, headers: h2, cache: 'no-store' });
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ branch?: string }> }   // <-- params is a Promise in Next 15
) {
  try {
    const url = new URL(req.url);
    const sp = url.searchParams;

    // ✅ await params before using
    const awaited = await ctx.params;
    const fromParam = awaited?.branch ?? '';
    const fromQuery = sp.get('branch') ?? '';
    const raw = (fromParam || fromQuery).trim();
    const branch = safeDecodeOnce(raw);

    if (!branch) {
      return NextResponse.json({ error: 'Missing branch' }, { status: 400 });
    }

    const commitsPerPage = Math.min(
      100,
      Math.max(0, parseInt(sp.get('commitsPerPage') ?? sp.get('commits') ?? '20', 10) || 20)
    );
    const commitsPage = Math.max(1, parseInt(sp.get('commitsPage') ?? '1', 10) || 1);

    const mrsN = Math.min(100, Math.max(1, parseInt(sp.get('mrs') ?? '10', 10) || 10));
    const pipelinesN = Math.min(100, Math.max(1, parseInt(sp.get('pipelines') ?? '5', 10) || 5));

    // mirror your other routes: resolve active project via cookies
    const cookie = req.headers.get('cookie') ?? '';
    const activeUrl = new URL('/api/projects/active', url.origin).toString();
    const cfgRes = await fetch(activeUrl, { headers: cookie ? { cookie } : undefined, cache: 'no-store' });
    if (!cfgRes.ok) return NextResponse.json({ error: 'Active project not found' }, { status: 404 });

    const cfg = await cfgRes.json();
    if (!cfg?.gitlabHost || !cfg?.projectId || !cfg?.token) {
      return NextResponse.json({ error: 'Invalid project config' }, { status: 400 });
    }

    const token = decryptToken(cfg.token.ciphertext, cfg.token.nonce, cfg.token.tag);
    const host = String(cfg.gitlabHost).replace(/\/+$/, '');
    const pid = encodeURIComponent(String(cfg.projectId));
    const encBranch = encodeURIComponent(branch);
    const mk = (p: string) => new URL(`${host}/api/v4/projects/${pid}${p}`);

    // 1) Branch info
    const brRes = await dualFetch(mk(`/repository/branches/${encBranch}`), token);
    if (!brRes.ok) {
      const txt = await brRes.text();
      return NextResponse.json({ error: txt || `Failed to fetch branch (${brRes.status})` }, { status: brRes.status });
    }
    const br = await brRes.json();

    // 2) Commits (optional if commitsPerPage === 0)
    let commits: any[] = [];
    let commitsMeta: any | undefined = undefined;
    if (commitsPerPage > 0) {
      const commitsUrl = mk(`/repository/commits`);
      commitsUrl.searchParams.set('ref_name', branch);
      commitsUrl.searchParams.set('page', String(commitsPage));
      commitsUrl.searchParams.set('per_page', String(commitsPerPage));
      const cmRes = await dualFetch(commitsUrl, token);
      commits = cmRes.ok ? await cmRes.json() : [];

      const cmH = cmRes.headers;
      const cmTotal = cmH.get('x-total') ? Number(cmH.get('x-total')) : undefined;
      const cmTotalPagesHeader = cmH.get('x-total-pages');
      const cmTotalPages = cmTotalPagesHeader ? Number(cmTotalPagesHeader) : undefined;
      const cmNext = cmH.get('x-next-page');
      const cmPrev = cmH.get('x-prev-page');

      const hasNext = !!(cmNext && Number(cmNext) > 0);
      const hasPrev = !!(cmPrev && Number(cmPrev) > 0);

      const inferredTotal = Number.isFinite(cmTotal as number)
        ? (cmTotal as number)
        : Array.isArray(commits)
        ? commits.length
        : 0;

      let inferredTotalPages = Number.isFinite(cmTotalPages as number)
        ? (cmTotalPages as number)
        : Math.max(1, Math.ceil(inferredTotal / commitsPerPage));

      if (!Number.isFinite(cmTotalPages as number) && hasNext) {
        inferredTotalPages = Math.max(inferredTotalPages, commitsPage + 1);
      }

      commitsMeta = {
        page: commitsPage,
        perPage: commitsPerPage,
        total: inferredTotal,
        totalPages: inferredTotalPages,
        hasNext,
        hasPrev,
      };
    }

    // 3) MRs (not paged)
    const mrUrl = mk(`/merge_requests`);
    mrUrl.searchParams.set('source_branch', branch);
    mrUrl.searchParams.set('scope', 'all');
    mrUrl.searchParams.set('order_by', 'updated_at');
    mrUrl.searchParams.set('per_page', String(mrsN));
    const mrRes = await dualFetch(mrUrl, token);
    const mergeRequests = mrRes.ok ? await mrRes.json() : [];

    // 4) Pipelines (not paged)
    const plUrl = mk(`/pipelines`);
    plUrl.searchParams.set('ref', branch);
    plUrl.searchParams.set('per_page', String(pipelinesN));
    const plRes = await dualFetch(plUrl, token);
    const pipelines = plRes.ok ? await plRes.json() : [];

    return NextResponse.json({
      branch: {
        name: br?.name ?? branch,
        default: br?.default,
        protected: br?.protected,
        web_url: br?.web_url,
      },
      commits,
      commitsMeta,
      mergeRequests,
      pipelines,
    });
  } catch (err: any) {
    console.error('[api/gitlab/branches/[branch]/overview] error', err);
    return NextResponse.json({ error: err?.message ?? 'Unexpected error' }, { status: 500 });
  }
}
