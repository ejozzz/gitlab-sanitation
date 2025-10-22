// src/app/api/gitlab/merge-requests/[iid]/detail/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getGitLabClientOrFail, handleApiError } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';

// --- config extractors (same as before) -----------------------
function getDeep(o: any, path: string): any {
  return path.split('.').reduce((acc, k) => (acc && acc[k] !== undefined ? acc[k] : undefined), o);
}
function firstDef(o: any, keys: string[]) {
  for (const k of keys) {
    const v = k.includes('.') ? getDeep(o, k) : (o ? o[k] : undefined);
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}
function extractConfig(client: any) {
  const host = firstDef(client, [
    'host', 'gitlabHost', 'gitlab_host', '_host',
    'baseUrl', 'baseURL', 'apiBase',
    'config.host', 'config.gitlabHost', 'config.baseUrl', 'config.apiBase',
  ]);
  const token = firstDef(client, [
    'token', 'accessToken', 'privateToken', 'apiToken', '_token',
    'config.token', 'config.accessToken', 'config.privateToken', 'config.apiToken',
  ]);
  const projectId = firstDef(client, [
    'projectId', 'project_id', '_projectId',
    'config.projectId', 'config.project_id', 'config._projectId',
  ]);
  if (!host || !token || projectId == null) {
    const msg = `GitLab client missing config. host=${!!host}, token=${!!token}, projectId=${projectId}`;
    const e: any = new Error(msg);
    e.status = 500;
    throw e;
  }
  return { host: String(host), token: String(token), projectId: String(projectId) };
}

async function gitlabGET(host: string, token: string, path: string, query: Record<string, string> = {}) {
  const base = host.startsWith('http') ? host : `https://${host}`;
  const url = new URL(`/api/v4${path}`, base);
  Object.entries(query).forEach(([k, v]) => url.searchParams.set(k, v));

  const r1 = await fetch(url.toString(), {
    headers: { 'PRIVATE-TOKEN': token },
    cache: 'no-store',
    redirect: 'manual',
  });
  const r = (r1.status === 401 || r1.status === 403)
    ? await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', redirect: 'manual' })
    : r1;

  const text = await r.text();
  const ct = r.headers.get('content-type') || '';
  if (!r.ok) {
    return NextResponse.json({ error: `GitLab MR detail failed (${r.status}): ${text.slice(0, 600)}` }, { status: r.status });
  }
  if (!ct.includes('application/json')) {
    return NextResponse.json({ error: 'Invalid content-type from GitLab (expected JSON)' }, { status: 502 });
  }
  try {
    const data = JSON.parse(text);
    return data;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON from GitLab' }, { status: 502 });
  }
}

// NOTE: In Next.js 15, params is async; declare as Promise<...> and await it.
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ iid: string }> }
) {
  try {
    const { iid: iidStr } = await ctx.params; // <-- await params
    const iid = Number(iidStr);
    if (!Number.isFinite(iid)) {
      return NextResponse.json({ error: 'Invalid MR IID' }, { status: 400 });
    }

    const client = await getGitLabClientOrFail(req);
    const { host, token, projectId } = extractConfig(client);
    const base = `/projects/${encodeURIComponent(projectId)}/merge_requests/${iid}`;

    // Parallelize subcalls
    const [mrRes, commitsRes, approvalsRes, pipelinesRes, discussionsRes] = await Promise.all([
      gitlabGET(host, token, `${base}`),
      gitlabGET(host, token, `${base}/commits`, { per_page: '100' }),
      gitlabGET(host, token, `${base}/approvals`),
      gitlabGET(host, token, `${base}/pipelines`, { per_page: '3' }),
      gitlabGET(host, token, `${base}/discussions`, { per_page: '100' }),
    ]);

    // If any call returned a NextResponse error, bubble it up
    const asResp = (...xs: any[]) => xs.find((x) => x && typeof x.headers === 'object' && typeof x.json === 'function');
    const early = asResp(mrRes, commitsRes, approvalsRes, pipelinesRes, discussionsRes);
    if (early) return early as any;

    const approvalsRaw = approvalsRes as any;
    const discussionsRaw = discussionsRes as any;

    const approvals = approvalsRaw
      ? {
          required: approvalsRaw?.approvals_required ?? 0,
          approved: approvalsRaw?.approved_by?.length ?? 0,
          remaining: Math.max(0, (approvalsRaw?.approvals_required ?? 0) - (approvalsRaw?.approved_by?.length ?? 0)),
          approved_by: approvalsRaw?.approved_by ?? [],
        }
      : null;

    const discussions = Array.isArray(discussionsRaw)
      ? {
          total: discussionsRaw.length,
          unresolved: discussionsRaw.reduce(
            (acc: number, d: any) => acc + (d?.notes?.some((n: any) => n?.resolvable && !n?.resolved) ? 1 : 0),
            0
          ),
        }
      : { total: 0, unresolved: 0 };

    return NextResponse.json({
      mr: mrRes,
      commits: commitsRes,
      approvals,
      pipelines: Array.isArray(pipelinesRes) ? (pipelinesRes as any[]).slice(0, 3) : [],
      discussions,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
