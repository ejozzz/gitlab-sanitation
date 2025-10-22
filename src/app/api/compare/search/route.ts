import { NextRequest, NextResponse } from 'next/server';
import { decryptToken } from '@/lib/config.server';

export const dynamic = 'force-dynamic';

// load all projects; handle array or {projects:[...]}
async function loadProjects(origin: string, cookie: string) {
  const r = await fetch(new URL('/api/projects', origin).toString(), {
    headers: cookie ? { cookie } : undefined,
    cache: 'no-store',
  });
  if (!r.ok) throw new Error('Unable to load projects');
  const j = await r.json();
  return Array.isArray(j) ? j : (j?.projects ?? []);
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const origin = url.origin;
    const cookie = req.headers.get('cookie') ?? '';

    const q = (url.searchParams.get('q') ?? '').trim();
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') ?? '50', 10) || 50));
    const projectIds = url.searchParams.getAll('projectId')
      .map(s => s.trim()).filter(Boolean);

    if (q.length < 2 || projectIds.length === 0) {
      return NextResponse.json({ results: [] });
    }

    const all = await loadProjects(origin, cookie);
    const byId: Record<string, any> = {};
    for (const p of all) {
      const key = String(p?.projectId ?? '').trim();
      if (key) byId[key] = p;
    }

    const results = await Promise.all(projectIds.map(async (pidStr) => {
      const p = byId[pidStr];
      if (!p) return { projectId: Number.isFinite(Number(pidStr)) ? Number(pidStr) : pidStr, branches: [], mrs: [] };

      // host + token (handle both shapes)
      let host = (p.gitlabHost || p.gitlab_url || '').toString().replace(/\/+$/, '');
      if (host.includes('/api/v4/projects/')) host = host.split('/api/v4/projects/')[0];
      const token = decryptToken(p.gitlabToken ?? p.token);

      // GitLab branch search
      const api = `${host}/api/v4/projects/${encodeURIComponent(pidStr)}/repository/branches?search=${encodeURIComponent(q)}&per_page=${limit}`;
      const r = await fetch(api, { headers: { 'PRIVATE-TOKEN': token }, cache: 'no-store' });
      const arr = r.ok ? await r.json() : [];

      const branches = (Array.isArray(arr) ? arr : []).map((b: any) => ({
        name: b?.name ?? b?.branch ?? '',
        web_url: b?.web_url,
      })).filter((b: any) => !!b.name);

      return {
        projectId: Number.isFinite(Number(pidStr)) ? Number(pidStr) : pidStr,
        branches,
        mrs: [], // not needed for this wizard; keep field for back-compat
      };
    }));

    return NextResponse.json({ results });
  } catch (e: any) {
    return NextResponse.json({ results: [], error: e?.message ?? 'search failed' }, { status: 200 });
  }
}
