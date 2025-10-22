// src/app/settings/page.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { settingsFormSchema, type SettingsFormData } from '@/lib/config.shared';
import { useProjectStore } from '@/lib/project-store';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function validate(data: SettingsFormData): Partial<Record<keyof SettingsFormData, string>> {
  const res = settingsFormSchema.safeParse(data);
  if (res.success) return {};
  const errs: Partial<Record<keyof SettingsFormData, string>> = {};
  for (const issue of res.error.issues) {
    const path = issue.path?.[0] as keyof SettingsFormData | undefined;
    if (path) errs[path] = issue.message;
  }
  return errs;
}

function normalizeHost(raw: string) {
  const t = raw.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  return t ? `https://${t}` : '';
}

function composeForm(fields: {
  name: string;
  hostInput: string;
  projectId: string;
  gitlabToken: string; // may be masked sentinel
  isActive: boolean;
}): SettingsFormData {
  return {
    name: fields.name,
    projectId: fields.projectId,
    gitlabToken: fields.gitlabToken,
    gitlabHost: normalizeHost(fields.hostInput),
    isActive: fields.isActive,
  };
}

function shallowEqual(a: SettingsFormData, b: SettingsFormData) {
  return (
    a.name === b.name &&
    a.gitlabHost === b.gitlabHost &&
    String(a.projectId) === String(b.projectId) &&
    a.gitlabToken === b.gitlabToken &&
    !!a.isActive === !!b.isActive
  );
}

// ---- Masking helpers ----
const mask = (last4?: string | null) =>
  last4 ? `glpat-${'•'.repeat(12)}${String(last4)}` : '';

const isMasked = (value: string, last4?: string | null) =>
  !!last4 && value === mask(last4);

type ServerProject = {
  id: string;
  name: string;
  gitlabHost: string;
  projectId: string;
  isActive: boolean;
  hasToken?: boolean;
  tokenLast4?: string | null;
};

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const params = useSearchParams();
  const { setActiveProject } = useProjectStore();

  const isNew = params.get('new') === '1';

  const { data: projects, isLoading: isLoadingSettings } = useQuery({
    queryKey: ['projects'],
    enabled: !isNew,
    queryFn: async (): Promise<ServerProject[]> => {
      const res = await fetch('/api/projects', { cache: 'no-store' });
      if (!res.ok) {
        if (res.status === 404) return [];
        throw new Error('Failed to load settings');
      }
      const list = (await res.json()) as any[];

      return list.map((r) => ({
        id: String(r.id ?? r._id ?? ''),
        name: r.name ?? '',
        gitlabHost:
          typeof r.gitlabhost === 'string'
            ? r.gitlabhost
            : typeof r.gitlab_url === 'string' && r.gitlab_url.includes('/api/v4/projects/')
            ? r.gitlab_url.split('/api/v4/projects/')[0]
            : '',
        projectId: String(r.projectid ?? r.projectId ?? ''),
        isActive: !!(r.isactive ?? r.isActive),
        hasToken: !!(r.hasToken ?? r.token ?? r.token_encrypted),
        tokenLast4: r.tokenLast4 ?? r.token_last4 ?? null,
      }));
    },
  });

  const current = useMemo(() => {
    if (isNew) return null;
    const list = projects ?? [];
    return list.find((p) => p.isActive) ?? list[0] ?? null;
  }, [projects, isNew]);

  const [name, setName] = useState('');
  const [hostInput, setHostInput] = useState('');
  const [projectId, setProjectId] = useState('');
  const [gitlabToken, setGitlabToken] = useState(''); // may hold masked sentinel
  const [isActive, setIsActive] = useState(false);
  const [tokenVisible, setTokenVisible] = useState(false);
  const [connStatus, setConnStatus] = useState<'idle' | 'checking' | 'ok' | 'fail'>('idle');
  const [connMessage, setConnMessage] = useState('');
  const [errors, setErrors] = useState<ReturnType<typeof validate>>({});
  const [showErrors, setShowErrors] = useState(false);

  const serverSnapshot = useRef<SettingsFormData | null>(null);
  const last4Ref = useRef<string | null>(null);

  useEffect(() => {
    if (isNew || !current) {
      serverSnapshot.current = {
        name: '',
        gitlabHost: '',
        projectId: '',
        gitlabToken: '',
        isActive: false,
      };
      last4Ref.current = null;
      setName('');
      setHostInput('');
      setProjectId('');
      setGitlabToken('');
      setIsActive(false);
      setConnStatus('idle');
      setConnMessage('');
      setErrors({});
      setShowErrors(false);
      queryClient.removeQueries({ queryKey: ['projects'] });
      return;
    }

    const snap: SettingsFormData = {
      name: current.name,
      gitlabHost: current.gitlabHost,
      projectId: current.projectId,
      gitlabToken: '', // never snapshot plaintext
      isActive: current.isActive,
    };
    serverSnapshot.current = snap;

    last4Ref.current = current.tokenLast4 ?? null;

    setName(current.name);
    setHostInput(current.gitlabHost.replace(/^https?:\/\//, ''));
    setProjectId(String(current.projectId));
    setGitlabToken(current.hasToken ? mask(current.tokenLast4) : '');
    setIsActive(!!current.isActive);
    setConnStatus('idle');
    setConnMessage('');
    setErrors({});
    setShowErrors(false);
  }, [current, isNew, queryClient]);

  const composed = useMemo(
    () =>
      composeForm({
        name,
        hostInput,
        projectId,
        gitlabToken,
        isActive,
      }),
    [name, hostInput, projectId, gitlabToken, isActive]
  );

  const dirty = useMemo(
    () => !shallowEqual(serverSnapshot.current ?? ({} as SettingsFormData), composed),
    [composed]
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      // If token input is the masked sentinel, omit it so backend keeps existing encrypted token.
      const omitToken = isMasked(composed.gitlabToken, last4Ref.current);
      const body: any = {
        name: composed.name,
        gitlabHost: composed.gitlabHost,
        projectId: composed.projectId,
        isActive: composed.isActive,
      };
      if (!omitToken && composed.gitlabToken) {
        body.gitlabToken = composed.gitlabToken;
      }

      if (current?.id) {
        const res = await fetch(`/api/projects/${current.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (res.status === 404 || res.status === 405) {
          const postRes = await fetch('/api/projects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          if (!postRes.ok) throw new Error(await postRes.text());
          return postRes.json();
        }
        if (!res.ok) throw new Error(await res.text());
        return res.json();
      } else {
        const res = await fetch('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(await res.text());
        return res.json();
      }
    },
    onSuccess: async () => {
      if (isActive && projectId) setActiveProject(projectId);
      await queryClient.invalidateQueries({ queryKey: ['projects'] });
      serverSnapshot.current = {
        ...composed,
        gitlabToken: '', // never store plaintext in snapshot
      };
      setShowErrors(false);
    },
  });

  const onTest = async () => {
    setConnStatus('checking');
    setConnMessage('');
    try {
      const omit = isMasked(composed.gitlabToken, last4Ref.current);
      const tokenForTest = omit ? '' : composed.gitlabToken;
      const res = await fetch('/api/projects/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gitlabToken: tokenForTest }),
      });
      await sleep(250);
      if (!res.ok) {
        const msg = (await res.text()) || 'Validation failed';
        setConnStatus('fail');
        setConnMessage(msg);
        return;
      }
      const data = await res.json();
      setConnStatus('ok');
      setConnMessage(data?.message ?? (omit ? 'Existing token kept.' : 'Token looks good.'));
    } catch {
      setConnStatus('fail');
      setConnMessage('Network error. Please try again.');
    }
  };

  const onSave = () => {
    const v = validate({
      ...composed,
      // If masked, treat as empty for validation (we keep old token).
      gitlabToken: isMasked(composed.gitlabToken, last4Ref.current) ? '' : composed.gitlabToken,
    });
    setErrors(v);
    if (Object.keys(v).length) {
      setShowErrors(true);
      return;
    }
    saveMutation.mutate();
  };

  const [showDirtyBar, setShowDirtyBar] = useState(false);
  useEffect(() => {
    if (!dirty || saveMutation.isPending) {
      setShowDirtyBar(false);
      return;
    }
    const t = setTimeout(() => setShowDirtyBar(true), 1200);
    return () => clearTimeout(t);
  }, [dirty, saveMutation.isPending]);

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-primary/10 to-transparent" />
        <div className="container mx-auto px-4 py-8 relative">
          <h1 className="text-2xl md:text-3xl font-semibold">Project Settings</h1>
          <p className="text-base-content/70 mt-1">Configure your GitLab connection and project defaults.</p>
        </div>
      </section>

      <section className="container mx-auto px-4 pb-28 pt-2">
        {showErrors && !!Object.keys(errors).length && (
          <div className="alert alert-warning mb-4 rounded-2xl">
            <div>
              <span className="font-medium">Please review:</span>
              <ul className="list-disc list-inside text-sm">
                {Object.entries(errors).map(([k, v]) => (
                  <li key={k}>
                    <span className="badge badge-ghost mr-2">{k}</span>
                    {v}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-base-300/70 bg-base-100/80 shadow-sm">
          <div className="border-b border-base-300/70 px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <StatusPill status={connStatus} />
              <span className="text-sm opacity-70">
                {isNew ? 'Creating new project settings' : current ? `Editing: ${current.name}` : 'No project found'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className={clsx('btn btn-outline btn-sm', saveMutation.isPending && 'btn-disabled')}
                onClick={onTest}
                disabled={saveMutation.isPending}
                title="If the token is masked, we keep the existing token."
              >
                Test Connection
              </button>
              <button
                type="button"
                className={clsx('btn btn-primary btn-sm', saveMutation.isPending && 'btn-disabled')}
                onClick={onSave}
              >
                {saveMutation.isPending ? (
                  <>
                    <span className="loading loading-spinner" />
                    Saving…
                  </>
                ) : (
                  'Save'
                )}
              </button>
            </div>
          </div>

          <div className="p-6">
            {isLoadingSettings && !isNew ? (
              <LoadingSkeleton />
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-7 space-y-6">
                  <Field label="Project Name" error={showErrors ? errors.name : undefined}>
                    <input
                      className="input input-bordered w-full h-12"
                      placeholder="e.g., GitLab — Internal"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </Field>

                  <Field label="GitLab Host" error={showErrors ? errors.gitlabHost : undefined}>
                    <div className="join w-full">
                      <span className="join-item btn no-animation pointer-events-none h-12">https://</span>
                      <input
                        className="input input-bordered join-item w-full h-12"
                        placeholder="gitlab.example.com"
                        value={hostInput}
                        onChange={(e) => setHostInput(e.target.value)}
                      />
                    </div>
                  </Field>

                  <Field label="Project ID" error={showErrors ? errors.projectId : undefined}>
                    <input
                      className="input input-bordered w-full h-12"
                      placeholder="e.g., 12345"
                      value={projectId}
                      onChange={(e) => setProjectId(e.target.value)}
                    />
                  </Field>

                  <Field label="Personal Access Token" error={showErrors ? errors.gitlabToken : undefined}>
                    <div className="join w-full">
                      <input
                        className="input input-bordered join-item w-full h-12 font-mono"
                        type={tokenVisible ? 'text' : 'password'}
                        placeholder="glpat-****************"
                        value={gitlabToken}
                        onChange={(e) => setGitlabToken(e.target.value)}
                      />
                      <button
                        type="button"
                        className="join-item btn h-12"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => setTokenVisible((s) => !s)}
                        title="Toggle visibility of the current input (masked by default)."
                      >
                        {tokenVisible ? 'Hide' : 'Show'}
                      </button>
                    </div>
                    {last4Ref.current ? (
                      <p className="text-xs opacity-70 mt-1">
                        Stored token present • ending with <b>{last4Ref.current}</b>. Leave as is to keep it, or paste a new token to replace.
                      </p>
                    ) : (
                      <p className="text-xs opacity-70 mt-1">No token stored yet.</p>
                    )}
                  </Field>

                  <Field label="Is Active">
                    <input
                      type="checkbox"
                      className="toggle toggle-primary"
                      checked={isActive}
                      onChange={(e) => setIsActive(e.target.checked)}
                    />
                  </Field>
                </div>

                <div className="lg:col-span-5 space-y-4">
                  <div className="rounded-xl border border-base-300/70 p-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium">Connection Status</h3>
                      <StatusPill status={connStatus} />
                    </div>
                    <div className="mt-2 min-h-6">
                      {connStatus === 'checking' && (
                        <div className="flex items-center gap-2 text-sm opacity-70">
                          <span className="loading loading-spinner loading-sm" />
                          <span>Contacting GitLab…</span>
                        </div>
                      )}
                      {connStatus === 'ok' && <p className="text-success">{connMessage || 'All good!'}</p>}
                      {connStatus === 'fail' && (
                        <p className="text-error">{connMessage || 'Could not validate credentials.'}</p>
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl border border-base-300/70 p-4 bg-base-200/50">
                    <h3 className="font-medium">How to create a GitLab Personal Access Token</h3>
                    <ol className="mt-2 text-sm list-decimal list-inside space-y-2">
                      <li>Sign in to your GitLab instance.</li>
                      <li>Open <b>User menu → Preferences</b>.</li>
                      <li>Go to <b>Access Tokens</b>.</li>
                      <li>Name it (e.g. “Sanitation App”), optional expiry.</li>
                      <li>Select scope <code className="kbd kbd-sm">api</code>.</li>
                      <li>Create the token and paste it here.</li>
                    </ol>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <div className={clsx('fixed inset-x-0 bottom-0 transition-all', showDirtyBar ? 'translate-y-0' : 'translate-y-full')}>
        <div className="container mx-auto px-4 pb-4">
          <div className="mx-auto max-w-3xl rounded-2xl shadow-lg bg-base-100 border border-base-300/70">
            <div className="px-6 py-3 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-sm">
                <span className="badge badge-warning">Unsaved</span>
                <span className="opacity-70">You have unsaved changes.</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    const snap = serverSnapshot.current;
                    if (!snap) return;
                    setName(snap.name);
                    setHostInput(snap.gitlabHost.replace(/^https?:\/\//, ''));
                    setProjectId(String(snap.projectId));
                    setGitlabToken(last4Ref.current ? mask(last4Ref.current) : '');
                    setIsActive(!!snap.isActive);
                  }}
                >
                  Discard
                </button>
                <button type="button" className="btn btn-primary btn-sm" onClick={onSave}>
                  Save changes
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: 'idle' | 'checking' | 'ok' | 'fail' }) {
  const map = {
    idle: { text: 'Not checked', cls: 'badge-ghost' },
    checking: { text: 'Checking…', cls: 'badge-info' },
    ok: { text: 'Connected', cls: 'badge-success' },
    fail: { text: 'Failed', cls: 'badge-error' },
  } as const;
  const m = map[status];
  return <span className={clsx('badge', m.cls)}>{m.text}</span>;
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="form-control">
      <label className="label">
        <span className="label-text font-medium">{label}</span>
      </label>
      {children}
      <div className="min-h-6 mt-1">{error ? <p className="text-error text-sm">{error}</p> : null}</div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-pulse">
      <div className="lg:col-span-7 space-y-6">
        <div className="h-6 w-40 bg-base-300/70 rounded" />
        <div className="h-12 w-full bg-base-300/70 rounded" />
        <div className="h-6 w-40 bg-base-300/70 rounded" />
        <div className="h-12 w-full bg-base-300/70 rounded" />
      </div>
      <div className="lg:col-span-5 space-y-6">
        <div className="h-40 w-full bg-base-300/70 rounded-xl" />
      </div>
    </div>
  );
}
