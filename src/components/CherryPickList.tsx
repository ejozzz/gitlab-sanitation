//app/components/CherryPickList.tsx
'use client';

import { formatDistanceToNow } from 'date-fns';
import type { CherryPick } from '@/lib/gitlab-types';

interface CherryPickListProps {
  cherryPicks: CherryPick[];
  isLoading: boolean;
}

export default function CherryPickList({ cherryPicks, isLoading }: CherryPickListProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="skeleton h-20 w-full"></div>
        ))}
      </div>
    );
  }

  if (!cherryPicks?.length) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">No cherry-picks detected</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {cherryPicks.map((cp) => (
        <div key={cp.id} className="card bg-base-100 shadow">
          <div className="card-body">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="card-title text-lg">
                  <a href={cp.webUrl} target="_blank" rel="noopener noreferrer" className="link">
                    {cp.title}
                  </a>
                </h3>
                <div className="text-sm text-gray-500 mt-2">
                  {cp.type === 'commit' ? 'Commit' : 'Merge Request'} • {cp.sourceBranch} → {cp.targetBranch}
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  {formatDistanceToNow(new Date(cp.createdAt), { addSuffix: true })}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`badge ${cp.confidence === 'high' ? 'badge-success' : cp.confidence === 'medium' ? 'badge-warning' : 'badge-error'} badge-sm`}>
                  {cp.confidence} confidence
                </span>
                <span className="badge badge-info badge-sm">
                  {cp.detectedBy}
                </span>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}