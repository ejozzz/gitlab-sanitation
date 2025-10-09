// src/app/repository/page.tsx
'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';

type ActiveProject = {
  name?: string;
  projectId: string | number;
  gitlabHost: string;
  web_url?: string;
};

type RepoOverview = {
  project: {
    id: number | string;
    name: string;
    path_with_namespace?: string;
    web_url?: string;
    ssh_url_to_repo?: string;
    http_url_to_repo?: string;
    visibility?: string;
    default_branch: string;
    last_activity_at?: string;
    star_count?: number;
    forks_count?: number;
  } | null;
  languages: Record<string, number>;
  latestTag: any | null;
  latestPipeline: any | null;
  openMrTotal: number;
  recentCommits: Array<{
    id: string;
    short_id?: string;
    title: string;
    author_name?: string;
    created_at?: string;
    committed_date?: string;
    web_url?: string;
  }>;
  latestCommit: any | null;
};

function Skeleton() {
  return (
    <div className="animate-pulse grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4">
      <div className="h-28 rounded-2xl bg-base-200" />
      <div className="h-28 rounded-2xl bg-base-200" />
      <div className="h-28 rounded-2xl bg-base-200" />
      <div className="h-28 rounded-2xl bg-base-200" />
      <div className="h-44 rounded-2xl bg-base-200 xl:col-span-2" />
      <div className="h-44 rounded-2xl bg-base-200 xl:col-span-2" />
    </div>
  );
}

export default function RepositoryPage() {
  const qc = useQueryClient();

  // 1) Read active project via cookies (same pattern as other pages)
  const qActive = useQuery<ActiveProject | null>({
    queryKey: ['active-project'],
    queryFn: async () => {
      const r = await fetch('/api/projects/active', { cache: 'no-store' });
      if (!r.ok) return null;
      const p = await r.json();
      if (!p) return null;

      // Normalize gitlabHost (support gitlab_url or gitlabHost)
      let gitlabHost = '';
      if (typeof p.gitlab_url === 'string' && p.gitlab_url.includes('/api/v4/projects/')) {
        gitlabHost = p.gitlab_url.split('/api/v4/projects/')[0];
      } else if (typeof p.gitlabHost === 'string') {
        gitlabHost = p.gitlabHost;
      }

      return {
        name: p.name ?? '',
        projectId: p.projectId ?? p.id ?? '',
        gitlabHost,
        web_url: p.web_url,
      } as ActiveProject;
    },
    staleTime: 30_000,
  });

  const active = qActive.data;
  const projectId = active?.projectId ?? '';

  // 2) Overview query (includes projectId in key so it refetches when active project changes)
  const qOverview = useQuery<RepoOverview>({
    queryKey: ['repo-overview', projectId],
    queryFn: async () => {
      // You can also pass projectId&gitlabHost if you prefer explicitness:
      // const qs = active ? `?projectId=${encodeURIComponent(String(active.projectId))}&gitlabHost=${encodeURIComponent(active.gitlabHost)}` : '';
      const r = await fetch(`/api/gitlab/repository/overview`, { cache: 'no-store' });
      if (!r.ok) {
        const text = await r.text();
        throw new Error(text || 'Failed to load repository overview.');
      }
      return r.json();
    },
    enabled: !!projectId,       // wait until active project is known
    refetchInterval: 30_000,    // auto-refresh every 30s
  });

  const data = qOverview.data;

  const langList = useMemo(() => {
    if (!data?.languages) return [];
    return Object.entries(data.languages)
      .map(([k, v]) => [k, Number(v)] as const)
      .sort((a, b) => b[1] - a[1]);
  }, [data]);

  const onRefresh = () => {
    // Invalidate both active-project and repo-overview for safety
    qc.invalidateQueries({ queryKey: ['active-project'] });
    qc.invalidateQueries({ queryKey: ['repo-overview', projectId] });
  };

  return (
    <div className="p-4 xl:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">
            Repository
            {data?.project?.name ? <span className="opacity-70"> — {data.project.name}</span> : null}
          </h1>
          {data?.project?.path_with_namespace ? (
            <div className="text-sm opacity-70 truncate">{data.project.path_with_namespace}</div>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <button className="btn btn-ghost btn-sm rounded-2xl" onClick={onRefresh} disabled={qOverview.isFetching}>
            {qOverview.isFetching ? 'Refreshing…' : 'Refresh'}
          </button>
          {data?.project?.web_url ? (
            <Link href={data.project.web_url} target="_blank" className="btn btn-primary btn-sm rounded-2xl">
              Open in GitLab
            </Link>
          ) : null}
        </div>
      </div>

      {/* Empty/No Active Project */}
      {!qActive.isLoading && !active && (
        <div className="alert alert-warning rounded-2xl">
          <span>No active project. Set one in <Link className="link link-primary" href="/settings">Settings</Link>.</span>
        </div>
      )}

      {/* Loading */}
      {(qActive.isLoading || qOverview.isLoading) && <Skeleton />}

      {/* Error */}
      {qOverview.isError && !qOverview.isLoading && (
        <div className="alert alert-error rounded-2xl">
          <span>{String((qOverview.error as any)?.message || 'Failed to load repository overview.')}</span>
          <button className="btn btn-sm" onClick={() => qOverview.refetch()}>Retry</button>
        </div>
      )}

      {/* Content */}
      {data?.project && !qOverview.isLoading && !qOverview.isError && (
        <>
          {/* Top summary cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {/* Default branch */}
            <div className="card bg-base-100 shadow rounded-2xl">
              <div className="card-body">
                <div className="text-sm opacity-70">Default branch</div>
                <div className="text-xl font-semibold">{data.project.default_branch}</div>
                {data.latestCommit?.created_at && (
                  <div className="text-xs opacity-60">
                    Updated {formatDistanceToNow(new Date(data.latestCommit.created_at), { addSuffix: true })}
                  </div>
                )}
              </div>
            </div>

            {/* Open MRs */}
            <div className="card bg-base-100 shadow rounded-2xl">
              <div className="card-body">
                <div className="text-sm opacity-70">Open Merge Requests</div>
                <div className="text-3xl font-bold">{data.openMrTotal ?? 0}</div>
                {data.project.web_url && (
                  <Link
                    href={`${data.project.web_url}/-/merge_requests`}
                    className="link link-primary text-sm"
                    target="_blank"
                  >
                    View MRs →
                  </Link>
                )}
              </div>
            </div>

            {/* Latest pipeline */}
            <div className="card bg-base-100 shadow rounded-2xl">
              <div className="card-body">
                <div className="text-sm opacity-70">Latest pipeline ({data.project.default_branch})</div>
                <div className="text-xl font-semibold">
                  {data.latestPipeline?.status ?? '—'}
                </div>
                {data.project.web_url && data.latestPipeline?.id ? (
                  <Link
                    href={`${data.project.web_url}/-/pipelines/${data.latestPipeline.id}`}
                    className="link link-primary text-sm"
                    target="_blank"
                  >
                    Open pipeline →
                  </Link>
                ) : null}
              </div>
            </div>

            {/* Latest tag */}
            <div className="card bg-base-100 shadow rounded-2xl">
              <div className="card-body">
                <div className="text-sm opacity-70">Latest tag</div>
                <div className="text-xl font-semibold">{data.latestTag?.name ?? '—'}</div>
                {data.project.web_url && data.latestTag?.name ? (
                  <Link
                    href={`${data.project.web_url}/-/tags`}
                    className="link link-primary text-sm"
                    target="_blank"
                  >
                    View tags →
                  </Link>
                ) : null}
              </div>
            </div>
          </div>

          {/* Languages + Repo meta */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            {/* Languages */}
            <div className="card bg-base-100 shadow rounded-2xl xl:col-span-2">
              <div className="card-body">
                <div className="flex items-center justify-between">
                  <h2 className="card-title">Languages</h2>
                  {data.project.web_url ? (
                    <Link
                      href={`${data.project.web_url}/-/graphs/${encodeURIComponent(
                        data.project.default_branch
                      )}/languages`}
                      target="_blank"
                      className="link link-primary text-sm"
                    >
                      Graphs →
                    </Link>
                  ) : null}
                </div>

                {langList.length === 0 ? (
                  <div className="opacity-60 text-sm">No language data.</div>
                ) : (
                  <div className="space-y-3">
                    {langList.map(([name, pct]) => (
                      <div key={name} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span>{name}</span>
                          <span className="opacity-70">{pct.toFixed(1)}%</span>
                        </div>
                        <progress className="progress w-full" value={pct} max={100} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Repo meta */}
            <div className="card bg-base-100 shadow rounded-2xl">
              <div className="card-body">
                <h2 className="card-title">Repository</h2>
                <div className="mt-2 space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="opacity-70">Visibility</span>
                    <span className="badge badge-outline">{data.project.visibility ?? '—'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="opacity-70">Stars</span>
                    <span>{data.project.star_count ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="opacity-70">Forks</span>
                    <span>{data.project.forks_count ?? 0}</span>
                  </div>
                  {data.project.last_activity_at && (
                    <div className="flex items-center justify-between">
                      <span className="opacity-70">Last activity</span>
                      <span>
                        {formatDistanceToNow(new Date(data.project.last_activity_at), { addSuffix: true })}
                      </span>
                    </div>
                  )}
                  <div className="divider my-2" />
                  {data.project.http_url_to_repo && (
                    <div className="overflow-x-auto">
                      <code className="text-xs">{data.project.http_url_to_repo}</code>
                    </div>
                  )}
                  {data.project.ssh_url_to_repo && (
                    <div className="overflow-x-auto">
                      <code className="text-xs">{data.project.ssh_url_to_repo}</code>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Recent commits */}
          <div className="card bg-base-100 shadow rounded-2xl">
            <div className="card-body">
              <div className="flex items-center justify-between">
                <h2 className="card-title">
                  Recent commits on {data.project.default_branch}
                </h2>
                {data.project.web_url ? (
                  <Link
                    href={`${data.project.web_url}/-/commits/${encodeURIComponent(data.project.default_branch)}`}
                    target="_blank"
                    className="link link-primary text-sm"
                  >
                    View all →
                  </Link>
                ) : null}
              </div>

              {(!data.recentCommits || data.recentCommits.length === 0) ? (
                <div className="opacity-60 text-sm">No commits found.</div>
              ) : (
                <ul className="menu bg-base-100 rounded-box">
                  {data.recentCommits.map((c) => {
                    const when = c.created_at ?? c.committed_date;
                    return (
                      <li key={c.id} className="py-1">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-1">
                          <div className="min-w-0">
                            <div className="font-medium truncate">{c.title}</div>
                            <div className="text-xs opacity-70 truncate">
                              {(c.short_id ?? c.id.slice(0, 8))} • {c.author_name ?? 'unknown'}
                              {when ? (
                                <> • {formatDistanceToNow(new Date(when), { addSuffix: true })}</>
                              ) : null}
                            </div>
                          </div>
                          {data.project?.web_url && (
                            <Link
                              href={`${data.project.web_url}/-/commit/${c.id}`}
                              target="_blank"
                              className="btn btn-ghost btn-xs rounded-xl"
                            >
                              View
                            </Link>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
