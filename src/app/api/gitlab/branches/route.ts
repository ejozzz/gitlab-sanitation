// src/app/api/gitlab/branches/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { decryptToken } from '@/lib/config.server';

export const dynamic = 'force-dynamic'; // prevent static caching

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const sp = url.searchParams;

    const search = (sp.get('search') ?? '').trim();
    const page = Math.max(1, parseInt(sp.get('page') ?? '1', 10) || 1);
    const perPage = Math.min(100, Math.max(1, parseInt(sp.get('perPage') ?? '20', 10) || 20));

    // ---- Get active project using caller's cookies ----
    const cookie = req.headers.get('cookie') ?? '';
    const activeUrl = new URL('/api/projects/active', url.origin).toString();
    const activeRes = await fetch(activeUrl, {
      headers: cookie ? { cookie } : undefined,
      cache: 'no-store',
    });

    if (!activeRes.ok) {
      return NextResponse.json({ branches: [], total: 0, totalPages: 1, page, perPage });
    }

    const cfg = await activeRes.json();
    if (!cfg) {
      return NextResponse.json({ branches: [], total: 0, totalPages: 1, page, perPage });
    }

    // cfg shape expected:
    // { gitlabHost: string, projectId: number|string, token: { ciphertext, nonce, tag } }
    const plainToken = decryptToken(cfg.token.ciphertext, cfg.token.nonce, cfg.token.tag);

    // ---- Build GitLab request (one GET; read headers for totals) ----
    const gitlabHost = String(cfg.gitlabHost).replace(/\/+$/, ''); // trim trailing slash
    const projectIdStr = encodeURIComponent(String(cfg.projectId));
    const glUrl = new URL(`${gitlabHost}/api/v4/projects/${projectIdStr}/repository/branches`);
    glUrl.searchParams.set('page', String(page));
    glUrl.searchParams.set('per_page', String(perPage));
    if (search) glUrl.searchParams.set('search', search);

    const glRes = await fetch(glUrl, {
      headers: { Authorization: `Bearer ${plainToken}` },
      cache: 'no-store',
    });

    const raw = await glRes.text();
    if (!glRes.ok) {
      // Surface GitLab's error text if any
      return NextResponse.json(
        { error: raw || `GitLab request failed (${glRes.status})` },
        { status: glRes.status },
      );
    }

    let branches: unknown = [];
    try {
      branches = JSON.parse(raw);
    } catch {
      // keep [] if parsing fails
      branches = [];
    }

    // ---- Robust pagination totals ----
    const xTotalHeader = glRes.headers.get('x-total');
    const xTotalPagesHeader = glRes.headers.get('x-total-pages');
    const xNextPageHeader = glRes.headers.get('x-next-page');
    const xPrevPageHeader = glRes.headers.get('x-prev-page');

    const totalFromHeader = xTotalHeader ? Number(xTotalHeader) : undefined;
    const totalPagesFromHeader = xTotalPagesHeader ? Number(xTotalPagesHeader) : undefined;

    const arrayLen = Array.isArray(branches) ? (branches as any[]).length : 0;
    const total = Number.isFinite(totalFromHeader as number)
      ? (totalFromHeader as number)
      : arrayLen;
    let totalPages = Number.isFinite(totalPagesFromHeader as number)
      ? (totalPagesFromHeader as number)
      : Math.max(1, Math.ceil(total / perPage));

    const hasNext = !!(xNextPageHeader && Number(xNextPageHeader) > 0);
    const hasPrev = !!(xPrevPageHeader && Number(xPrevPageHeader) > 0);

    if (!Number.isFinite(totalPagesFromHeader as number)) {
      if (hasNext) totalPages = Math.max(totalPages, page + 1);
    }

    return NextResponse.json({
      branches,
      total,
      totalPages,
      page,
      perPage,
      hasNext,
      hasPrev
    });
  } catch (err: any) {
    console.error('[api/gitlab/branches] error', err);
    return NextResponse.json({ error: err?.message ?? 'Unexpected error' }, { status: 500 });
  }
}
