// src/app/api/gitlab/cherry-picks/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';

type CherryRow = {
  commit_id: string;
  short_id: string;
  title: string;
  author_name?: string;
  committed_date?: string;
  web_url?: string;
  source_sha: string;
  evidence: string;
};

function detectCherryPicksFromCommits(commits: any[]): CherryRow[] {
  const rows: CherryRow[] = [];
  if (!Array.isArray(commits)) return rows;

  const patterns: RegExp[] = [
    /\(cherry\s*picked\s*from\s*commit\s*([0-9a-f]{7,40})\)/i,
    /cherry\s*[- ]?picked\s*from\s*commit\s*([0-9a-f]{7,40})/i,
    /cherry\s*[- ]?pick(?:ed)?\s*[:#]?\s*([0-9a-f]{7,40})/i,
  ];

  for (const c of commits) {
    const message: string = c?.message ?? c?.title ?? '';
    if (!message) continue;

    let sha: string | null = null;
    let snippet: string | null = null;

    for (const rx of patterns) {
      const m = message.match(rx);
      if (m) {
        sha = m[1];
        const idx = m.index ?? 0;
        snippet = message.substring(idx, Math.min(idx + 160, message.length));
        break;
      }
    }
    if (!sha) continue;

    rows.push({
      commit_id: c.id ?? c.sha ?? '',
      short_id: c.short_id ?? (c.id ? String(c.id).slice(0, 8) : ''),
      title: c.title ?? (message.split('\n')[0] || ''),
      author_name: c.author_name ?? c?.author_name,
      committed_date: c.committed_date ?? c.created_at ?? c.authored_date,
      web_url: c.web_url,
      source_sha: sha,
      evidence: snippet || '',
    });
  }

  return rows;
}

function safeJsonParse<T = any>(text: string): { ok: boolean; data?: T; error?: string } {
  try {
    return { ok: true, data: JSON.parse(text) as T };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Invalid JSON' };
  }
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const ref = (url.searchParams.get('ref') ?? '').trim();
    const page = url.searchParams.get('page') ?? '';
    const perPage = url.searchParams.get('perPage') ?? '';
    const projectId = url.searchParams.get('projectId');
    const activeProjectId = url.searchParams.get('activeProjectId');

    if (!ref) {
      const e: any = new Error('Missing ?ref=<branch>.');
      e.status = 400;
      throw e;
    }

    // Build inner URL to your commits endpoint
    const commitsUrl = new URL(`/api/gitlab/branches/${encodeURIComponent(ref)}/commits`, url.origin);
    if (page) commitsUrl.searchParams.set('page', page);
    if (perPage) commitsUrl.searchParams.set('perPage', perPage);
    if (projectId) commitsUrl.searchParams.set('projectId', projectId);
    if (activeProjectId) commitsUrl.searchParams.set('activeProjectId', activeProjectId);

    // 🔐 Forward caller's cookies/authorization so session-based logic works
    const fHeaders = new Headers();
    const cookie = req.headers.get('cookie');
    if (cookie) fHeaders.set('cookie', cookie);
    const authz = req.headers.get('authorization');
    if (authz) fHeaders.set('authorization', authz);
    // Avoid following redirects invisibly (e.g., to login HTML)
    const r = await fetch(commitsUrl.toString(), {
      headers: fHeaders,
      cache: 'no-store',
      redirect: 'manual',
    });

    // Always read as text first (could be HTML)
    const raw = await r.text();
    const contentType = r.headers.get('content-type') || '';

    if (!r.ok) {
      const parsed = contentType.includes('application/json') ? safeJsonParse<any>(raw) : { ok: false };
      const msg = parsed.ok
        ? (parsed.data?.error || JSON.stringify(parsed.data))
        : (raw?.slice(0, 600) || `HTTP ${r.status}`);
      const e: any = new Error(`Upstream /commits failed (${r.status}): ${msg}`);
      e.status = r.status;
      throw e;
    }

    // Success: parse JSON if it is JSON, otherwise fail clearly
    if (!contentType.includes('application/json')) {
      const e: any = new Error('Upstream /commits returned non-JSON content.');
      e.status = 502;
      throw e;
    }

    const parsed = safeJsonParse<any>(raw);
    if (!parsed.ok) {
      const e: any = new Error(`Upstream /commits JSON parse error: ${parsed.error}`);
      e.status = 502;
      throw e;
    }

    const data = parsed.data;
    const commits = Array.isArray(data) ? data : (data.items ?? data.commits ?? data.data ?? []);
    const detected = detectCherryPicksFromCommits(commits);

    return NextResponse.json({
      ref,
      page: Number((data && data.page) ?? page || 1),
      perPage: Number((data && data.perPage) ?? perPage || 50),
      count: detected.length,
      items: detected,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
