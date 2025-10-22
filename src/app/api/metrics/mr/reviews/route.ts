// src/app/api/metrics/mr/reviews/route.ts
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type Leader = { reviewer: string; count: number };
type MatrixCell = { author: string; reviewer: string; count: number };

async function fetchJSON(u: URL, req: NextRequest) {
  const headers = new Headers();
  const cookie = req.headers.get('cookie');
  if (cookie) headers.set('cookie', cookie);
  const r = await fetch(u.toString(), { headers, cache: 'no-store', redirect: 'manual' });
  const text = await r.text();
  if (!r.ok) return { ok: false, status: r.status, error: text.slice(0, 600) };
  try {
    return { ok: true as const, data: JSON.parse(text) };
  } catch {
    return { ok: false, status: 502, error: 'Invalid JSON' };
  }
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const windowK = (url.searchParams.get('window') ?? '30d').toLowerCase() as '7d' | '30d';
    const days = windowK === '7d' ? 7 : 30;
    const targetBranch = url.searchParams.get('target_branch') ?? url.searchParams.get('target') ?? '';
    const cap = Math.max(10, Math.min(60, Number(url.searchParams.get('cap') ?? '60'))); // max MRs to inspect

    const since = new Date(Date.now() - days * 86_400_000).toISOString();

    // 1) get recent MRs
    const listUrl = new URL('/api/gitlab/merge-requests', url.origin);
    listUrl.searchParams.set('state', 'all');
    listUrl.searchParams.set('perPage', String(cap));
    listUrl.searchParams.set('page', '1');
    listUrl.searchParams.set('updated_after', since);
    if (targetBranch) listUrl.searchParams.set('target_branch', targetBranch);
    for (const k of ['projectId', 'activeProjectId']) {
      const v = url.searchParams.get(k);
      if (v) listUrl.searchParams.set(k, v);
    }

    const listRes = await fetchJSON(listUrl, req);
    if (!listRes.ok) return NextResponse.json({ error: listRes.error }, { status: listRes.status || 500 });
    const items: any[] = Array.isArray((listRes as any).data) ? (listRes as any).data : [];

    // 2) fetch approvals in parallel with a concurrency cap
    const iidList = items.slice(0, cap).map((m: any) => m?.iid).filter((x) => x != null);
    const detailURL = (iid: number) => {
      const u = new URL(`/api/gitlab/merge-requests/${iid}/detail`, url.origin);
      for (const k of ['projectId', 'activeProjectId']) {
        const v = url.searchParams.get(k);
        if (v) u.searchParams.set(k, v);
      }
      return u;
    };

    const CONCURRENCY = 6;
    const detailResults: any[] = [];
    for (let i = 0; i < iidList.length; i += CONCURRENCY) {
      const chunk = iidList.slice(i, i + CONCURRENCY);
      const part = await Promise.all(chunk.map(async (iid) => {
        const res = await fetchJSON(detailURL(iid), req);
        return res.ok ? (res as any).data : null;
      }));
      detailResults.push(...part);
    }

    // 3) aggregate approvals
    const leaderMap = new Map<string, number>();
    const matrixMap = new Map<string, number>();
    const authors = new Set<string>();
    const reviewers = new Set<string>();

    for (const d of detailResults) {
      if (!d?.approvals) continue;
      const author = d?.mr?.author?.username || d?.mr?.author?.name || 'unknown';
      authors.add(author);
      const arr = Array.isArray(d.approvals?.approved_by) ? d.approvals.approved_by : [];
      for (const r of arr) {
        const name = r?.user?.username || r?.user?.name || 'unknown';
        reviewers.add(name);
        leaderMap.set(name, (leaderMap.get(name) || 0) + 1);
        const key = `${author}→${name}`;
        matrixMap.set(key, (matrixMap.get(key) || 0) + 1);
      }
    }

    const leaderboard: Leader[] = Array.from(leaderMap.entries())
      .map(([reviewer, count]) => ({ reviewer, count }))
      .sort((a, b) => b.count - a.count);

    const matrix: MatrixCell[] = Array.from(matrixMap.entries()).map(([k, count]) => {
      const [author, reviewer] = k.split('→');
      return { author, reviewer, count };
    });

    return NextResponse.json({
      window: windowK,
      target_branch: targetBranch || null,
      since,
      total_inspected: iidList.length,
      leaderboard,
      authors: Array.from(authors),
      reviewers: Array.from(reviewers),
      matrix,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unexpected error' }, { status: e?.status || 500 });
  }
}
