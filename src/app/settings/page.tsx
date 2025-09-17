'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useProjectStore } from '@/lib/project-store';
import { settingsFormSchema, type SettingsFormData } from '@/lib/config';
import { useRouter } from 'next/navigation';

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const { setActiveProject } = useProjectStore();
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [formData, setFormData] = useState<SettingsFormData>({
    name: '',
    gitlabHost: '',
    projectId: '',
    gitlabToken: '',
  });

  // Check authentication and get user data
  const { data: userData, isLoading: authLoading } = useQuery({
    queryKey: ['current-user'],
    queryFn: async () => {
      const response = await fetch('/api/auth/me');
      if (!response.ok) {
        if (response.status === 401) {
          router.push('/login');
          return null;
        }
        throw new Error('Failed to get user info');
      }
      return response.json();
    },
    retry: false,
  });

  const { data: userProjects, isLoading: projectsLoading } = useQuery({
    queryKey: ['user-projects'],
    queryFn: async () => {
      if (!userData) return [];
      const response = await fetch('/api/projects');
      if (!response.ok) throw new Error('Failed to fetch projects');
      return response.json();
    },
    enabled: !!userData,
  });

  const { data: activeProject, isLoading: activeLoading } = useQuery({
    queryKey: ['user-active-project'],
    queryFn: async () => {
      if (!userData) return null;
      const response = await fetch('/api/projects/active');
      if (!response.ok) return null;
      return response.json();
    },
    enabled: !!userData,
  });

  const validateMutation = useMutation({
    mutationFn: async (data: SettingsFormData) => {
      const response = await fetch('/api/projects/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Validation failed');
      }
      
      return response.json();
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: SettingsFormData) => {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, save: true }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Save failed');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      setActiveProject(data.project.id);
      queryClient.invalidateQueries({ queryKey: ['user-projects'] });
      queryClient.invalidateQueries({ queryKey: ['user-active-project'] });
      setFormData({ name: '', gitlabHost: '', projectId: '', gitlabToken: '' });
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      await validateMutation.mutateAsync(formData);
      await saveMutation.mutateAsync(formData);
    } catch (error) {
      // Error handled by mutation
    }
  };

  

  const handleSetActiveProject = async (projectId: string) => {
    
    try {
      console.log('execute /api/projects/active',JSON.stringify({ projectId }))
      const response = await fetch('/api/projects/active', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      
      if (response.ok) {
        console.log('response okay')
        setActiveProject(projectId);
        queryClient.invalidateQueries({ queryKey: ['user-active-project'] });
      }
    } catch (error) {
      console.log('response not okay')
      console.error('Failed to set active project:', error);
    }
  };

  if (authLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-center">
          <span className="loading loading-spinner loading-lg"></span>
        </div>
      </div>
    );
  }

  if (!userData) {
    return null; // Will redirect to login
  }

  const isFirstTime = typeof window !== 'undefined' && window.location.search.includes('firstTime=true');

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto">
        {/* User Info Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold">Settings</h1>
            <p className="text-base-content/70">Logged in as {userData.username}</p>
          </div>
          <div className="flex gap-2">
            <span className="badge badge-primary">User ID: {userData.userId}</span>
            <button
              onClick={async () => {
                await fetch('/api/auth/logout', { method: 'POST' });
                router.push('/login');
              }}
              className="btn btn-ghost btn-sm"
            >
              Logout
            </button>
          </div>
        </div>

        {/* Welcome Message for First Time */}
        {isFirstTime && (
          <div className="alert alert-info mb-8">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="stroke-current shrink-0 w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <div>
              <h3 className="font-bold">Welcome! Let's get you started</h3>
              <p>Add your first GitLab project below to begin using the dashboard.</p>
            </div>
          </div>
        )}

        {/* Existing Projects List */}
        {userProjects && userProjects.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4">Your Projects</h2>
            <div className="space-y-4">
              {userProjects.map((project: any) => (
                <div key={project.id} className="card bg-base-100 shadow">
                  <div className="card-body p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-semibold">{project.name}</h3>
                        <p className="text-sm text-base-content/70">{project.gitlab_host} • {project.project_id}</p>
                        <p className="text-xs text-base-content/50">Added {new Date(project.created_at).toLocaleDateString()}</p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => {
                            setFormData({
                              name: project.name,
                              gitlabHost: project.gitlab_host,
                              projectId: project.project_id,
                              gitlabToken: '', // Don't show token
                            });
                          }}
                        >
                          Edit
                        </button>
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => handleSetActiveProject(project.id)}
                          disabled={activeProject?.id === project.id}
                        >
                          {activeProject?.id === project.id ? 'Active' : 'Select'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Add New Project Form */}
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body">
            <h2 className="card-title">{userProjects?.length > 0 ? 'Add New Project' : 'Configure First Project'}</h2>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="form-control">
                <label className="label">
                  <span className="label-text">Project Name</span>
                </label>
                <input
                  type="text"
                  placeholder="My GitLab Project"
                  className="input input-bordered"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>

              <div className="form-control">
                <label className="label">
                  <span className="label-text">GitLab Host</span>
                </label>
                <input
                  type="url"
                  placeholder="https://gitlab.com"
                  className="input input-bordered"
                  value={formData.gitlabHost}
                  onChange={(e) => setFormData({ ...formData, gitlabHost: e.target.value })}
                  required
                />
              </div>

              <div className="form-control">
                <label className="label">
                  <span className="label-text">Project ID</span>
                </label>
                <input
                  type="text"
                  placeholder="12345 or namespace/project"
                  className="input input-bordered"
                  value={formData.projectId}
                  onChange={(e) => setFormData({ ...formData, projectId: e.target.value })}
                  required
                />
              </div>

              <div className="form-control">
                <label className="label">
                  <span className="label-text">Personal Access Token</span>
                </label>
                <input
                  type="password"
                  placeholder="glpat-xxxxxxxxxxxxxxxxxxxx"
                  className="input input-bordered"
                  value={formData.gitlabToken}
                  onChange={(e) => setFormData({ ...formData, gitlabToken: e.target.value })}
                  required
                />
              </div>

              {validateMutation.error && (
                <div className="alert alert-error">
                  <span>{validateMutation.error.message}</span>
                </div>
              )}

              {validateMutation.data && (
                <div className="alert alert-success">
                  <span>
                    Connected as {validateMutation.data.user.name} (@{validateMutation.data.user.username})<br />
                    Project: {validateMutation.data.project.path_with_namespace}
                  </span>
                </div>
              )}

              <div className="card-actions justify-end">
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={validateMutation.isPending || saveMutation.isPending}
                >
                  {validateMutation.isPending || saveMutation.isPending ? (
                    <>
                      <span className="loading loading-spinner"></span>
                      Validating...
                    </>
                  ) : (
                    'Validate & Add Project'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}