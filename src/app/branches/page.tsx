'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useProjectStore } from '@/lib/project-store';
import BranchTable from '@/components/BranchTable';
import BranchFilters from '@/components/BranchFilters';
import BranchExistenceCheck from '@/components/BranchExistenceCheck';
import type { GitLabBranch } from '@/lib/gitlab-types';

export default function BranchesPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [daysThreshold, setDaysThreshold] = useState(30);
  const { activeProjectId } = useProjectStore();

  const { data: branches, isLoading, error } = useQuery<GitLabBranch[]>({
    queryKey: ['branches', searchTerm, activeProjectId],
    queryFn: async () => {
      if (!activeProjectId) return [];
      
      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);
      params.append('projectId', activeProjectId);
      
      const response = await fetch(`/api/gitlab/branches?${params}`);
      if (!response.ok) throw new Error('Failed to fetch branches');
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
          <p className="text-base-content/70 mb-8">Please select a project from the dropdown or configure one in settings to view branches.</p>
          <div className="flex gap-4 justify-center">
            <a href="/settings" className="btn btn-primary">
              Configure Projects
            </a>
            <a href="/" className="btn btn-ghost">
              Go Home
            </a>
          </div>
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
          <h1 className="text-3xl font-bold">{projectInfo.name} - Branches</h1>
          <p className="text-sm text-base-content/70">Project ID: {projectInfo.projectId}</p>
        </div>
      )}

      <div className="mb-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Branch Management</h2>
          <BranchExistenceCheck />
        </div>
        <BranchFilters
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          filter={filter}
          onFilterChange={setFilter}
          daysThreshold={daysThreshold}
          onDaysThresholdChange={setDaysThreshold}
        />
      </div>
      
      <BranchTable
        branches={branches || []}
        isLoading={isLoading}
        filter={filter}
        daysThreshold={daysThreshold}
      />
    </div>
  );
}