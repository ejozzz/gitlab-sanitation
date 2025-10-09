// app/branches/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useProjectStore } from '@/lib/project-store';
import BranchTable from '@/components/BranchTable';
import BranchFilters from '@/components/BranchFilters';
import type { GitLabBranch } from '@/lib/gitlab-types';

const PAGE_SIZE = 20;

// ---------- tiny debounce ----------
function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ---------- types ----------
type BranchesResp = {
  branches: GitLabBranch[];
  total: number;
  totalPages?: number;
  page: number;
  perPage: number;
  hasNext?: boolean;
  hasPrev?: boolean;
  error?: string;
};

// ---------- page component ----------
export default function BranchesPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const debouncedSearch = useDebouncedValue(search, 300);
  const { activeProjectId, loaded } = useProjectStore();

  // reset to page 1 when search changes
  useEffect(() => setPage(1), [debouncedSearch]);

  // ---------- fetch branches ----------
  const { data, isLoading } = useQuery<BranchesResp>({
    queryKey: [
      'branches',
      {
        search: debouncedSearch,
        projectId: activeProjectId,
        page,
        perPage: PAGE_SIZE,
      },
    ],
    queryFn: async () => {
      if (!activeProjectId)
        return { branches: [], total: 0, totalPages: 1, page, perPage: PAGE_SIZE };

      const q = new URLSearchParams();
      if (debouncedSearch.trim()) q.set('search', debouncedSearch.trim());
      q.set('projectId', activeProjectId);
      q.set('page', String(page));
      q.set('perPage', String(PAGE_SIZE));

      const res = await fetch(`/api/gitlab/branches?${q.toString()}`, { cache: 'no-store' });
      if (!res.ok) {
        const txt = await res.text();
        return { branches: [], total: 0, totalPages: 1, page, perPage: PAGE_SIZE, error: txt || 'Failed to fetch branches' };
      }
      return res.json();
    },
    enabled: !!activeProjectId,
    keepPreviousData: true,
  });

  const branches = data?.branches ?? [];
  const total = data?.total ?? 0;
  const totalPagesFromApi = data?.totalPages;
  const hasNext = !!data?.hasNext;
  const hasPrev = !!data?.hasPrev;

  const pageCount = useMemo(() => {
    const apiPages = Number(totalPagesFromApi ?? 0);
    if (apiPages > 0) return apiPages;
    return Math.max(1, Math.ceil(total / PAGE_SIZE));
  }, [totalPagesFromApi, total]);

  // clamp page if count shrank (only after loading settles)
  useEffect(() => {
    if (!isLoading && page > pageCount) {
      setPage(pageCount);
    }
  }, [isLoading, page, pageCount]);

  // ---------- project info ----------
  const { data: projectInfo } = useQuery<null | {
    name: string;
    gitlabHost: string;
    projectId: string | number;
  }>({
    queryKey: ['active-project-info', activeProjectId],
    queryFn: async () => {
      if (!activeProjectId) return null;
      const r = await fetch(`/api/projects/${activeProjectId}`, { cache: 'no-store' });
      return r.ok ? r.json() : null;
    },
    enabled: !!activeProjectId,
  });

  // ---------- render ----------
  if (!loaded)
    return (
      <div className="grid h-screen place-content-center">
        <span className="loading loading-spinner loading-md" />
      </div>
    );

  if (!activeProjectId)
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <h1 className="text-3xl font-bold mb-4">No Project Selected</h1>
        <a href="/settings" className="btn btn-primary">
          Configure Projects
        </a>
      </div>
    );

  return (
    <div className="container mx-auto px-4 py-8">
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
        </div>
        <BranchFilters
          searchTerm={search}
          onSearchChange={setSearch}
        />
      </div>

      <BranchTable
        branches={branches}
        isLoading={isLoading}
        page={page}
        pageCount={pageCount}
        onPageChange={setPage}
        hasNext={hasNext}
        hasPrev={hasPrev}
      />
    </div>
  );
}
