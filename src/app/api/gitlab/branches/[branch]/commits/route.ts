// src/app/api/gitlab/branches/[branch]/commits/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { decryptToken } from '@/lib/config.server';

export const dynamic = 'force-dynamic';

function safeDecodeOnce(s: string): string {
  try { return decodeURIComponent(s); } catch { return s; }
}

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
  ctx: { params: Promise<{ branch?: string }> } // <-- params is a Promise in Next 15
) {
  try {
    const url = new URL(req.url);
    const sp = url.searchParams;

    // await params before using
    const awaited = await ctx.params;
    const rawBranch = (awaited?.branch ?? sp.get('branch') ?? '').trim();
    const branch = safeDecodeOnce(rawBranch);
    if (!branch) return NextResponse.json({ error: 'Missing branch' }, { status: 400 });

    const page = Math.max(1, parseInt(sp.get('page') ?? '1', 10) || 1);
    const perPage = Math.min(100, Math.max(1, parseInt(sp.get('perPage') ?? '20', 10) || 20));

    // Resolve active project via cookies (same as other routes)
    const cookie = req.headers.get('cookie') ?? '';
    const cfgRes = await fetch(new URL('/api/projects/active', url.origin).toString(), {
      headers: cookie ? { cookie } : undefined,
      cache: 'no-store',
    });
    if (!cfgRes.ok) return NextResponse.json({ error: 'Active project not found' }, { status: 404 });

    const cfg = await cfgRes.json();
    if (!cfg?.gitlabHost || !cfg?.projectId || !cfg?.token) {
      return NextResponse.json({ error: 'Invalid project config' }, { status: 400 });
    }

    const token = decryptToken(cfg.token.ciphertext, cfg.token.nonce, cfg.token.tag);
    const host = String(cfg.gitlabHost).replace(/\/+$/, '');
    const pid = encodeURIComponent(String(cfg.projectId));
    const mk = (p: string) => new URL(`${host}/api/v4/projects/${pid}${p}`);

    // Fetch commits
    const commitsUrl = mk('/repository/commits');
    commitsUrl.searchParams.set('ref_name', branch);
    commitsUrl.searchParams.set('page', String(page));
    commitsUrl.searchParams.set('per_page', String(perPage));

    const res = await dualFetch(commitsUrl, token);
    if (!res.ok) {
      const txt = await res.text();
      return NextResponse.json({ error: txt || `GitLab error (${res.status})` }, { status: res.status });
    }

    const commits = await res.json();

    // Pagination headers (may be missing on some setups)
    const h = res.headers;
    const next = h.get('x-next-page');
    const prev = h.get('x-prev-page');
    const total = h.get('x-total') ? Number(h.get('x-total')) : undefined;
    const totalPages = h.get('x-total-pages') ? Number(h.get('x-total-pages')) : undefined;

    const hasNext = !!(next && Number(next) > 0);
    const hasPrev = !!(prev && Number(prev) > 0);

    // Infer one more page if totals missing but next exists
    const safeTotalPages = Number.isFinite(totalPages as number)
      ? (totalPages as number)
      : hasNext
      ? page + 1
      : page;

    return NextResponse.json({
      commits,
      page,
      perPage,
      hasNext,
      hasPrev,
      nextPage: hasNext ? Number(next) || page + 1 : null,
      total: Number.isFinite(total as number) ? (total as number) : Array.isArray(commits) ? commits.length : 0,
      totalPages: safeTotalPages,
    });
  } catch (err: any) {
    console.error('[api/gitlab/branches/[branch]/commits] error', err);
    return NextResponse.json({ error: err?.message ?? 'Unexpected error' }, { status: 500 });
  }
}

