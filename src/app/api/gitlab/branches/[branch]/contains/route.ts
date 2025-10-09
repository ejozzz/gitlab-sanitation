// src/app/api/gitlab/branches/[branch]/contains/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { decryptToken } from '@/lib/config.server';

export const dynamic = 'force-dynamic';

function safeDecodeOnce(s: string): string {
  try { return decodeURIComponent(s); } catch { return s; }
}

async function dualFetch(url: URL, token: string, init?: RequestInit) {
  const h1 = new Headers(init?.headers || {});
  h1.set('PRIVATE-TOKEN', token);
  const r1 = await fetch(url, { ...init, headers: h1, cache: 'no-store' });
  if (r1.ok || r1.status !== 401) return r1;

  const h2 = new Headers(init?.headers || {});
  h2.set('Authorization', `Bearer ${token}`);
  return fetch(url, { ...init, headers: h2, cache: 'no-store' });
}

/** Derive a search term from the feature branch:
 *  - Prefer a long number (e.g. ticket id "31301")
 *  - Else use the last path segment
 */
function deriveSearchTerm(featureBranch: string): string {
  const numeric = featureBranch.match(/(\d{4,})/);
  if (numeric?.[1]) return numeric[1];
  const lastSeg = featureBranch.split('/').pop();
  return (lastSeg && lastSeg.trim()) || featureBranch;
}

type Body = {
  branch?: string;           // source/feature
  targets?: string[];        // array of target branches (develop/pfmfvf, release/.../uat)
  q?: string;                // optional explicit search term; if missing we derive
};

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ branch?: string }> } // Next 15: params is a Promise
) {
  try {
    const url = new URL(req.url);
    const awaited = await ctx.params;

    const payload = (await req.json().catch(() => ({}))) as Body;
    const rawFeature =
      (awaited?.branch ?? payload.branch ?? url.searchParams.get('branch') ?? '').trim();
    const feature = safeDecodeOnce(rawFeature);
    const targets = Array.isArray(payload.targets) ? payload.targets.filter(Boolean) : [];
    const explicitQ = typeof payload.q === 'string' ? payload.q.trim() : '';

    if (!feature) return NextResponse.json({ error: 'Missing feature branch' }, { status: 400 });
    if (!targets.length) return NextResponse.json({ error: 'Missing targets[]' }, { status: 400 });

    // Resolve active project (same shape as your other routes)
    const cookie = req.headers.get('cookie') ?? '';
    const cfgRes = await fetch(new URL('/api/projects/active', url.origin).toString(), {
      headers: cookie ? { cookie } : undefined,
      cache: 'no-store',
    });
    if (!cfgRes.ok) return NextResponse.json({ error: 'Active project not found' }, { status: 404 });

    const cfg = await cfgRes.json();
    if (!cfg?.gitlabHost || !cfg?.projectId || !cfg?.token) {
      return NextResponse.json({ error: 'Invalid project config' }, { status: 400 });
    }

    const token = decryptToken(cfg.token.ciphertext, cfg.token.nonce, cfg.token.tag);
    const host = String(cfg.gitlabHost).replace(/\/+$/, '');
    const pid = encodeURIComponent(String(cfg.projectId));
    const mk = (p: string) => new URL(`${host}/api/v4/projects/${pid}${p}`);

    const results: Array<{
      target: string;
      included: boolean;
      reason?: string;
      missingCount?: number;
      missingSample?: { id: string; short_id: string; title?: string }[];
      web_url?: string;
      via?: 'compare' | 'search' | 'none';
      evidenceCount?: number;
      evidenceTerm?: string;
    }> = [];

    const searchTerm = explicitQ || deriveSearchTerm(feature);

    for (const target of targets) {
      const t = safeDecodeOnce(String(target).trim());
      if (!t) continue;

      // --- 1) Fast path: compare (ancestry)
      const cmpUrl = mk('/repository/compare');
      cmpUrl.searchParams.set('from', t);
      cmpUrl.searchParams.set('to', feature);
      cmpUrl.searchParams.set('straight', 'false');

      const cmpRes = await dualFetch(cmpUrl, token);
      let included = false;
      let via: 'compare' | 'search' | 'none' = 'none';
      let reason: string | undefined;
      let missingCount: number | undefined;
      let missingSample: { id: string; short_id: string; title?: string }[] | undefined;
      let evidenceCount: number | undefined;

      if (cmpRes.ok) {
        const cmp = await cmpRes.json();
        const diffsEmpty = Array.isArray(cmp?.diffs) ? cmp.diffs.length === 0 : false;
        if (diffsEmpty || cmp?.compare_same_ref) {
          included = true;
          via = 'compare';
          reason = 'merged';
        } else {
          // Count source-only commits (best-effort; GitLab returns commits list)
          const commits = Array.isArray(cmp?.commits) ? cmp.commits : [];
          missingCount = commits.length || undefined;
          if (commits.length) {
            missingSample = commits.slice(0, 3).map((c: any) => ({
              id: c.id,
              short_id: String(c.id).slice(0, 8),
              title: c.title,
            }));
          }
        }
      } else {
        // If compare failed, keep going; search fallback might still be enough.
      }

      // --- 2) If compare says not merged, do cheap search fallback
      if (!included && searchTerm) {
        const searchUrl = mk('/search');
        searchUrl.searchParams.set('scope', 'commits');
        searchUrl.searchParams.set('search', searchTerm);
        searchUrl.searchParams.set('ref', t);
        searchUrl.searchParams.set('per_page', '50'); // cheap
        const sRes = await dualFetch(searchUrl, token);

        if (sRes.ok) {
          const hits = await sRes.json();
          if (Array.isArray(hits) && hits.length > 0) {
            included = true;
            via = 'search';
            reason = 'found-by-commit-search';
            evidenceCount = hits.length;
          }
        }
      }

      // --- Build optional compare web URL (for humans)
      const web_url = `${host}/${pid}/-/compare/${encodeURIComponent(t)}...${encodeURIComponent(feature)}`;

      results.push({
        target: t,
        included,
        reason,
        missingCount,
        missingSample,
        web_url,
        via,
        evidenceCount,
        evidenceTerm: searchTerm,
      });
    }

    return NextResponse.json({
      branch: feature,
      method: 'compare+search',
      results,
    });
  } catch (err: any) {
    console.error('[api/gitlab/branches/[branch]/contains] error', err);
    return NextResponse.json({ error: err?.message ?? 'Unexpected error' }, { status: 500 });
  }
}
