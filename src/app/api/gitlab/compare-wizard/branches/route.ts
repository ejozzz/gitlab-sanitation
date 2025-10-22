// src/app/api/compare-wizard/branches/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { decryptToken } from '@/lib/config.server';

export const dynamic = 'force-dynamic';

function forwardHeadersFrom(req: NextRequest): HeadersInit {
  // Forward typical auth/session headers so /api/projects sees the same user
  const h = new Headers();
  const pass = [
    'cookie',
    'authorization',
    'x-csrf-token',
    'x-xsrf-token',
    'x-forwarded-for',
    'x-forwarded-host',
    'x-forwarded-proto',
    'user-agent',
    'accept',
    'accept-language',
  ];
  for (const k of pass) {
    const v = req.headers.get(k);
    if (v) h.set(k, v);
  }
  // Prevent middleware from treating this as a browser page request
  h.set('accept', 'application/json, */*;q=0.1');
  return h;
}

async function getProjectById(origin: string, req: NextRequest, projectId: string) {
  const headers = forwardHeadersFrom(req);

  // Try filtered fetch
  const filteredUrl = new URL('/api/projects', origin);
  filteredUrl.searchParams.set('projectId', projectId);

  let resp = await fetch(filteredUrl.toString(), {
    cache: 'no-store',
    headers,
    // Capture redirects instead of following them to an HTML login page
    redirect: 'manual',
    next: { revalidate: 0 },
  });

  // If we got redirected, it's almost certainly auth middleware
  if (resp.status >= 300 && resp.status < 400) {
    const loc = resp.headers.get('location') || '';
    return { error: `Auth redirect ${resp.status} to ${loc} when calling /api/projects` };
  }

  let ct = resp.headers.get('content-type') || '';
  if (!ct.toLowerCase().includes('application/json')) {
    // Some middleware returned HTML; try unfiltered list as a fallback
    const allUrl = new URL('/api/projects', origin);
    resp = await fetch(allUrl.toString(), {
      cache: 'no-store',
      headers,
      redirect: 'manual',
      next: { revalidate: 0 },
    });

    if (resp.status >= 300 && resp.status < 400) {
      const loc = resp.headers.get('location') || '';
      return { error: `Auth redirect ${resp.status} to ${loc} when calling /api/projects (list)` };
    }

    ct = resp.headers.get('content-type') || '';
    if (!ct.toLowerCase().includes('application/json')) {
      const text = await resp.text();
      return { error: `Projects endpoint did not return JSON (status ${resp.status}). First 200 chars:\n${text.slice(0, 200)}` };
    }

    const arr = await resp.json();
    const proj = Array.isArray(arr)
      ? arr.find((p: any) => {
          const candidates = [p.projectId, p.id, p._id].map((v) => (v == null ? '' : String(v)));
          return candidates.includes(projectId);
        })
      : null;

    if (!proj) return { error: `Project ${projectId} not found in list` };
    return { project: proj };
  }

  // JSON (filtered)
  const body = await resp.json();
  const project = Array.isArray(body) ? body[0] : body;
  if (!project) return { error: `Project ${projectId} not found` };
  return { project };
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const sp = url.searchParams;

    const search = (sp.get('search') ?? '').trim();
    const perPage = Math.min(100, Math.max(1, parseInt(sp.get('perPage') ?? '100', 10) || 100));
    const projectId = (sp.get('projectId') ?? '').trim();
    if (!projectId) return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });

    // ---- Lookup project with full header forwarding
    const { project, error } = await getProjectById(url.origin, req, projectId);
    if (error) return NextResponse.json({ error }, { status: 401 });

    const token = decryptToken(project?.gitlabToken ?? project?.token ?? '');
    const host = project?.gitlabHost ?? process.env.GITLAB_HOST;
    if (!token || !host) {
      return NextResponse.json({ error: 'Project token/host missing' }, { status: 400 });
    }

    // ---- Call GitLab for branches
    const gl = new URL(`/api/v4/projects/${encodeURIComponent(projectId)}/repository/branches`, host);
    if (search) gl.searchParams.set('search', search);
    gl.searchParams.set('per_page', String(perPage));

    const r = await fetch(gl.toString(), {
      headers: { 'PRIVATE-TOKEN': token },
      cache: 'no-store',
      redirect: 'manual',
    });

    const glCT = r.headers.get('content-type') || '';
    if (!gl.ok) {
      const msg = glCT.includes('application/json') ? await r.json().catch(() => ({})) : await r.text().catch(() => '');
      return NextResponse.json({ error: `GitLab error ${r.status}`, details: msg }, { status: r.status });
    }
    if (!glCT.toLowerCase().includes('application/json')) {
      const text = await r.text();
      return NextResponse.json(
        { error: `GitLab returned non-JSON (status ${r.status})`, hint: text.slice(0, 200) },
        { status: r.status }
      );
    }

    const branches = await r.json();
    return NextResponse.json(Array.isArray(branches) ? branches : { branches });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Server error' }, { status: 500 });
  }
}
