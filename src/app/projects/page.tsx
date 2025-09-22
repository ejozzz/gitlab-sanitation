// src/app/projects/page.tsx
'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import clsx from 'clsx';

type ApiProjectRow =

    | {
        id: string;
        name: string;
        gitlabHost: string;          // e.g. https://gitlab.com
        projectId: string;
        createdAt?: string;
        updatedAt?: string;
        isActive?: boolean;
    };

type ProjectCardData = {
    id: string;
    name: string;
    gitlabHost: string;
    projectId: string;
    createdAt?: string;
    updatedAt?: string;
    isActive?: boolean;
};

function parseHostFromGitlabUrl(gitlab_url: string | undefined) {
    if (!gitlab_url) return '';
    try {
        const u = new URL(gitlab_url);
        return `${u.protocol}//${u.host}`;
    } catch {
        // fallback: if someone stored plain host already
        return gitlab_url.startsWith('http') ? gitlab_url : `https://${gitlab_url}`;
    }
}

/** Make whatever your /api/projects returns look like ProjectCardData */
function coerce(row: ApiProjectRow): ProjectCardData {

    // Already normalized?
    if ('gitlabHost' in row) {
        console.debug('id', row.id);
        console.debug('host', row.gitlabHost);
        console.debug('projectId', row.projectId);
        console.debug('name', row.name);
        return {
            id: row.id!,
            name: row.name,
            gitlabHost: row.gitlabHost,
            projectId: String((row as any).projectId ?? ''),
            createdAt: (row as any).createdAt,
            updatedAt: (row as any).updatedAt,
            isActive: (row as any).isActive,
        };
    }

    // Mongo raw row
    const id = String((row as any).id ?? (row as any).id ?? '');
    const host = parseHostFromGitlabUrl((row as any).gitlab_url);
    const projectId = String((row as any).projectId ?? (row as any).projectid ?? '');
    const name = String((row as any).name ?? (row as any).name ?? '');

    return {
        id,
        name,
        gitlabHost: host,
        projectId,
        createdAt: (row as any).created_at,
        updatedAt: (row as any).updated_at,
        isActive: (row as any).is_active,
    };
}

export default function ProjectsPage() {
    const qc = useQueryClient();
    const [testingId, setTestingId] = useState<string | null>(null);
    const [activatingId, setActivatingId] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    // GET all projects — make sure your API returns an array
    // e.g. your GET /api/projects handler should return:
    // [{ id, name, gitlab_url, projectid, created_at, updated_at, is_active }, ...]
    const { data, isLoading, error } = useQuery({
        queryKey: ['projects', 'list'],          // tiny key change triggers fresh fetch
        queryKey: ['nav-projects', activeProjectId],
        queryFn: async () => {
            const res = await fetch('/api/projects', { cache: 'no-store' });
            if (!res.ok) throw new Error(await res.text());
            const json = await res.json();
            if (!Array.isArray(json)) return [];
            return json.map((r) => ({
                id: String(r.id ?? r._id),
                name: r.name,
                gitlabHost: r.gitlabHost ?? r.gitlab_host ?? '',
                projectId: String(r.projectId ?? r.project_id),
                createdAt: r.createdAt ?? r.created_at,
                updatedAt: r.updatedAt ?? r.updated_at,
                isActive: r.isActive ?? r.is_active,
            }));
        },
        staleTime: 0,        // <— immediately consider data stale
        refetchOnMount: 'always',
    });

    // POST set active (you can implement as POST /api/projects/active with body { id })
    const setActive = useMutation({
        mutationFn: async (id: string) => {
            setActivatingId(id);
            const res = await fetch('/api/projects/active', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id }),
            });
            if (!res.ok) throw new Error(await res.text());
            return res.json();
        },
        onSettled: async () => {
            setActivatingId(null);
            await qc.invalidateQueries({ queryKey: ['projects'] });
        },
    });

    // Validate connection on server side by id (recommended)
    // Implement API: POST /api/projects/{id}/validate -> { valid, message }
    const testById = useMutation({
        mutationFn: async (id: string) => {
            setTestingId(id);
            const res = await fetch(`/api/projects/${id}/validate`, { method: 'POST' });
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

    // DELETE project
    const del = useMutation({
        mutationFn: async (id: string) => {
            setDeletingId(id);
            const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error(await res.text());
            return res.text();
        },
        onSettled: async () => {
            setDeletingId(null);
            await qc.invalidateQueries({ queryKey: ['projects'] });
        },
    });

    const projects = useMemo(() => data ?? [], [data]);
    const hasAny = projects.length > 0;

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
                        <Link href="/settings?firstTime=true" className="btn btn-primary">
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
                                                {p.isActive ? <span className="badge badge-success ml-2">Active</span> : null}
                                            </h2>
                                            <p className="text-sm text-base-content/70 mt-1">
                                                <span className="font-medium">Host:</span>{' '}
                                                <span className="font-mono">{p.gitlabHost || '—'}</span>
                                            </p>
                                            <p className="text-sm text-base-content/70">
                                                <span className="font-medium">Project ID:</span>{' '}
                                                <span className="font-mono">{p.projectId || '—'}</span>
                                            </p>
                                        </div>
                                    </div>

                                    <div className="mt-3 text-xs text-base-content/60">
                                        {p.updatedAt ? (
                                            <p>Updated: {new Date(p.updatedAt).toLocaleString()}</p>
                                        ) : p.createdAt ? (
                                            <p>Created: {new Date(p.createdAt).toLocaleString()}</p>
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
                                            className={clsx('btn btn-secondary btn-sm', (p.isActive || activatingId === p.id) && 'btn-disabled')}
                                            onClick={() => setActive.mutate(p.id)}
                                            disabled={!!p.isActive || activatingId === p.id}
                                            title={p.isActive ? 'Already active' : 'Set this as active'}
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
            <Link href="/settings?firstTime=true" className="btn btn-primary mt-4">
                Add project
            </Link>
        </div>
    );
}
