//app/components/ProjectSelector.tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { useProjectStore } from '@/lib/project-store';
import { useQueryClient } from '@tanstack/react-query';

export default function ProjectSelector() {
  const { activeProjectId, setActiveProject } = useProjectStore();
  const queryClient = useQueryClient();

  const { data: projects } = useQuery({
    queryKey: ['projects', activeProjectId],
    queryFn: async () => {
      const response = await fetch('/api/projects');
      if (!response.ok) throw new Error(await response.text());
      return response.json();                   // ← always return something
    },
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const handleProjectSelect = async (projectId: string, projectName: string) => {
    console.log('=== PROJECT SELECTOR - Selecting project ===');
    console.log('Project ID:', projectId);
    console.log('Project Name:', projectName);

    // Set the active project in the store
    setActiveProject(projectId);

    // Update the active project in the backend
    try {
      const response = await fetch('/api/projects/active', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activeProjectId: projectId }),
      });

      if (!response.ok) {
        throw new Error('Failed to update active project');
      }

      console.log('Successfully updated active project in backend');
    } catch (error) {
      console.error('Failed to update active project:', error);
    }

    // Force invalidate all queries to refresh data
    console.log('Invalidating all queries to refresh data');
    await queryClient.invalidateQueries({ queryKey: ['branches'] });
    await queryClient.invalidateQueries({ queryKey: ['cherry-picks'] });
    await queryClient.invalidateQueries({ queryKey: ['merge-requests'] });
    await queryClient.invalidateQueries({ queryKey: ['active-project-info'] });
  };

  if (!projects?.length) {
    return (
      <a href="/settings" className="btn btn-ghost btn-sm">
        Add Project
      </a>
    );
  }

  return (
    <div className="dropdown dropdown-end">
      <label tabIndex={0} className="btn btn-ghost btn-sm gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="w-4 h-4 stroke-current">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
        <span className="hidden sm:inline">{projects.find((p: any) => p.id === activeProjectId)?.name || 'Select Project'}</span>
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="w-4 h-4 stroke-current">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </label>

      <ul tabIndex={0} className="dropdown-content menu menu-compact p-2 shadow bg-base-100 rounded-box w-64 max-h-96 overflow-y-auto">
        <li className="menu-title">
          <span>Projects</span>
        </li>
        {projects.map((project: any) => (
          <li key={project.id}>
            <a
              className={`${activeProjectId === project.id ? 'active' : ''}`}
              onClick={() => handleProjectSelect(project.id, project.name)}
            >
              <div className="flex flex-col">
                <span className="font-medium">{project.name}</span>
                <span className="text-xs text-base-content/70">{project.gitlabHost}</span>
              </div>
              {activeProjectId === project.id && (
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </a>
          </li>
        ))}
        <div className="divider my-2"></div>
        <li>
          <a href="/settings" className="text-primary">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="w-4 h-4 stroke-current">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            Add New Project
          </a>
        </li>
      </ul>
    </div>
  );
}