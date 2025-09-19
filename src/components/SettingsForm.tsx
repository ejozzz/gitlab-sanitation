'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { settingsFormSchema, type SettingsFormData } from '@/lib/config.shared';

export default function SettingsForm() {
  const [formData, setFormData] = useState<SettingsFormData>({
    name: '',         
    gitlabHost: '',
    projectId: '',
    gitlabToken: '',
  });

  const { data: configStatus } = useQuery({
    queryKey: ['config'],
    queryFn: async () => {
      const response = await fetch('/api/config');
      return response.json();
    },
  });

  const validateMutation = useMutation({
    mutationFn: async (data: SettingsFormData) => {
      const response = await fetch('/api/config', {
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
      const response = await fetch('/api/config', {
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
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      // Validate first
      const validationResult = await validateMutation.mutateAsync(formData);

      // Then save
      await saveMutation.mutateAsync(formData);

      // Reset form with success
      setFormData({ ...formData, gitlabToken: '' });
    } catch (error) {
      // Error is handled by mutation
    }
  };

  return (
    <div className="card bg-base-100 shadow-xl">
      <div className="card-body">
        <h2 className="card-title">GitLab Configuration</h2>

        {configStatus?.configured && (
          <div className="alert alert-info">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="stroke-current shrink-0 w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <span>Configuration is set. Last updated: {new Date(configStatus.updatedAt).toLocaleString()}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
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
              <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{validateMutation.error.message}</span>
            </div>
          )}

          {validateMutation.data && (
            <div className="alert alert-success">
              <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
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
                'Validate & Save'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}