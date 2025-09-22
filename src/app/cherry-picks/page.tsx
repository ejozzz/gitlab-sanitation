//app/cherry-picks/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useProjectStore } from '@/lib/project-store';
import CherryPickList from '@/components/CherryPickList';
import type { CherryPick } from '@/lib/gitlab-types';

export default function CherryPicksPage() {
  const [detectionMethod, setDetectionMethod] = useState<'message' | 'label' | 'all'>('all');
  const { activeProjectId } = useProjectStore();

  const { data: cherryPicks, isLoading, error } = useQuery<CherryPick[]>({
    queryKey: ['cherry-picks', detectionMethod, activeProjectId],
    queryFn: async () => {
      if (!activeProjectId) return [];
      
      const response = await fetch(`/api/gitlab/cherry-picks?method=${detectionMethod}`);
      if (!response.ok) throw new Error('Failed to fetch cherry-picks');
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
          <p className="text-base-content/70 mb-8">Please select a project to analyze cherry-picks.</p>
          <a href="/settings" className="btn btn-primary">Configure Projects</a>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="alert alert-error mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>Failed to load cherry-picks: {error.message}</span>
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
          <h1 className="text-3xl font-bold">{projectInfo.name} - Cherry-pick Detection</h1>
          <p className="text-sm text-base-content/70">Project ID: {projectInfo.projectId}</p>
        </div>
      )}

      <div className="mb-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Cherry-pick Analysis</h2>
          <div className="alert alert-info">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="stroke-current shrink-0 w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <span>Results are best-effort based on commit message patterns and MR labels</span>
          </div>
        </div>
        
        <div className="mt-4">
          <select
            className="select select-bordered"
            value={detectionMethod}
            onChange={(e) => setDetectionMethod(e.target.value as any)}
          >
            <option value="all">All methods</option>
            <option value="message">Commit message only</option>
            <option value="label">MR labels only</option>
          </select>
        </div>
      </div>
      
      <CherryPickList cherryPicks={cherryPicks || []} isLoading={isLoading} />
    </div>
  );
}