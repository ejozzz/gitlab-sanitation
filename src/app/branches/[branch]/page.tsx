// src/app/branches/[branch]/page.tsx
'use client';

import { useParams } from 'next/navigation';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useProjectStore } from '@/lib/project-store';

/* ---------- TYPES ---------------------------------------------------- */
type Commit = {
  id: string;
  short_id: string;
  title: string;
  author_name: string;
  committed_date: string;
  web_url?: string;
};
type MR = {
  id: number;
  iid: number;
  title: string;
  state: string;
  web_url: string;
  author?: { name?: string };
  created_at: string;
  merged_at?: string;
  closed_at?: string;
};
type Pipeline = {
  id: number;
  status: string;
  ref: string;
  web_url?: string;
  created_at: string;
  updated_at?: string;
};
type OverviewResp = {
  branch: { name: string; default?: boolean; protected?: boolean; web_url?: string };
  mergeRequests: MR[];
  pipelines: Pipeline[];
  error?: string;
};
type WatchlistResp = { source: 'env' | 'default'; branches: string[] };

/* ---------- SMALL HELPERS ------------------------------------------- */
function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 text-sm opacity-70">
      <span>ℹ️</span>
      <span>{message}</span>
    </div>
  );
}

/** Try to extract a search term from a feature branch.
 *  - Prefer a long number (e.g., ticket id "31301")
 *  - Else use the last path segment of the branch name
 */
function deriveEvidenceTerm(featureBranch: string): string {
  const numeric = featureBranch.match(/(\d{4,})/);
  if (numeric?.[1]) return numeric[1];
  const lastSeg = featureBranch.split('/').pop();
  return lastSeg && lastSeg.trim().length > 0 ? lastSeg : featureBranch;
}

/* ---------- PAGE COMPONENT ------------------------------------------ */
export default function BranchOverviewPage() {
  const params = useParams<{ branch: string }>();
  const branchName = params?.branch ? decodeURIComponent(params.branch) : '';
  const { activeProjectId, loaded } = useProjectStore();

  /* ---------- TABS ---------------------------------------------------- */
  const [tab, setTab] = useState<'commits' | 'mrs'>('commits');

  /* ---------- OVERVIEW QUERY ----------------------------------------- */
  const { data: overview, isLoading: ovLoading, error: ovError } = useQuery<OverviewResp>({
    queryKey: ['branch-overview-head', activeProjectId, branchName],
    enabled: !!activeProjectId && !!branchName,
    queryFn: async () => {
      const q = new URLSearchParams();
      q.set('branch', branchName);
      q.set('commitsPerPage', '0');
      q.set('mrs', '10');
      q.set('pipelines', '5');
      const res = await fetch(
        `/api/gitlab/branches/${encodeURIComponent(branchName)}/overview?${q.toString()}`,
        { cache: 'no-store' }
      );
      if (!res.ok) {
        const txt = await res.text();
        return { branch: { name: branchName }, mergeRequests: [], pipelines: [], error: txt || 'Failed' } as any;
      }
      const raw = await res.json();
      delete (raw as any).commits;
      delete (raw as any).commitsMeta;
      return raw;
    },
  });

  const b = overview?.branch ?? { name: branchName };
  const mrs = overview?.mergeRequests ?? [];
  const pipelines = overview?.pipelines ?? [];

  /* ---------- WATCH-LIST QUERY --------------------------------------- */
  const { data: watchlistResp } = useQuery<WatchlistResp>({
    queryKey: ['watchlist-env'],
    queryFn: async () => {
      const res = await fetch('/api/watchlist', { cache: 'no-store' });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });
  const watchlist = useMemo(() => watchlistResp?.branches ?? [], [watchlistResp]);

  /* ---------- CONTAINS (MERGED) QUERY -------------------------------- */
  const {
    data: containsData,
    isLoading: containsLoading,
    isFetching: containsFetching,
    error: containsError,
    refetch: refetchContains,
  } = useQuery<{
    branch: string;
    method: 'compare';
    results: {
      target: string;              // main branch (e.g., develop/pfmfvf)
      included: boolean;           // true => feature already merged into target
      reason?: string;             // 'merged' | 'not-merged'
      missingCount?: number;       // number of feature commits not in main
      missingSample?: { id: string; short_id: string; title?: string }[];
      web_url?: string;            // GitLab compare page
    }[];
  }>({
    queryKey: ['branch-contains', activeProjectId, branchName, watchlist.length ? watchlist : 'empty'],
    enabled: !!(activeProjectId && branchName),
    queryFn: async () => {
      if (!Array.isArray(watchlist) || watchlist.length === 0) {
        return { branch: branchName, method: 'compare' as const, results: [] };
      }
      const res = await fetch(`/api/gitlab/branches/${encodeURIComponent(branchName)}/contains`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ branch: branchName, targets: watchlist }), // targets = mains (e.g., develop/pfmfvf)
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || 'Failed to check merged status');
      }
      return res.json();
    },
    retry: false,
    refetchOnWindowFocus: false,
  });

  /* ---------- COMMITS INFINITE QUERY --------------------------------- */
  const commitsPerPage = 20;
  const {
    data: commitsPages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    status: commitsStatus,
    error: commitsError,
    refetch: refetchCommits,
  } = useInfiniteQuery({
    queryKey: ['branch-commits', activeProjectId, branchName, commitsPerPage],
    enabled: !!activeProjectId && !!branchName,
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const q = new URLSearchParams();
      q.set('page', String(pageParam ?? 1));
      q.set('perPage', String(commitsPerPage));
      const res = await fetch(
        `/api/gitlab/branches/${encodeURIComponent(branchName)}/commits?${q.toString()}`,
        { cache: 'no-store' }
      );
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || 'Failed to fetch commits');
      }
      return res.json() as Promise<{
        commits: Commit[];
        page: number;
        perPage: number;
        hasNext: boolean;
        nextPage: number | null;
        total?: number;
        totalPages?: number;
      }>;
    },
    getNextPageParam: (lastPage) => (lastPage.hasNext ? lastPage.nextPage ?? lastPage.page + 1 : undefined),
  });
  const commits: Commit[] = useMemo(
    () => (commitsPages?.pages ?? []).flatMap((p) => p.commits || []),
    [commitsPages]
  );

  /* ---------- INFINITE-SCROLL OBSERVER ------------------------------- */
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (tab !== 'commits') return;
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first.isIntersecting && hasNextPage && !isFetchingNextPage) fetchNextPage();
      },
      { root: null, rootMargin: '600px 0px 600px 0px', threshold: 0.01 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [tab, hasNextPage, isFetchingNextPage, fetchNextPage]);

  /* ---------- EVIDENCE LINK HELPERS ---------------------------------- */
  const evidenceTerm = useMemo(() => deriveEvidenceTerm(branchName), [branchName]);
  const makeEvidenceHref = (targetBranch: string) =>
    `/branches/${encodeURIComponent(branchName)}/evidence` +
    `?branch=${encodeURIComponent(targetBranch)}&q=${encodeURIComponent(evidenceTerm)}`;

  /* ---------- EARLY RETURNS ------------------------------------------ */
  if (!loaded) {
    return (
      <div className="grid h-screen place-content-center">
        <span className="loading loading-spinner loading-md" />
      </div>
    );
  }
  if (ovLoading && !overview) {
    return (
      <div className="p-6">
        <span className="loading loading-spinner loading-md" /> Loading branch overview…
      </div>
    );
  }
  if (ovError || overview?.error) {
    return (
      <div className="alert alert-error m-6">
        Failed to load: {String(ovError || overview?.error)}
      </div>
    );
  }

  /* ---------- RENDER ------------------------------------------------- */
  return (
    <div className="container mx-auto px-4 py-8">
      {/* watch-list cards (now clickable → Evidence screen) */}
      {watchlist.length > 0 && (
        <div className="mb-4">
          {(containsLoading || containsFetching) && (
            <div className="flex flex-wrap gap-3 mb-3">
              {watchlist.map((t) => (
                <div key={t} className="skeleton h-12 w-64 rounded-xl" />
              ))}
            </div>
          )}
          {!containsLoading && !containsFetching && (
            <div className="flex flex-wrap gap-3">
              {(containsData?.results ?? watchlist.map((t) => ({ target: t, included: false }))).map((r) => {
                const href = makeEvidenceHref(r.target);
                const merged = !!r.included;
                const via = (r as any).via as 'compare' | 'search' | 'none' | undefined;

                return (
                  <Link
                    key={r.target}
                    href={href}
                    className={`card shadow-sm cursor-pointer transition-colors ${merged ? 'bg-base-100/90 hover:bg-base-100' : 'bg-base-100 hover:bg-base-200'
                      } border border-base-300`}
                    title={`View commit evidence on ${r.target}`}
                  >
                    <div className="card-body py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm break-all">{r.target}</span>
                        <span className={`badge badge-sm ${merged ? 'badge-success' : 'badge-ghost'}`}>
                          {merged ? (via === 'search' ? 'Merged (Cherry Pick)' : 'Merged') : 'Not merged'}
                        </span>
                      </div>
                      <div className="text-xs opacity-70">
                        {merged ? (
                          via === 'search'
                            ? `Found matching commits on ${r.target}`
                            : `Already merged into ${r.target}`
                        ) : (
                          `Not merged into ${r.target}${typeof r.missingCount === 'number' && r.missingCount > 0
                            ? ``
                            : ''
                          }`
                        )}
                        {containsError && (
                          <button
                            className="btn btn-ghost btn-xs ml-2"
                            onClick={(e) => { e.preventDefault(); refetchContains(); }}
                          >
                            Retry
                          </button>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })}

            </div>
          )}
        </div>
      )}

      {/* header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          {b.protected && <span className="badge badge-warning badge-sm">protected</span>}
          {b.default && <span className="badge badge-primary badge-sm">default</span>}
          <span className="font-mono text-lg break-all">{b.name}</span>
        </div>
        <div className="text-sm">
          <Link href="/branches" className="link">← Back to branches</Link>
          {b.web_url && (
            <>
              <span className="opacity-60 mx-2">•</span>
              <a href={b.web_url} className="link link-primary" target="_blank" rel="noreferrer">
                Open in GitLab ↗
              </a>
            </>
          )}
        </div>
      </div>

      {/* tabs */}
      <div className="card bg-base-100 shadow mb-6">
        <div className="card-body">
          <div className="flex items-center justify-between gap-3">
            <div className="join bg-base-200 p-1 rounded-full">
              <button
                type="button"
                className={`btn btn-sm join-item rounded-full ${tab === 'commits' ? 'btn-base-300' : 'btn-ghost'}`}
                onClick={() => setTab('commits')}
              >
                Commits
              </button>
              <button
                type="button"
                className={`btn btn-sm join-item rounded-full ${tab === 'mrs' ? 'btn-base-300' : 'btn-ghost'}`}
                onClick={() => setTab('mrs')}
              >
                Merge Requests
              </button>
            </div>
          </div>

          <div className="mt-4">
            {tab === 'commits' ? (
              <>
                {commitsStatus === 'error' && (
                  <div className="alert alert-error my-3">
                    Failed to load commits: {String(commitsError)}
                    <button className="btn btn-sm ml-auto" onClick={() => refetchCommits()}>Retry</button>
                  </div>
                )}
                {!commits.length && commitsStatus === 'loading' ? (
                  <div className="opacity-60">Loading commits…</div>
                ) : !commits.length ? (
                  <EmptyState message="No commits found on this branch." />
                ) : (
                  <ul className="space-y-3">
                    {commits.map((c) => (
                      <li key={c.id} className="border border-base-300 rounded-xl p-3">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="text-sm font-medium">{c.title}</div>
                            <div className="text-xs opacity-70">
                              {c.author_name} • {formatDistanceToNow(new Date(c.committed_date), { addSuffix: true })}
                            </div>
                          </div>
                          {c.web_url && (
                            <a className="btn btn-ghost btn-xs" href={c.web_url} target="_blank" rel="noreferrer">
                              View ↗
                            </a>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                <div ref={sentinelRef} className="h-10" />
                {isFetchingNextPage && (
                  <div className="flex items-center justify-center gap-2 mt-3 text-sm opacity-70">
                    <span className="loading loading-spinner loading-sm" />
                    Loading more commits…
                  </div>
                )}
                {!isFetchingNextPage && hasNextPage && (
                  <div className="flex justify-center mt-3">
                    <button className="btn btn-sm" onClick={() => fetchNextPage()}>
                      Load more
                    </button>
                  </div>
                )}
              </>
            ) : !mrs.length ? (
              <EmptyState message="No merge requests found for this branch." />
            ) : (
              <ul className="space-y-3">
                {mrs.map((mr) => (
                  <li key={mr.id} className="border border-base-300 rounded-xl p-3">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-sm font-medium">!{mr.iid} — {mr.title}</div>
                        <div className="text-xs opacity-70 capitalize">
                          {mr.state} • opened {formatDistanceToNow(new Date(mr.created_at), { addSuffix: true })}
                        </div>
                      </div>
                      {mr.web_url && (
                        <a className="btn btn-ghost btn-xs" href={mr.web_url} target="_blank" rel="noreferrer">
                          View ↗
                        </a>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* pipelines */}
      <div className="card bg-base-100 shadow">
        <div className="card-body">
          <h2 className="card-title">Pipelines</h2>
          {!pipelines.length ? (
            <EmptyState message="No pipelines found for this branch." />
          ) : (
            <div className="overflow-x-auto rounded-box border border-base-content/5 bg-base-100">
              <table className="table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {pipelines.map((p) => (
                    <tr key={p.id}>
                      <td>#{p.id}</td>
                      <td className="capitalize">{p.status}</td>
                      <td className="text-xs opacity-70">
                        {formatDistanceToNow(new Date(p.created_at), { addSuffix: true })}
                      </td>
                      <td>
                        {p.web_url && (
                          <a className="btn btn-ghost btn-xs" href={p.web_url} target="_blank" rel="noreferrer">
                            Open ↗
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
