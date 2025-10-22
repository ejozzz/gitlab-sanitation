'use client';

import React, { useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';

/* ---------------- Types (reuse shapes you already defined elsewhere) --------------- */

type ContainsResult = {
  branch: string;
  method: 'compare';
  results: {
    target: string;
    included: boolean;
    via?: 'compare' | 'search' | 'none';
    missingCount?: number;
    missingSample?: { id: string; short_id: string; title?: string }[];
    web_url?: string;
  }[];
};

type WatchlistResp = { source: 'env' | 'default'; branches: string[] };

/* ---------------- Helpers ----------------------------------------------------------- */

function withQuery(base: string, q: Record<string, string | number | undefined>) {
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'http://localhost';
  const u = new URL(base, origin);
  for (const [k, v] of Object.entries(q)) {
    if (v !== undefined && v !== null && String(v).length > 0) {
      u.searchParams.set(k, String(v));
    }
  }
  return u.toString();
}

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: 'no-store', credentials: 'same-origin', ...init });

  const ct = res.headers.get('content-type') || '';
  if (!ct.toLowerCase().includes('application/json')) {
    const text = await res.text();
    const snippet = text.slice(0, 300);
    const hint =
      snippet.startsWith('<!DOCTYPE') || snippet.startsWith('<html')
        ? 'Server returned HTML (likely a login/redirect or error page).'
        : 'Server did not return JSON.';
    throw new Error(`${hint} status=${res.status}. First 300 chars:\n${snippet}`);
  }

  if (!res.ok) {
    let body: any = {};
    try { body = await res.json(); } catch {}
    throw new Error(`HTTP ${res.status}: ${body?.error ?? 'Request failed'}`);
  }

  return (await res.json()) as T;
}

function deriveEvidenceTerm(featureBranch: string): string {
  const numeric = featureBranch.match(/(\d{4,})/);
  if (numeric?.[1]) return numeric[1];
  const lastSeg = featureBranch.split('/').pop();
  return lastSeg && lastSeg.trim().length > 0 ? lastSeg : featureBranch;
}

function classForEdge(r: ContainsResult['results'][number]) {
  if (r.included && r.via === 'search') return 'stroke-info';
  if (r.included) return 'stroke-success';
  return 'stroke-error';
}
function labelForEdge(r: ContainsResult['results'][number]) {
  if (r.included && r.via === 'search') return 'Merged (Cherry Pick)';
  if (r.included) return 'Merged';
  return 'Not merged';
}

/* ---------------- Page -------------------------------------------------------------- */

export default function MrGraphPage() {
  const sp = useSearchParams();
  const branch = sp.get('branch') || '';        // feature/source branch (required)
  const projectId = sp.get('projectId') || '';  // pid (required)
  const qParam = sp.get('q') || deriveEvidenceTerm(branch); // optional derived evidence term

  const watchlistQuery = useQuery<WatchlistResp>({
    queryKey: ['watchlist-env'],
    queryFn: async () => {
      const res = await fetch('/api/watchlist', { cache: 'no-store' });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    staleTime: 60_000,
    enabled: !!branch && !!projectId,
  });

  const containsQuery = useQuery<ContainsResult>({
    queryKey: ['mr-map-contains', projectId, branch, (watchlistQuery.data?.branches ?? []).join('|')],
    enabled: !!branch && !!projectId && !!watchlistQuery.data?.branches?.length,
    queryFn: async () => {
      const targets = watchlistQuery.data?.branches ?? [];
      const url = withQuery(`/api/gitlab/branches/${encodeURIComponent(branch)}/contains`, {
        projectId,
      });
      return fetchJSON<ContainsResult>(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch, targets }),
      });
    },
    staleTime: 10_000,
    retry: false,
  });

  const results = containsQuery.data?.results ?? [];

  // Layout positions for a simple left→right graph:
  // - source node on the left
  // - targets vertically on the right
  const nodes = useMemo(() => {
    const src = { id: `src::${branch}`, label: branch };
    const tgts = results.map((r, i) => ({ id: `tgt::${r.target}`, label: r.target, idx: i }));
    return { src, tgts };
  }, [branch, results]);

  // SVG sizing
  const rowH = 76;
  const h = Math.max(220, results.length * rowH + 80);
  const w = 920;
  const srcX = 180;
  const tgtX = w - 220;
  const srcY = h / 2;

  return (
    <div className="min-h-screen w-full max-w-7xl mx-auto p-4">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold">MR Map</h1>
        <div className="text-sm opacity-70">
          Project: <span className="font-mono">{projectId}</span>
          <span className="opacity-60 mx-1">•</span>
          Source: <span className="font-mono">{branch}</span>
          {qParam ? (
            <>
              <span className="opacity-60 mx-1">•</span>
              Term: <span className="font-mono">{qParam}</span>
            </>
          ) : null}
        </div>
      </div>

      {/* loading & error states */}
      {(!branch || !projectId) && (
        <div className="alert alert-warning">Missing query params: <code>branch</code> and <code>projectId</code></div>
      )}
      {watchlistQuery.isLoading && <div className="opacity-70">Loading watchlist…</div>}
      {watchlistQuery.error && (
        <div className="alert alert-error my-2">
          Failed to load watchlist: {(watchlistQuery.error as Error).message}
        </div>
      )}
      {containsQuery.isLoading && <div className="opacity-70">Checking status…</div>}
      {containsQuery.error && (
        <div className="alert alert-error my-2">
          Failed to check status: {(containsQuery.error as Error).message}
        </div>
      )}

      {/* Graph */}
      <div className="card bg-base-100 shadow-sm">
        <div className="card-body">
          <div className="overflow-x-auto">
            <svg width={w} height={h} className="block">
              {/* edges */}
              {results.map((r, i) => {
                const y = 80 + i * rowH;
                return (
                  <g key={`edge::${r.target}`}>
                    <line
                      x1={srcX + 100}
                      y1={srcY}
                      x2={tgtX - 100}
                      y2={y}
                      className={`stroke-2 ${classForEdge(r)}`}
                    />
                    {/* edge label */}
                    <text
                      x={(srcX + 100 + tgtX - 100) / 2}
                      y={(srcY + y) / 2 - 6}
                      textAnchor="middle"
                      className="text-xs fill-current opacity-80"
                    >
                      {labelForEdge(r)}
                    </text>
                  </g>
                );
              })}

              {/* source node */}
              <g transform={`translate(${srcX - 100}, ${srcY - 26})`}>
                <rect width="200" height="52" rx="10" className="fill-base-200 stroke-base-300" />
                <text x="100" y="28" textAnchor="middle" className="text-sm fill-current">
                  {nodes.src.label}
                </text>
                <text x="100" y="44" textAnchor="middle" className="text-[10px] fill-current opacity-60">
                  Source branch
                </text>
              </g>

              {/* target nodes */}
              {results.map((r, i) => {
                const y = 80 + i * rowH;
                const badgeLabel = labelForEdge(r);
                const badgeClass =
                  r.included ? (r.via === 'search' ? 'badge-info' : 'badge-success') : 'badge-error';
                return (
                  <g key={`node::${r.target}`} transform={`translate(${tgtX - 120}, ${y - 26})`}>
                    <rect width="240" height="52" rx="10" className="fill-base-200 stroke-base-300" />
                    <foreignObject x="0" y="0" width="240" height="52">
                      <div className="w-[240px] h-[52px] flex items-center justify-between px-3">
                        <div className="text-sm font-mono truncate max-w-[140px]" title={r.target}>
                          {r.target}
                        </div>
                        <div className={`badge ${badgeClass}`}>{badgeLabel}</div>
                      </div>
                    </foreignObject>
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Legend */}
          <div className="mt-4 flex flex-wrap gap-2 text-sm">
            <span className="badge badge-success">Merged</span>
            <span className="badge badge-info">Merged (Cherry Pick)</span>
            <span className="badge badge-error">Not merged</span>
          </div>
        </div>
      </div>
    </div>
  );
}
