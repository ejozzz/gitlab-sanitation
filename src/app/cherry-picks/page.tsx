// src/app/cherry-picks/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useProjectStore } from '@/lib/project-store';

/* ===== Types ===== */
type WatchlistResp = { source: 'env' | 'default'; branches: string[] };

type CherryItem = {
  commit_id: string;
  short_id: string;
  title: string;
  author_name?: string;
  committed_date?: string;
  web_url?: string;
  source_sha: string;
  evidence: string;
};
type CherryResp = {
  ref: string;
  page: number;
  perPage: number;
  count: number;
  items: CherryItem[];
};

/* ===== Fetchers ===== */
async function fetchWatchlist(): Promise<WatchlistResp> {
  const r = await fetch('/api/watchlist', { cache: 'no-store' });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function fetchCherryPicks(
  ref: string,
  page = 1,
  perPage = 50,
  activeProjectId?: string | number
): Promise<CherryResp> {
  const u = new URL('/api/gitlab/cherry-picks', window.location.origin);
  u.searchParams.set('ref', ref);
  u.searchParams.set('page', String(page));
  u.searchParams.set('perPage', String(perPage));
  if (activeProjectId != null) u.searchParams.set('activeProjectId', String(activeProjectId));
  const r = await fetch(u.toString(), { cache: 'no-store' });
  if (!r.ok) {
    // propagate text for easier debugging in the UI
    let body: string;
    try { body = await r.text(); } catch { body = `${r.status}`; }
    throw new Error(`Cherry-picks failed: ${r.status} ${body ? `- ${body}` : ''}`);
  }
  return r.json();
}

/* ===== Page ===== */
export default function CherryPicksSinglePage() {
  // selected pill + paging for table
  const [selectedRef, setSelectedRef] = useState<string>('');
  const [page, setPage] = useState(1);
  const perPage = 50;

  // project context (forwarded, so route works even without global "active" project)
  const activeProjectId = useProjectStore((s) => s.activeProjectId);

  // deep-link support (?ref=)
  useEffect(() => {
    try {
      const ref = new URL(window.location.href).searchParams.get('ref');
      if (ref) setSelectedRef(ref);
    } catch {}
  }, []);

  // pills from the same endpoint as your branch detail page
  const {
    data: watchlistResp,
    isFetching: watchlistFetching,
    error: watchlistError,
  } = useQuery({
    queryKey: ['watchlist-env'],
    queryFn: fetchWatchlist,
    staleTime: 60_000,
  });
  const watchlist = useMemo(() => watchlistResp?.branches ?? [], [watchlistResp]);

  // cherry-picks for the selected pill
  const {
    data: cherryData,
    isFetching: cherryFetching,
    isLoading: cherryLoading,
    error: cherryError,
  } = useQuery({
    queryKey: ['cherry-picks', selectedRef, page, perPage, activeProjectId],
    queryFn: () => fetchCherryPicks(selectedRef, page, perPage, activeProjectId),
    enabled: !!selectedRef,
    staleTime: 30_000,
  });
  const items = useMemo(() => cherryData?.items ?? [], [cherryData]);

  function onPick(ref: string) {
    setSelectedRef(ref);
    setPage(1);
    // keep the URL shareable
    try {
      const u = new URL(window.location.href);
      u.searchParams.set('ref', ref);
      window.history.replaceState({}, '', u.toString());
    } catch {}
  }

  return (
    <div className="p-4 space-y-6">

      {/* Pills (from /api/watchlist) */}
      {watchlistError ? (
        <div className="alert alert-error">
          <span>{(watchlistError as Error).message}</span>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {watchlistFetching && !watchlist.length ? (
          <>
            <div className="skeleton h-12 w-64 rounded-xl" />
            <div className="skeleton h-12 w-64 rounded-xl" />
            <div className="skeleton h-12 w-64 rounded-xl" />
          </>
        ) : null}

        {watchlist.map((target) => {
          const active = selectedRef === target;
          return (
            <button
              key={target}
              onClick={() => onPick(target)}
              className={[
                'card shadow-sm cursor-pointer transition-colors w-auto',
                active ? 'bg-primary text-primary-content' : 'bg-base-100 hover:bg-base-200',
                'border border-base-300',
              ].join(' ')}
              title={`Show cherry-picked commits on ${target}`}
            >
              <div className="card-body py-3 px-4">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm break-all">{target}</span>
                  {active ? <span className="badge badge-sm badge-info">Selected</span> : null}
                </div>
                <div className="text-xs opacity-70">
                  {active ? 'Showing cherry-picked commits' : 'Click to load cherry-picked commits'}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="divider">Cherry-picked commits</div>

      {/* Selected ref header + pager */}
      <div className="flex items-center justify-between">
        <div className="text-sm">
          Selected branch:{' '}
          {selectedRef ? <b className="font-mono">{selectedRef}</b> : <span className="opacity-70">none</span>}
        </div>
        {selectedRef ? (
          <div className="join">
            <button
              className="btn join-item"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={(cherryData?.page ?? page) <= 1 || cherryFetching}
            >
              Prev
            </button>
            <button
              className="btn join-item"
              onClick={() => setPage((p) => p + 1)}
              disabled={cherryFetching}
            >
              Next
            </button>
          </div>
        ) : null}
      </div>

      {/* Table */}
      {!selectedRef ? (
        <div className="alert">
          <span>Click a branch pill above to load its cherry-picked commits.</span>
        </div>
      ) : cherryLoading ? (
        <div className="skeleton h-24 w-full" />
      ) : cherryError ? (
        <div className="alert alert-error">
          <span>{(cherryError as Error).message}</span>
        </div>
      ) : items.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="table table-zebra">
            <thead>
              <tr>
                <th>Commit</th>
                <th>Title</th>
                <th>Author</th>
                <th>Date</th>
                <th>Cherry-picked from</th>
                <th>Evidence</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.commit_id}>
                  <td className="whitespace-nowrap">
                    {it.web_url ? (
                      <a className="link link-primary" href={it.web_url} target="_blank" rel="noreferrer">
                        {it.short_id}
                      </a>
                    ) : (
                      <span className="font-mono">{it.short_id}</span>
                    )}
                  </td>
                  <td className="max-w-xl"><div className="line-clamp-2">{it.title}</div></td>
                  <td className="whitespace-nowrap">{it.author_name ?? '-'}</td>
                  <td className="whitespace-nowrap">
                    {it.committed_date ? new Date(it.committed_date).toLocaleString() : '-'}
                  </td>
                  <td className="whitespace-nowrap">
                    <span className="font-mono">{it.source_sha.slice(0, 8)}</span>
                  </td>
                  <td className="max-w-md">
                    <div className="text-xs opacity-70 line-clamp-2">{it.evidence}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="text-sm opacity-70 mt-4">
            Page {cherryData?.page ?? page} · {items.length} found (per page: {cherryData?.perPage ?? perPage})
          </div>
        </div>
      ) : (
        <div className="alert">
          <span>No cherry-picked commits detected on <b className="font-mono">{selectedRef}</b> for this page.</span>
        </div>
      )}
    </div>
  );
}
