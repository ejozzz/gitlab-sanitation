// src/app/api/gitlab/commits/search/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { decryptToken } from '@/lib/config.server';

export const dynamic = 'force-dynamic';

function safeDecodeOnce(s: string): string {
  try { return decodeURIComponent(s); } catch { return s; }
}

/**
 * Try PRIVATE-TOKEN first, fall back to Authorization: Bearer.
 */
async function dualFetch(url: URL, token: string, init?: RequestInit) {
  const h1 = new Headers(init?.headers || {});
  h1.set('PRIVATE-TOKEN', token);
  const r1 = await fetch(url, { ...init, headers: h1, cache: 'no-store' });
  if (r1.ok || r1.status !== 401) return r1;

  const h2 = new Headers(init?.headers || {});
  h2.set('Authorization', `Bearer ${token}`);
  return fetch(url, { ...init, headers: h2, cache: 'no-store' });
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const sp = url.searchParams;

    const q = (sp.get('q') ?? '').trim();
    const branch = safeDecodeOnce((sp.get('branch') ?? '').trim());
    const page = Math.max(1, parseInt(sp.get('page') ?? '1', 10) || 1);
    const perPage = Math.min(100, Math.max(1, parseInt(sp.get('perPage') ?? '50', 10) || 50));

    if (!q) return NextResponse.json({ error: 'Missing search term (?q=)' }, { status: 400 });
    if (!branch) return NextResponse.json({ error: 'Missing branch (?branch=)' }, { status: 400 });

    // ---- Resolve active project (same as other routes) ----
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

    // ---- Build GitLab Search API (scope=commits + ref filter) ----
    const searchUrl = mk('/search');
    searchUrl.searchParams.set('scope', 'commits');
    searchUrl.searchParams.set('search', q);
    searchUrl.searchParams.set('ref', branch);
    searchUrl.searchParams.set('page', String(page));
    searchUrl.searchParams.set('per_page', String(perPage));

    const res = await dualFetch(searchUrl, token);
    if (!res.ok) {
      const txt = await res.text();
      return NextResponse.json({ error: txt || `GitLab error (${res.status})` }, { status: res.status });
    }

    const commits = await res.json();
    if (!Array.isArray(commits)) {
      return NextResponse.json({ error: 'Unexpected response: not an array' }, { status: 502 });
    }

    return NextResponse.json({
      ok: true,
      branch,
      query: q,
      page,
      perPage,
      count: commits.length,
      commits: commits.map((c: any) => ({
        sha: c.id,
        short: c.id?.slice(0, 8),
        title: c.title,
        message: c.message,
        author: c.author_name,
        authored_date: c.authored_date,
        web_url: c.web_url,
      })),
    });
  } catch (err: any) {
    console.error('[api/gitlab/commits/search] error', err);
    return NextResponse.json({ error: err?.message ?? 'Unexpected error' }, { status: 500 });
  }
}
