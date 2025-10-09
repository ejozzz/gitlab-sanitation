// src/app/branches/[branch]/evidence/page.tsx
'use client';

import { useSearchParams, useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';

type CommitHit = {
  sha: string;
  short: string;
  title: string;
  message: string;
  author: string;
  authored_date: string;
  web_url: string;
};

export default function EvidencePage() {
  const sp = useSearchParams();
  const params = useParams<{ branch: string }>();
  const feature = decodeURIComponent(params.branch);
  const branch = sp.get('branch') ?? '';  // target branch (e.g. release/pfmfvf/uat)
  const q = sp.get('q') ?? '';            // term (e.g. ticket id)
  const page = Number(sp.get('page') ?? '1');

  const { data, isLoading, error } = useQuery({
    queryKey: ['commit-search', branch, q, page],
    queryFn: async (): Promise<{ commits: CommitHit[]; count: number }> => {
      const res = await fetch(
        `/api/gitlab/commits/search?branch=${encodeURIComponent(branch)}&q=${encodeURIComponent(q)}&page=${page}`,
        { cache: 'no-store' }
      );
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!branch && !!q,
  });

  return (
    <div className="p-4 space-y-4">
      

      <div className="card bg-base-100 shadow-sm">
        <div className="card-body">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm">{branch}</span>
            <span className="badge badge-info badge-sm">Search</span>
          </div>
          <div className="text-xs opacity-70">Showing commits on <span className="font-mono">{branch}</span> matching “{q}”.</div>
        </div>
      </div>

      {isLoading && <div className="loading loading-dots loading-md" />}

      {error && (
        <div className="alert alert-error">
          <span>{String((error as any)?.message || error)}</span>
        </div>
      )}

      {data && (
        <div className="space-y-3">
          {data.commits.length === 0 ? (
            <div className="alert alert-warning">
              <span>No commits found on <span className="font-mono">{branch}</span> for “{q}”.</span>
            </div>
          ) : (
            data.commits.map((c) => (
              <div key={c.sha} className="card bg-base-100 border">
                <div className="card-body py-3 px-4">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{c.title}</div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs opacity-70">{c.short}</span>
                      <a className="btn btn-xs" target="_blank" rel="noreferrer" href={c.web_url}>View in GitLab</a>
                    </div>
                  </div>
                  <div className="text-xs opacity-70">
                    {c.author} • {new Date(c.authored_date).toLocaleString()}
                  </div>
                  <details className="mt-2">
                    <summary className="text-xs opacity-70">message</summary>
                    <pre className="mt-2 whitespace-pre-wrap text-xs">{c.message}</pre>
                  </details>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
