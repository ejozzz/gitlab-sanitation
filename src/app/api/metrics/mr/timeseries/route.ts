// src/app/api/metrics/mr/timeseries/route.ts
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type DayBucket = { date: string; opened: number; merged: number; closed: number };

// normalize a timestamp into a UTC date string YYYY-MM-DD
function dayKey(ts?: string | null) {
  if (!ts) return null;
  const d = new Date(ts);
  if (isNaN(d.getTime())) return null;
  const yr = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const da = String(d.getUTCDate()).padStart(2, '0');
  return `${yr}-${mo}-${da}`;
}

async function fetchList(url: URL, req: NextRequest) {
  const headers = new Headers();
  const cookie = req.headers.get('cookie');
  if (cookie) headers.set('cookie', cookie);
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
    const windowK = (url.searchParams.get('window') ?? '30d').toLowerCase() as '7d' | '30d';
    const days = windowK === '7d' ? 7 : 30;
    const targetBranch = url.searchParams.get('target_branch') ?? url.searchParams.get('target') ?? '';

    const since = new Date(Date.now() - days * 86_400_000);
    const sinceISO = since.toISOString();

    // Build a single "state=all" query (bigger page for better accuracy)
    const listUrl = new URL('/api/gitlab/merge-requests', url.origin);
    listUrl.searchParams.set('state', 'all');
    listUrl.searchParams.set('perPage', '100');
    listUrl.searchParams.set('page', '1');
    listUrl.searchParams.set('updated_after', sinceISO);
    if (targetBranch) listUrl.searchParams.set('target_branch', targetBranch);

    // pass through project context if provided
    for (const k of ['projectId', 'activeProjectId']) {
      const v = url.searchParams.get(k);
      if (v) listUrl.searchParams.set(k, v);
    }

    const res = await fetchList(listUrl, req);
    if (!res.ok) {
      return NextResponse.json({ error: res.error || 'List route error' }, { status: res.status || 500 });
    }

    const items = (res as any).data as any[];

    // Seed all days in the window to 0 for smooth charts
    const buckets = new Map<string, DayBucket>();
    for (let i = 0; i < days; i++) {
      const d = new Date(since.getTime() + i * 86_400_000);
      const key = dayKey(d.toISOString())!;
      buckets.set(key, { date: key, opened: 0, merged: 0, closed: 0 });
    }

    // Count events per day
    for (const m of items) {
      const created = dayKey(m?.created_at);
      const merged = dayKey(m?.merged_at);
      const closed = dayKey(m?.closed_at);

      if (created && buckets.has(created)) buckets.get(created)!.opened++;
      if (merged && buckets.has(merged)) buckets.get(merged)!.merged++;
      if (closed && buckets.has(closed)) buckets.get(closed)!.closed++;
    }

    // Return days sorted ascending
    const series = Array.from(buckets.values()).sort((a, b) => (a.date < b.date ? -1 : 1));
    return NextResponse.json({ window: windowK, target_branch: targetBranch || null, since: sinceISO, series });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unexpected error' }, { status: e?.status || 500 });
  }
}
