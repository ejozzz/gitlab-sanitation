// app/components/ProjectSelector.tsx
'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useProjectStore } from '@/lib/project-store';
import clsx from 'clsx';

type ApiProject = {
  userid?: string;
  id: string;
  name: string;
  gitlabhost?: string;   // server returns lower-case key
  gitlabHost?: string;   // safety for future camelCase
  projectid?: string;    // lower-case
  projectId?: string;    // safety
  isactive?: boolean;    // lower-case
  isActive?: boolean;    // safety
  createdat?: string;
  updatedat?: string;
};

type UiProject = {
  userid: string;
  id: string;
  name: string;
  gitlabHost: string;
  projectId: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
};

function normalize(p: ApiProject): UiProject {
  return {
    userid: String(p.userid ?? ''),
    id: String(p.id),
    name: p.name ?? '',
    gitlabHost: String(p.gitlabHost ?? p.gitlabhost ?? ''),
    projectId: String(p.projectId ?? p.projectid ?? ''),
    isActive: Boolean(p.isActive ?? p.isactive ?? false),
    createdAt: p.createdat,
    updatedAt: p.updatedat,
  };
}

export default function ProjectSelector() {
  const { activeProjectId, setActiveProject } = useProjectStore();
  const qc = useQueryClient();

  // Use a stable key like ['projects','list'] so it's easy to invalidate consistently
  const { data: projects = [] } = useQuery<UiProject[]>({
    queryKey: ['projects', 'list'],
    queryFn: async () => {
      const res = await fetch('/api/projects', { cache: 'no-store' });
      if (!res.ok) throw new Error(await res.text());
      const json = (await res.json()) as ApiProject[] | unknown;
      if (!Array.isArray(json)) return [];
      return (json as ApiProject[]).map(normalize);
    },
    staleTime: 0,
    refetchOnMount: 'always',
  });

  // Prefer store value; if not set, fall back to the server's active
  const labelProjectName =
    projects.find((p) => p.id === activeProjectId)?.name ??
    projects.find((p) => p.isActive)?.name ??
    'Select Project';

  const setActive = useMutation({
    mutationFn: async (projectId: string) => {
      // optimistic update in store
      setActiveProject(projectId);

      const res = await fetch('/api/projects/active', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // API accepts any of { activeProjectId | id | projectId }
        body: JSON.stringify({ id: projectId }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: async (_data, projectId) => {
      // Optimistically flip isActive in the list cache
      qc.setQueryData<UiProject[]>(['projects', 'list'], (old) => {
        if (!old) return old as any;
        return old.map((p) => (p.id === projectId ? { ...p, isActive: true } : { ...p, isActive: false }));
      });

      // Now ensure everything refetches from server truth
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['projects', 'list'] }),
        qc.invalidateQueries({ queryKey: ['active-project-info'] }),
        qc.invalidateQueries({ queryKey: ['branches'] }),
        qc.invalidateQueries({ queryKey: ['cherry-picks'] }),
        qc.invalidateQueries({ queryKey: ['merge-requests'] }),
      ]);
    },
    onError: async (_err, _projectId, _ctx) => {
      // if backend failed, just refetch to get the real state
      await qc.invalidateQueries({ queryKey: ['projects', 'list'] });
    },
  });

  if (!projects.length) {
    return (
      <a href="/settings" className="btn btn-primary btn-sm h-10 hidden sm:inline-flex">
        + Add Project
      </a>
    );
  }

  return (
    <div className="dropdown dropdown-end">
      <label tabIndex={0} className="btn btn-ghost btn-sm gap-2">
        {/* icon */}
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 stroke-current" fill="none" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
        <span className="hidden sm:inline">{labelProjectName}</span>
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 stroke-current" fill="none" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </label>

      <ul tabIndex={0} className="dropdown-content menu menu-compact p-2 shadow bg-base-100 rounded-box w-64 max-h-96 overflow-y-auto">
        <li className="menu-title">
          <span>Projects</span>
        </li>

        {projects.map((project) => {
          const isActiveHere = project.id === activeProjectId || project.isActive;
          return (
            <li key={project.id}>
              <button
                className={clsx(isActiveHere && 'active')}
                onClick={() => setActive.mutate(project.id)}
              >
                <div className="flex flex-col">
                  <span className="font-medium">{project.name}</span>
                  <span className="text-xs text-base-content/70">{project.gitlabHost}</span>
                </div>
                {isActiveHere && (
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            </li>
          );
        })}

        <div className="divider my-2" />
        <li>
          <a href="/settings?new=1" className="text-primary">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 stroke-current" fill="none" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            Add New Project
          </a>
        </li>
      </ul>
    </div>
  );
}
