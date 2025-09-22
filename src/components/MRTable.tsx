//app/components/MRTable.tsx
'use client';

import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';
import type { GitLabMergeRequest } from '@/lib/gitlab-types';

interface MRTableProps {
  mergeRequests: GitLabMergeRequest[];
  isLoading: boolean;
}

export default function MRTable({ mergeRequests, isLoading }: MRTableProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="skeleton h-24 w-full"></div>
        ))}
      </div>
    );
  }

  if (!mergeRequests?.length) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">No merge requests found</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {mergeRequests.map((mr) => (
        <div key={mr.id} className="card bg-base-100 shadow">
          <div className="card-body">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <h3 className="card-title text-lg">
                  <a href={mr.web_url} target="_blank" rel="noopener noreferrer" className="link">
                    !{mr.iid} {mr.title}
                  </a>
                  {mr.draft && <span className="badge badge-neutral badge-sm">draft</span>}
                </h3>
                <div className="text-sm text-gray-500 mt-2">
                  {mr.source_branch} → {mr.target_branch}
                </div>
                <div className="flex gap-2 mt-2">
                  {mr.labels.map((label) => (
                    <span key={label} className="badge badge-outline badge-sm">
                      {label}
                    </span>
                  ))}
                </div>
                <div className="text-xs text-gray-400 mt-2">
                  {formatDistanceToNow(new Date(mr.created_at), { addSuffix: true })}
                  {mr.merged_at && ` • Merged by ${mr.merged_by?.name || 'unknown'}`}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`badge ${
                  mr.state === 'opened' ? 'badge-success' : 
                  mr.state === 'merged' ? 'badge-primary' : 
                  'badge-error'
                } badge-sm`}>
                  {mr.state}
                </span>
                <Link href={`/merge-requests/${mr.iid}`} className="btn btn-ghost btn-xs">
                  View Details
                </Link>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}