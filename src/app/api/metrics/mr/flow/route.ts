// src/app/api/metrics/mr/flow/route.ts
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type Link = { source: string; target: string; opened: number; merged: number; closed: number };

type Overview = {
  mode: 'overview';
  window: '7d' | '30d';
  target_branch: string | null;
  since: string;
  families: string[];
  targets: string[];
  matrix: Array<{ family: string; target: string; count: number }>;
  topRoutes: Array<{ family: string; target: string; count: number }>;
};

type Drill = {
  mode: 'drill';
  window: '7d' | '30d';
  target_branch: string;
  since: string;
  nodes: string[];
  links: Link[];
};

function json(data: any, status = 200, headers: Record<string, string> = {}) {
  return new NextResponse(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });
}

function branchFamily(branch: string): string {
  if (!branch) return 'other/*';
  if (branch.startsWith('feature/')) return 'feature/*';
  if (branch.startsWith('bugfix/')) return 'bugfix/*';
  if (branch.startsWith('hotfix/')) return 'hotfix/*';
  if (branch.startsWith('release/')) return 'release/*';
  if (branch === 'develop' || branch === 'main') return branch;
  return 'other/*';
}

async function fetchUpstreamJSON(u: URL, req: NextRequest) {
  // Forward auth cookie so upstream API recognizes the session
  const headers = new Headers();
  const cookie = req.headers.get('cookie');
  if (cookie) headers.set('cookie', cookie);

  const resp = await fetch(u.toString(), { headers, cache: 'no-store', redirect: 'manual' });
  const text = await resp.text();

  if (!resp.ok) {
    return { ok: false, status: resp.status, error: text.slice(0, 600) };
  }
  try {
    return { ok: true as const, data: JSON.parse(text) };
  } catch {
    // Upstream returned HTML (e.g., 302 → HTML) or some non-JSON
    return {
      ok: false,
      status: 502,
      error: `Upstream ${u.pathname} returned non-JSON`,
      detail: text.slice(0, 600),
    };
  }
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);

    const windowK = (url.searchParams.get('window') ?? '30d').toLowerCase() as '7d' | '30d';
    const days = windowK === '7d' ? 7 : 30;
    const since = new Date(Date.now() - days * 86_400_000).toISOString();

    // If provided, we’ll drill into one target; otherwise we return the grouped overview.
    const target = url.searchParams.get('target_branch') || url.searchParams.get('target');
    const overviewMode = !target;

    // Build upstream list URL and **forward project identifiers**
    const listUrl = new URL('/api/gitlab/merge-requests', url.origin);
    listUrl.searchParams.set('state', 'all');
    listUrl.searchParams.set('updated_after', since);
    listUrl.searchParams.set('perPage', '200'); // enough for overview window
    listUrl.searchParams.set('page', '1');

    for (const k of ['projectId', 'activeProjectId']) {
      const v = url.searchParams.get(k);
      if (v) listUrl.searchParams.set(k, v);
    }

    const upstream = await fetchUpstreamJSON(listUrl, req);
    if (!upstream.ok) {
      // Return JSON **not** HTML so the client never tries to parse HTML
      const { status, error, detail } = upstream as any;
      return json({ error, detail, hint: 'Check auth cookies and activeProjectId' }, status || 502);
    }

    const items = Array.isArray((upstream as any).data) ? (upstream as any).data : [];

    // Build raw links
    const rawLinks: Link[] = [];
    for (const m of items) {
      const s = m?.source_branch;
      const t = m?.target_branch;
      if (!s || !t) continue;
      rawLinks.push({
        source: s,
        target: t,
        opened: 1,
        merged: m?.state === 'merged' ? 1 : 0,
        closed: m?.state === 'closed' ? 1 : 0,
      });
    }

    if (overviewMode) {
      // Group by source family → exact target
      const matrixMap = new Map<string, number>(); // key: fam→target
      for (const l of rawLinks) {
        const fam = branchFamily(l.source);
        const key = `${fam}→${l.target}`;
        matrixMap.set(key, (matrixMap.get(key) ?? 0) + 1);
      }

      const matrix: Overview['matrix'] = [];
      matrixMap.forEach((count, key) => {
        const [fam, t] = key.split('→');
        matrix.push({ family: fam, target: t, count });
      });

      // Top routes
      const topRoutes = [...matrix].sort((a, b) => b.count - a.count).slice(0, 12);

      const families = Array.from(new Set(matrix.map((m) => m.family)));
      const targets = Array.from(new Set(matrix.map((m) => m.target)));

      const overview: Overview = {
        mode: 'overview',
        window: windowK,
        target_branch: null,
        since,
        families,
        targets,
        matrix,
        topRoutes,
      };

      return json(overview, 200, {
        // Small cache on the edge; client still no-store by default
        'cache-control': 'public, s-maxage=60, stale-while-revalidate=120',
      });
    }

    // Drill: only links into the requested target
    const targetBranch = target!;
    const linkMap = new Map<string, Link>();
    for (const l of rawLinks) {
      if (l.target !== targetBranch) continue;
      const key = `${l.source}→${l.target}`;
      const ex = linkMap.get(key);
      if (!ex) linkMap.set(key, { ...l });
      else {
        ex.opened += l.opened;
        ex.merged += l.merged;
        ex.closed += l.closed;
      }
    }

    const links = Array.from(linkMap.values());
    const nodes = Array.from(new Set(links.flatMap((l) => [l.source, l.target])));

    const drill: Drill = {
      mode: 'drill',
      window: windowK,
      target_branch: targetBranch,
      since,
      nodes,
      links,
    };

    return json(drill, 200, {
      'cache-control': 'public, s-maxage=60, stale-while-revalidate=120',
    });
  } catch (e: any) {
    return json({ error: e?.message || 'Unexpected error in flow route' }, 500);
  }
}
