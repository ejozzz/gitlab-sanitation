// src/app/api/compare-wizard/branches/[branch]/contains/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { Projects } from '@/lib/db';
import { validateSession } from '@/lib/auth';
import { SESSION_COOKIE } from '@/lib/config.shared';
import { cookies } from 'next/headers';
import { decryptToken } from '@/lib/config.server';

export const dynamic = 'force-dynamic';

function deriveHost(doc: any): string | null {
  const h = doc?.gitlabHost ?? doc?.gitlabhost ?? null;
  if (h) return String(h).replace(/\/+$/, '');
  const url: string | undefined = doc?.gitlab_url;
  if (url && url.includes('/api/v4/projects/')) {
    return url.split('/api/v4/projects/')[0].replace(/\/+$/, '');
  }
  return null;
}

async function requireUserId(): Promise<ObjectId | null> {
  const store = await cookies();
  const sid = store.get(SESSION_COOKIE)?.value;
  if (!sid) return null;
  const s = await validateSession(sid);
  if (!s?.userId) return null;
  return s.userId instanceof ObjectId ? s.userId : new ObjectId(String(s.userId));
}

async function loadProjectForUser(userId: ObjectId, projectIdParam: string) {
  const col = await Projects();

  let byMongo: any = null;
  try { byMongo = await col.findOne({ _id: new ObjectId(projectIdParam), userid: userId }); } catch {}
  if (byMongo) return byMongo;

  const byGitLabId = await col.findOne({ projectId: projectIdParam, userid: userId });
  if (byGitLabId) return byGitLabId;

  const n = Number(projectIdParam);
  if (!Number.isNaN(n)) {
    const byNumeric = await col.findOne({ projectId: n, userid: userId });
    if (byNumeric) return byNumeric;
  }
  return null;
}

/** Evidence term heuristic — copy of the page logic */
function deriveEvidenceTerm(featureBranch: string): string {
  const numeric = featureBranch.match(/(\d{4,})/);
  if (numeric?.[1]) return numeric[1];
  const lastSeg = featureBranch.split('/').pop();
  return lastSeg && lastSeg.trim().length > 0 ? lastSeg : featureBranch;
}

async function glJSON(url: string, token: string, init?: RequestInit) {
  const h = new Headers(init?.headers || {});
  h.set('Authorization', `Bearer ${token}`);
  h.set('Accept', 'application/json');
  const r = await fetch(url, { ...init, headers: h, cache: 'no-store' });
  const ct = r.headers.get('content-type') || '';
  if (!ct.toLowerCase().includes('application/json')) {
    const text = await r.text();
    return { ok: false, status: r.status, error: `non-JSON`, hint: text.slice(0, 200) };
  }
  if (!r.ok) {
    let body: any = {};
    try { body = await r.json(); } catch {}
    return { ok: false, status: r.status, error: body || {} };
  }
  const data = await r.json();
  return { ok: true, status: r.status, data };
}

export async function POST(req: NextRequest, { params }: { params: { branch: string } }) {
  try {
    const url = new URL(req.url);
    const sp = url.searchParams;

    const projectIdParam = (sp.get('projectId') ?? '').trim();
    const featureBranch = decodeURIComponent(params.branch ?? '').trim();
    if (!projectIdParam) return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
    if (!featureBranch) return NextResponse.json({ error: 'Missing branch' }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const targets: string[] = Array.isArray(body?.targets) ? body.targets : [];
    if (!targets.length) return NextResponse.json({ error: 'Missing targets' }, { status: 400 });

    const uid = await requireUserId();
    if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const proj = await loadProjectForUser(uid, projectIdParam);
    if (!proj) return NextResponse.json({ error: `Project ${projectIdParam} not found` }, { status: 404 });

    const host = deriveHost(proj);
    const pid = proj.projectId ?? proj.projectid ?? proj.id;
    const enc = proj.token; // { ciphertext, nonce, tag }
    if (!host || !pid || !enc?.ciphertext || !enc?.nonce || !enc?.tag) {
      return NextResponse.json({ error: 'Invalid project config' }, { status: 400 });
    }
    const token = decryptToken(enc.ciphertext, enc.nonce, enc.tag);

    const evidence = deriveEvidenceTerm(featureBranch);

    const results = await Promise.all(
      targets.map(async (t) => {
        // 1) Compare — if 0 commits, consider merged via 'compare'
        const cmpUrl = `${host}/api/v4/projects/${encodeURIComponent(String(pid))}/repository/compare?from=${encodeURIComponent(
          t
        )}&to=${encodeURIComponent(featureBranch)}`;

        const cmp = await glJSON(cmpUrl, token);
        if (!cmp.ok) {
          return {
            target: t,
            included: false,
            via: 'none' as const,
            missingCount: 0,
            web_url: `${host}/-/compare?from=${encodeURIComponent(t)}&to=${encodeURIComponent(featureBranch)}`,
          };
        }

        const commits = Array.isArray((cmp.data as any)?.commits) ? (cmp.data as any).commits : [];
        const missingCount = commits.length;
        if (missingCount === 0) {
          return {
            target: t,
            included: true,
            via: 'compare' as const,
            missingCount: 0,
            web_url: `${host}/-/compare?from=${encodeURIComponent(t)}&to=${encodeURIComponent(featureBranch)}`,
          };
        }

        // 2) Heuristic cherry-pick detection — search commits on target by evidence term
        // GitLab: GET /projects/:id/repository/commits?ref_name=<target>&search=<term>&per_page=5
        const searchUrl = `${host}/api/v4/projects/${encodeURIComponent(
          String(pid)
        )}/repository/commits?ref_name=${encodeURIComponent(t)}&search=${encodeURIComponent(evidence)}&per_page=5`;

        const search = await glJSON(searchUrl, token);
        if (search.ok && Array.isArray(search.data) && (search.data as any[]).length > 0) {
          return {
            target: t,
            included: true,
            via: 'search' as const,
            missingCount,
            missingSample: commits.slice(0, 3).map((c: any) => ({ id: c.id, short_id: c.short_id, title: c.title })),
            web_url: `${host}/-/compare?from=${encodeURIComponent(t)}&to=${encodeURIComponent(featureBranch)}`,
          };
        }

        return {
          target: t,
          included: false,
          via: 'none' as const,
          missingCount,
          missingSample: commits.slice(0, 3).map((c: any) => ({ id: c.id, short_id: c.short_id, title: c.title })),
          web_url: `${host}/-/compare?from=${encodeURIComponent(t)}&to=${encodeURIComponent(featureBranch)}`,
        };
      })
    );

    return NextResponse.json({
      branch: featureBranch,
      method: 'compare' as const,
      results,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Server error' }, { status: 500 });
  }
}
