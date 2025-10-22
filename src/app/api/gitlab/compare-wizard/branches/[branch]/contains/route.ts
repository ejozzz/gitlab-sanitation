// src/app/api/compare-wizard/branches/[branch]/contains/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { decryptToken } from '@/lib/config.server';

export const dynamic = 'force-dynamic';

function forwardHeadersFrom(req: NextRequest): HeadersInit {
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
  h.set('accept', 'application/json, */*;q=0.1');
  return h;
}

async function getProjectById(origin: string, req: NextRequest, projectId: string) {
  const headers = forwardHeadersFrom(req);

  const filteredUrl = new URL('/api/projects', origin);
  filteredUrl.searchParams.set('projectId', projectId);

  let resp = await fetch(filteredUrl.toString(), {
    cache: 'no-store',
    headers,
    redirect: 'manual',
    next: { revalidate: 0 },
  });

  if (resp.status >= 300 && resp.status < 400) {
    const loc = resp.headers.get('location') || '';
    return { error: `Auth redirect ${resp.status} to ${loc} when calling /api/projects` };
  }

  let ct = resp.headers.get('content-type') || '';
  if (!ct.toLowerCase().includes('application/json')) {
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

  const body = await resp.json();
  const project = Array.isArray(body) ? body[0] : body;
  if (!project) return { error: `Project ${projectId} not found` };
  return { project };
}

export async function POST(req: NextRequest, { params }: { params: { branch: string } }) {
  try {
    const url = new URL(req.url);
    const sp = url.searchParams;

    const branch = decodeURIComponent(params.branch ?? '').trim();
    const projectId = (sp.get('projectId') ?? '').trim();
    if (!projectId) return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
    if (!branch) return NextResponse.json({ error: 'Missing branch' }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const targets: string[] = Array.isArray(body?.targets) ? body.targets : [];
    if (!targets.length) return NextResponse.json({ error: 'Missing targets' }, { status: 400 });

    const { project, error } = await getProjectById(url.origin, req, projectId);
    if (error) return NextResponse.json({ error }, { status: 401 });

    const token = decryptToken(project?.gitlabToken ?? project?.token ?? '');
    const host = project?.gitlabHost ?? process.env.GITLAB_HOST;
    if (!token || !host) return NextResponse.json({ error: 'Project token/host missing' }, { status: 400 });

    const results = await Promise.all(
      targets.map(async (t) => {
        const compare = new URL(
          `/api/v4/projects/${encodeURIComponent(projectId)}/repository/compare`,
          host
        );
        compare.searchParams.set('from', t);
        compare.searchParams.set('to', branch);

        const r = await fetch(compare.toString(), {
          headers: { 'PRIVATE-TOKEN': token },
          cache: 'no-store',
          redirect: 'manual',
        });

        const glCT = r.headers.get('content-type') || '';
        if (!r.ok) {
          const msg = glCT.includes('application/json') ? await r.json().catch(() => ({})) : await r.text().catch(() => '');
          return { target: t, contains: false, commits: 0, details: { status: r.status, msg } };
        }
        if (!glCT.toLowerCase().includes('application/json')) {
          const text = await r.text();
          return { target: t, contains: false, commits: 0, details: { status: r.status, hint: text.slice(0, 120) } };
        }

        const payload = await r.json();
        const commits = Array.isArray(payload?.commits) ? payload.commits.length : 0;
        const contains = commits === 0;
        return { target: t, contains, commits };
      })
    );

    return NextResponse.json({ targets: results });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Server error' }, { status: 500 });
  }
}
