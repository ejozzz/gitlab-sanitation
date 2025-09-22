//app/merge-requests/page.tsx
'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useProjectStore } from '@/lib/project-store';
import MRTable from '@/components/MRTable';

export default function MergeRequestsPage() {
  const [state, setState] = useState<'opened' | 'closed' | 'merged' | 'all'>('opened');
  const [targetBranch, setTargetBranch] = useState('');
  const { activeProjectId } = useProjectStore();

  const { data: mergeRequests, isLoading, error } = useQuery({
    queryKey: ['merge-requests', state, targetBranch, activeProjectId],
    queryFn: async () => {
      if (!activeProjectId) return [];
      
      const params = new URLSearchParams();
      if (state !== 'all') params.append('state', state);
      if (targetBranch) params.append('target_branch', targetBranch);
      
      const response = await fetch(`/api/gitlab/merge-requests?${params}`);
      if (!response.ok) throw new Error('Failed to fetch merge requests');
      return response.json();
    },
    enabled: !!activeProjectId,
  });

  // Project context header
  const { data: projectInfo } = useQuery({
    queryKey: ['active-project-info', activeProjectId],
    queryFn: async () => {
      if (!activeProjectId) return null;
      
      const response = await fetch('/api/config');
      if (!response.ok) return null;
      
      const config = await response.json();
      return config.projects?.find((p: any) => p.id === activeProjectId);
    },
    enabled: !!activeProjectId,
  });

  if (!activeProjectId) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center py-16">
          <div className="mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="w-16 h-16 mx-auto stroke-current text-warning">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold mb-4">No Project Selected</h1>
          <p className="text-base-content/70 mb-8">Please select a project to view merge requests.</p>
          <a href="/settings" className="btn btn-primary">Configure Projects</a>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Project Context Header */}
      {projectInfo && (
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="badge badge-primary badge-sm">Active Project</div>
            <span className="text-sm text-base-content/70">{projectInfo.gitlabHost}</span>
          </div>
          <h1 className="text-3xl font-bold">{projectInfo.name} - Merge Requests</h1>
          <p className="text-sm text-base-content/70">Project ID: {projectInfo.projectId}</p>
        </div>
      )}

      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Merge Request Management</h2>
        
        <div className="flex gap-4 items-center">
          <select
            className="select select-bordered"
            value={state}
            onChange={(e) => setState(e.target.value as any)}
          >
            <option value="opened">Open</option>
            <option value="merged">Merged</option>
            <option value="closed">Closed</option>
            <option value="all">All</option>
          </select>
          
          <input
            type="text"
            placeholder="Target branch (optional)"
            className="input input-bordered"
            value={targetBranch}
            onChange={(e) => setTargetBranch(e.target.value)}
          />
        </div>
      </div>
      
      <MRTable mergeRequests={mergeRequests} isLoading={isLoading} />
    </div>
  );
}