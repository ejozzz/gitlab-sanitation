// src/app/api/compare-wizard/branches/route.ts
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

  // Try Mongo _id first (ObjectId), then GitLab projectId field
  let byMongo: any = null;
  try {
    byMongo = await col.findOne({ _id: new ObjectId(projectIdParam), userid: userId });
  } catch {
    // not an ObjectId; ignore
  }
  if (byMongo) return byMongo;

  const byGitLabId = await col.findOne({ projectId: projectIdParam, userid: userId });
  if (byGitLabId) return byGitLabId;

  // Sometimes projectId is numeric in DB; try numeric coercion
  const n = Number(projectIdParam);
  if (!Number.isNaN(n)) {
    const byNumeric = await col.findOne({ projectId: n, userid: userId });
    if (byNumeric) return byNumeric;
  }

  return null;
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const sp = url.searchParams;

    const projectIdParam = (sp.get('projectId') ?? '').trim();
    const search = (sp.get('search') ?? '').trim();
    const perPage = Math.min(100, Math.max(1, parseInt(sp.get('perPage') ?? '100', 10) || 100));

    if (!projectIdParam) {
      return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
    }

    const uid = await requireUserId();
    if (!uid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const proj = await loadProjectForUser(uid, projectIdParam);
    if (!proj) {
      return NextResponse.json({ error: `Project ${projectIdParam} not found` }, { status: 404 });
    }

    const host = deriveHost(proj);
    const pid = proj.projectId ?? proj.projectid ?? proj.id;
    const enc = proj.token; // { ciphertext, nonce, tag }
    if (!host || !pid || !enc?.ciphertext || !enc?.nonce || !enc?.tag) {
      return NextResponse.json({ error: 'Invalid project config' }, { status: 400 });
    }

    const token = decryptToken(enc.ciphertext, enc.nonce, enc.tag);

    // ---- GitLab branches (parallel safe; one request here)
    const gl = new URL(`${host}/api/v4/projects/${encodeURIComponent(String(pid))}/repository/branches`);
    gl.searchParams.set('per_page', String(perPage));
    if (search) gl.searchParams.set('search', search);

    const r = await fetch(gl.toString(), {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      cache: 'no-store',
    });

    const ct = r.headers.get('content-type') || '';
    if (!r.ok) {
      const msg = ct.includes('application/json') ? await r.json().catch(() => ({})) : await r.text().catch(() => '');
      return NextResponse.json({ error: `GitLab ${r.status}`, details: msg }, { status: r.status });
    }
    if (!ct.toLowerCase().includes('application/json')) {
      const text = await r.text();
      return NextResponse.json({ error: 'GitLab non-JSON', hint: text.slice(0, 200) }, { status: 502 });
    }

    const branches = await r.json();
    // Your Step 2 expects either [] or {branches:[]}; keep it simple as array
    return NextResponse.json(Array.isArray(branches) ? branches : (branches?.branches ?? []));
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Server error' }, { status: 500 });
  }
}
