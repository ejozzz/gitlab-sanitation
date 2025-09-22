//app/components/SanitationHelpers.tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';

interface CleanupSuggestion {
  type: 'branch' | 'mr';
  id: string;
  title: string;
  reason: string;
  age: number;
  url: string;
}

export default function SanitationHelpers() {
  const { data: suggestions } = useQuery({
    queryKey: ['sanitation-suggestions'],
    queryFn: async () => {
      const response = await fetch('/api/gitlab/sanitation/suggestions');
      if (!response.ok) throw new Error('Failed to fetch suggestions');
      return response.json();
    },
  });

  const { data: hygiene } = useQuery({
    queryKey: ['mr-hygiene'],
    queryFn: async () => {
      const response = await fetch('/api/gitlab/sanitation/hygiene');
      if (!response.ok) throw new Error('Failed to fetch hygiene data');
      return response.json();
    },
  });

  return (
    <div className="space-y-8">
      <div className="card bg-base-100 shadow">
        <div className="card-body">
          <h2 className="card-title">Cleanup Suggestions</h2>
          <p className="text-sm text-gray-600 mb-4">
            Branches and MRs that might need attention
          </p>
          
          {suggestions?.length > 0 ? (
            <div className="space-y-2">
              {suggestions.map((item: CleanupSuggestion) => (
                <div key={item.id} className="flex justify-between items-center p-3 bg-base-200 rounded-lg">
                  <div>
                    <div className="font-medium">{item.title}</div>
                    <div className="text-sm text-gray-500">{item.reason}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-gray-500">
                      {formatDistanceToNow(Date.now() - item.age * 24 * 60 * 60 * 1000, { addSuffix: true })}
                    </div>
                    <a href={item.url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-xs">
                      View
                    </a>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500">No cleanup suggestions at this time</p>
          )}
        </div>
      </div>

      <div className="card bg-base-100 shadow">
        <div className="card-body">
          <h2 className="card-title">MR Hygiene Report</h2>
          
          {hygiene && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="stat">
                <div className="stat-title">Draft MRs</div>
                <div className="stat-value text-warning">{hygiene.draftCount}</div>
                <div className="stat-desc">Older than 7 days</div>
              </div>
              
              <div className="stat">
                <div className="stat-title">No Reviewers</div>
                <div className="stat-value text-error">{hygiene.noReviewersCount}</div>
                <div className="stat-desc">Open MRs</div>
              </div>
              
              <div className="stat">
                <div className="stat-title">No Labels</div>
                <div className="stat-value text-info">{hygiene.noLabelsCount}</div>
                <div className="stat-desc">Open MRs</div>
              </div>
              
              <div className="stat">
                <div className="stat-title">Stale Branches</div>
                <div className="stat-value text-error">{hygiene.staleBranchesCount}</div>
                <div className="stat-desc">90+ days old</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}