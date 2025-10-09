// src/components/BranchTable.tsx
'use client';

import { useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import type { GitLabBranch } from '@/lib/gitlab-types';
import Link from 'next/link';

interface Props {
  branches: GitLabBranch[];
  isLoading: boolean;
  page: number;                 // 1-based
  pageCount: number;            // total pages (may be 1 while loading/unknown)
  onPageChange: (p: number) => void;
  hasNext?: boolean;
  hasPrev?: boolean;
}

function buildPageItems(page: number, pageCount: number): (number | 'ellipsis')[] {
  const pc = Math.max(1, pageCount);
  if (pc <= 7) return Array.from({ length: pc }, (_, i) => i + 1);

  const items: (number | 'ellipsis')[] = [];
  const push = (v: number | 'ellipsis') => { if (items[items.length - 1] !== v) items.push(v); };

  const windowStart = Math.max(2, page - 2);
  const windowEnd = Math.min(pc - 1, page + 2);

  push(1);
  if (windowStart > 2) push('ellipsis');
  for (let p = windowStart; p <= windowEnd; p++) push(p);
  if (windowEnd < pc - 1) push('ellipsis');
  push(pc);
  return items;
}

// Safe date for "Last Commit"
const getCommitDate = (b: GitLabBranch): Date | null => {
  const s =
    b?.commit?.authored_date ??
    b?.commit?.committed_date ??
    b?.commit?.created_at ??
    null;
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

export default function BranchTable({
  branches,
  isLoading,
  page,
  pageCount,
  onPageChange,
  hasNext,
  hasPrev,
}: Props) {
  // Mirror page so UI responds instantly
  const [internalPage, setInternalPage] = useState<number>(page);
  useEffect(() => setInternalPage(page), [page]);

  const [gotoValue, setGotoValue] = useState<string>('');

  // IMPORTANT: do NOT clamp to pageCount here. Only ensure >= 1.
  const jumpTo = (next: number) => {
    const n = Math.max(1, Math.floor(Number(next)));
    if (!Number.isFinite(n)) return;
    setInternalPage(n);     // visual feedback immediately
    onPageChange(n);        // parent triggers refetch with ?page=n
  };

  const submitGoto = () => {
    jumpTo(Number(gotoValue));
  };

  // while pageCount is uncertain (often 1 due to previous data), don’t over-restrict
  const safePageCount = Math.max(internalPage, Math.max(1, pageCount));
  const pageItems = buildPageItems(internalPage, safePageCount);

  // ---- Render states ----
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => <div key={i} className="skeleton h-16 w-full" />)}
      </div>
    );
  }

  if (!branches.length) {
    return <div className="text-center py-8 text-gray-500">No branches found</div>;
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="table table-zebra w-full">
          <thead>
            <tr>
              <th>Branch</th>
              <th>Last Commit</th>
              <th>Author</th>
            </tr>
          </thead>
          <tbody>
            {branches.map((b) => (
              <tr key={b.name}>
                <td>
                  <div className="flex items-center gap-2">
                    {b.protected && <span className="badge badge-warning badge-sm">protected</span>}
                    {b.default && <span className="badge badge-primary badge-sm">default</span>}
                    <Link
                      href={`/branches/${encodeURIComponent(b.name)}`}
                      className="link link-primary font-mono break-all"
                      title={`Open details for ${b.name}`}
                    >
                      {b.name}
                    </Link>
                  </div>
                </td>
                <td>
                  <div className="text-sm">{b.commit.title}</div>
                  <div className="text-xs text-gray-500">
                    {(() => {
                      const d = getCommitDate(b);
                      return d ? formatDistanceToNow(d, { addSuffix: true }) : 'date unknown';
                    })()}
                  </div>
                </td>
                <td>{b.commit.author_name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination (First / Prev / window / Next / Last + Go To) */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-6">
        <div className="join">
          <button
            type="button"
            className="join-item btn btn-sm"
            onClick={() => jumpTo(1)}
            disabled={!hasPrev && internalPage <= 1}
            aria-label="First page"
          >
            «
          </button>
          <button
            type="button"
            className="join-item btn btn-sm"
            onClick={() => jumpTo(internalPage - 1)}
            disabled={!hasPrev && internalPage <= 1}
            aria-label="Previous page"
          >
            ‹
          </button>

          {pageItems.map((it, idx) =>
            it === 'ellipsis' ? (
              <button key={`e-${idx}`} type="button" className="join-item btn btn-sm btn-disabled">…</button>
            ) : (
              <button
                key={it}
                type="button"
                onClick={() => jumpTo(it)}
                className={`join-item btn btn-sm ${it === internalPage ? 'btn-active' : ''}`}
                aria-current={it === internalPage ? 'page' : undefined}
              >
                {it}
              </button>
            )
          )}

          <button
            type="button"
            className="join-item btn btn-sm"
            onClick={() => jumpTo(internalPage + 1)}
            disabled={!hasNext && internalPage >= safePageCount}
            aria-label="Next page"
          >
            ›
          </button>
          <button
            type="button"
            className="join-item btn btn-sm"
            onClick={() => jumpTo(pageCount)}
            disabled={!hasNext && internalPage >= safePageCount}
            aria-label="Last page"
          >
            »
          </button>
        </div>

        {/* Go-to */}
        <label className="flex items-center gap-2 text-sm">
          <span className="opacity-70">Move to</span>
          <div className="join">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={gotoValue}
              onChange={(e) => setGotoValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.stopPropagation();
                  submitGoto();
                }
              }}
              placeholder="page #"
              className="input input-bordered input-sm join-item w-24"
              aria-label="Go to page"
            />
            <button
              type="button"
              className="btn btn-sm join-item"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                submitGoto();
              }}
            >
              Go
            </button>
          </div>
          <span className="opacity-60">of {Math.max(1, pageCount)}</span>
        </label>
      </div>
    </>
  );
}
