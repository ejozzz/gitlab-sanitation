// src/app/api/metrics/mr/summary/route.ts
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// How many days make an MR "stale" in metrics
const STALE_WARNING_DAYS = 3;

async function fetchListJSON(url: URL, req: NextRequest) {
  const headers = new Headers();
  const cookie = req.headers.get('cookie');
  if (cookie) headers.set('cookie', cookie); // forward session to our own route

  const r = await fetch(url.toString(), { headers, cache: 'no-store', redirect: 'manual' });
  const text = await r.text();
  if (!r.ok) return { ok: false, status: r.status, error: text.slice(0, 600) };

  try {
    const data = JSON.parse(text);
    return { ok: true as const, data: Array.isArray(data) ? data : [] };
  } catch {
    return { ok: false, status: 502, error: 'Invalid JSON from list route' };
  }
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const windowK = (url.searchParams.get('window') ?? '7d').toLowerCase() as '7d'|'30d';
    const days = windowK === '30d' ? 30 : 7;

    const targetBranch = url.searchParams.get('target_branch') ?? url.searchParams.get('target') ?? '';

    const sinceISO = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    // Helper to hit our list route with consistent params
    const makeListURL = (state: 'opened'|'merged'|'closed') => {
      const u = new URL('/api/gitlab/merge-requests', url.origin);
      u.searchParams.set('state', state);
      u.searchParams.set('perPage', '50');
      u.searchParams.set('page', '1');
      u.searchParams.set('updated_after', sinceISO);
      if (targetBranch) u.searchParams.set('target_branch', targetBranch);
      // pass through project context if caller provided (not required, but safe)
      for (const k of ['projectId', 'activeProjectId']) {
        const v = url.searchParams.get(k);
        if (v) u.searchParams.set(k, v);
      }
      return u;
    };

    // Fetch 3 lists: opened, merged, closed (first page only; fast + good for KPIs)
    const [openedRes, mergedRes, closedRes] = await Promise.all([
      fetchListJSON(makeListURL('opened'), req),
      fetchListJSON(makeListURL('merged'), req),
      fetchListJSON(makeListURL('closed'), req),
    ]);

    for (const res of [openedRes, mergedRes, closedRes]) {
      if (!res.ok) {
        return NextResponse.json({ error: res.error || 'List route error' }, { status: res.status || 500 });
      }
    }

    const opened = (openedRes as any).data as any[];
    const merged = (mergedRes as any).data as any[];
    const closed = (closedRes as any).data as any[];

    const drafts = opened.filter(m => m?.draft).length;

    const stale_open = opened.filter(m => {
      const t = m?.updated_at || m?.created_at;
      if (!t) return false;
      const ageDays = (Date.now() - Date.parse(t)) / 86_400_000;
      return ageDays >= STALE_WARNING_DAYS;
    }).length;

    const ttmHours = merged
      .filter(m => m?.created_at && m?.merged_at)
      .map(m => (Date.parse(m.merged_at) - Date.parse(m.created_at)) / 3_600_000)
      .filter(n => Number.isFinite(n) && n >= 0);

    const avg_time_to_merge_hours = ttmHours.length
      ? Number((ttmHours.reduce((a, b) => a + b, 0) / ttmHours.length).toFixed(1))
      : 0;

    return NextResponse.json({
      window: windowK,
      opened: opened.length,
      merged: merged.length,
      closed: closed.length,
      drafts,
      stale_open,
      avg_time_to_merge_hours,
      since: sinceISO,
      target_branch: targetBranch || null,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unexpected error' }, { status: e?.status || 500 });
  }
}
