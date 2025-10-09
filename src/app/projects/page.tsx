// src/app/projects/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import clsx from 'clsx';

type ProjectListItem = {
  userid: string;
  id: string;              // server: _id -> id (string)
  name: string;
  gitlabhost: string;      // e.g. https://gitlab.com
  projectid: string;       // UI uses string for display
  isactive: boolean;
  createdat?: string;
  updatedat?: string;
};

/* -------- cookie util (client-only) -------- */
function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()[\]\\/+^])/g, '\\$1') + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : null;
}

export default function ProjectsPage() {
  const qc = useQueryClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Read userid from cookie once on mount
  useEffect(() => {
    // change the cookie name if yours is different (e.g., 'session-id' -> you’d need an API to translate to userid)
    const uid = getCookie('userid');
    setUserId(uid && uid.trim() ? uid.trim() : null);
  }, []);

  // Fetch all projects; include userid in headers so your API can optionally use it
  const {
    data: projectsRaw = [],
    isLoading,
    error,
  } = useQuery<ProjectListItem[]>({
    queryKey: ['projects', 'list', userId ?? 'anon'],
    enabled: userId !== null, // wait until we read the cookie
    queryFn: async () => {
      const res = await fetch('/api/projects', {
        cache: 'no-store',
        headers: userId ? { 'x-user-id': userId } : undefined, // harmless if API ignores it
      });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      if (!Array.isArray(json)) return [];
      return (json as any[]).map((r): ProjectListItem => ({
        userid: r.userid,
        id: r.id,
        name: r.name,
        gitlabhost: r.gitlabhost,
        projectid: String(r.projectid),
        isactive: !!r.isactive,
        createdat: r.createdat,
        updatedat: r.updatedat,
      }));
    },
    staleTime: 0,
    refetchOnMount: 'always',
  });

  // Optional: filter client-side to only this user's projects (safe even if API already filters)
  const projects = useMemo(
    () => (userId ? projectsRaw.filter((p) => p.userid === userId) : []),
    [projectsRaw, userId]
  );
  const hasAny = projects.length > 0;

  // Set active — include userid so your API can verify/attach
  const setActive = useMutation({
    mutationFn: async (id: string) => {
      setActivatingId(id);
      const res = await fetch('/api/projects/active', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(userId ? { 'x-user-id': userId } : {}),
        },
        body: JSON.stringify({ id, userid: userId }), // include in body too if your API uses it
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSettled: async () => {
      setActivatingId(null);
      await qc.invalidateQueries({ queryKey: ['projects', 'list'] });
    },
  });

  // Validate by id (usually no userid needed, but pass if your API expects it)
  const testById = useMutation({
    mutationFn: async (id: string) => {
      setTestingId(id);
      const res = await fetch(`/api/projects/${id}/validate`, {
        method: 'POST',
        headers: userId ? { 'x-user-id': userId } : undefined,
      });
      const text = await res.text();
      if (!res.ok) throw new Error(text || 'Validation failed');
      try {
        return JSON.parse(text);
      } catch {
        return { valid: true, message: text || 'OK' };
      }
    },
    onSettled: () => setTestingId(null),
  });

  // Delete — include userid
  const del = useMutation({
    mutationFn: async (id: string) => {
      setDeletingId(id);
      const res = await fetch(`/api/projects/${id}`, {
        method: 'DELETE',
        headers: userId ? { 'x-user-id': userId } : undefined,
      });
      if (!res.ok) throw new Error(await res.text());
      return res.text();
    },
    onSettled: async () => {
      setDeletingId(null);
      await qc.invalidateQueries({ queryKey: ['projects', 'list'] });
    },
  });

  // Not logged in (no cookie)
  if (userId === null) {
    return (
      <div className="container mx-auto px-4 py-10">
        <div className="alert">
          <span>No user detected. Please <Link href="/login" className="link">log in</Link>.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      {/* Header */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-primary/10 to-transparent" />
        <div className="container mx-auto px-4 py-8 relative">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl md:text-3xl font-semibold">Projects</h1>
              <p className="text-base-content/70 mt-1">
                Manage your GitLab connections. Set an active project, validate, or edit details.
              </p>
            </div>
            <Link href="/settings?new=1" className="btn btn-primary">
              + New Project
            </Link>
          </div>
        </div>
      </section>

      {/* Content */}
      <section className="container mx-auto px-4 pb-20 pt-2">
        {isLoading ? (
          <CardsSkeleton />
        ) : error ? (
          <div className="alert alert-error rounded-2xl">
            <span>{String((error as any)?.message || 'Failed to load projects')}</span>
          </div>
        ) : hasAny ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {projects.map((p) => (
              <div key={p.id} className="card bg-base-100 border border-base-300/70 shadow-sm">
                <div className="card-body">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="card-title text-lg">
                        {p.name}
                        {p.isactive ? <span className="badge badge-success ml-2">Active</span> : null}
                      </h2>
                      <p className="text-sm text-base-content/70 mt-1">
                        <span className="font-medium">Host:</span>{' '}
                        <span className="font-mono">{p.gitlabhost || '—'}</span>
                      </p>
                      <p className="text-sm text-base-content/70">
                        <span className="font-medium">Project ID:</span>{' '}
                        <span className="font-mono">{p.projectid || '—'}</span>
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 text-xs text-base-content/60">
                    {p.updatedat ? (
                      <p>Updated: {new Date(p.updatedat).toLocaleString()}</p>
                    ) : p.createdat ? (
                      <p>Created: {new Date(p.createdat).toLocaleString()}</p>
                    ) : null}
                  </div>

                  <div className="card-actions justify-end mt-4">
                    <button
                      className={clsx('btn btn-outline btn-sm', testingId === p.id && 'btn-disabled')}
                      onClick={() => testById.mutate(p.id)}
                      disabled={testingId === p.id}
                      title="Validate connection on server"
                    >
                      {testingId === p.id ? <span className="loading loading-spinner" /> : 'Test'}
                    </button>

                    <Link href={`/settings?projectId=${encodeURIComponent(p.id)}`} className="btn btn-ghost btn-sm">
                      Edit
                    </Link>

                    <button
                      className={clsx('btn btn-secondary btn-sm', (p.isactive || activatingId === p.id) && 'btn-disabled')}
                      onClick={() => setActive.mutate(p.id)}
                      disabled={!!p.isactive || activatingId === p.id}
                      title={p.isactive ? 'Already active' : 'Set this as active'}
                    >
                      {activatingId === p.id ? <span className="loading loading-spinner" /> : 'Set Active'}
                    </button>

                    <button
                      className={clsx('btn btn-error btn-sm', deletingId === p.id && 'btn-disabled')}
                      onClick={() => del.mutate(p.id)}
                      disabled={deletingId === p.id}
                    >
                      {deletingId === p.id ? <span className="loading loading-spinner" /> : 'Delete'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState />
        )}
      </section>
    </div>
  );
}

/* ---------- UI bits ---------- */

function CardsSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="card bg-base-100 border border-base-300/70 shadow-sm">
          <div className="card-body animate-pulse">
            <div className="h-5 w-40 bg-base-300/70 rounded" />
            <div className="h-4 w-56 bg-base-300/70 rounded mt-3" />
            <div className="h-4 w-40 bg-base-300/70 rounded mt-2" />
            <div className="flex gap-2 justify-end mt-6">
              <div className="h-9 w-16 bg-base-300/70 rounded" />
              <div className="h-9 w-14 bg-base-300/70 rounded" />
              <div className="h-9 w-24 bg-base-300/70 rounded" />
              <div className="h-9 w-16 bg-base-300/70 rounded" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-base-300/70 bg-base-100 p-10 text-center">
    <h3 className="text-lg font-semibold">No projects yet</h3>
    <p className="text-base-content/70 mt-1">Create your first connection to get started.</p>
    <Link href="/settings?new=1" className="btn btn-primary mt-4">
      Add project
    </Link>
  </div>
  );
}
