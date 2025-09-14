'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useProjectStore } from '@/lib/project-store';
import ApprovalsPanel from '@/components/ApprovalsPanel';
import DiffViewer from '@/components/DiffViewer';

export default function MergeRequestDetailPage() {
  const params = useParams();
  const iid = parseInt(params.iid as string);
  const { activeProjectId } = useProjectStore();

  const { data: mr, isLoading: mrLoading, error: mrError } = useQuery({
    queryKey: ['merge-request', iid, activeProjectId],
    queryFn: async () => {
      if (!activeProjectId) return null;
      
      const response = await fetch(`/api/gitlab/merge-requests/${iid}`);
      if (!response.ok) throw new Error('Failed to fetch merge request');
      return response.json();
    },
    enabled: !!activeProjectId,
  });

  const { data: changes, isLoading: changesLoading } = useQuery({
    queryKey: ['merge-request-changes', iid, activeProjectId],
    queryFn: async () => {
      if (!activeProjectId) return null;
      
      const response = await fetch(`/api/gitlab/merge-requests/${iid}/changes`);
      if (!response.ok) throw new Error('Failed to fetch changes');
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
          <p className="text-base-content/70 mb-8">Please select a project to view merge request details.</p>
          <a href="/settings" className="btn btn-primary">Configure Projects</a>
        </div>
      </div>
    );
  }

  if (mrLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="skeleton h-32 w-full"></div>
      </div>
    );
  }

  if (!mr) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">Merge request not found</div>
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
          <h1 className="text-3xl font-bold">{projectInfo.name} - Merge Request !{mr.iid}</h1>
          <p className="text-sm text-base-content/70">Project ID: {projectInfo.projectId}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="card bg-base-100 shadow">
            <div className="card-body">
              <h2 className="card-title">Description</h2>
              <div className="prose max-w-none">
                {mr.description || 'No description provided'}
              </div>
            </div>
          </div>

          <div className="card bg-base-100 shadow">
            <div className="card-body">
              <h2 className="card-title">Changes</h2>
              <DiffViewer files={changes?.changes || []} loading={changesLoading} />
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="card bg-base-100 shadow">
            <div className="card-body">
              <h3 className="card-title">Status</h3>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span>State:</span>
                  <span className={`badge ${
                    mr.state === 'opened' ? 'badge-success' : 
                    mr.state === 'merged' ? 'badge-primary' : 
                    'badge-error'
                  }`}>
                    {mr.state}
                  </span>
                </div>
                {mr.merged_at && (
                  <div className="flex justify-between">
                    <span>Merged:</span>
                    <span>{new Date(mr.merged_at).toLocaleDateString()}</span>
                  </div>
                )}
                {mr.merged_by && (
                  <div className="flex justify-between">
                    <span>Merged by:</span>
                    <span>{mr.merged_by.name}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <ApprovalsPanel mrId={iid} />

          <div className="card bg-base-100 shadow">
            <div className="card-body">
              <h3 className="card-title">Labels</h3>
              {mr.labels.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {mr.labels.map((label: string) => (
                    <span key={label} className="badge badge-outline">
                      {label}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="text-gray-500">No labels</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}