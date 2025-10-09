// app/settings/pages.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { settingsFormSchema, type SettingsFormData } from '@/lib/config.shared';
import { useProjectStore } from '@/lib/project-store';

/* ---------- helpers ---------- */
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function validate(data: SettingsFormData): Partial<Record<keyof SettingsFormData, string>> {
  const res = settingsFormSchema.safeParse(data);
  if (res.success) return {};
  const errs: Partial<Record<keyof SettingsFormData, string>> = {};
  for (const e of res.error.issues) {
    const key = e.path[0] as keyof SettingsFormData;
    if (!errs[key]) errs[key] = e.message;
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
  gitlabToken: string;
  isActive: boolean;
}): SettingsFormData {
  return {
    name: fields.name,
    projectId: fields.projectId,
    gitlabToken: fields.gitlabToken,
    gitlabHost: normalizeHost(fields.hostInput),
    isActive:fields.isActive
  };
}

function shallowEqual(a: SettingsFormData, b: SettingsFormData) {
  return (
    a.name === b.name &&
    a.gitlabHost === b.gitlabHost &&
    String(a.projectId) === String(b.projectId) &&
    a.gitlabToken === b.gitlabToken
  );
}

/* ---------- main component ---------- */
export default function SettingsPage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const params = useSearchParams();
  const { setActiveProject } = useProjectStore();

  // NEW: flag from URL to force a fresh/blank form
  const isNew = params.get('new') === '1';

  /* server data (fetched once) — disabled when isNew */
  const { data: serverSettings, isLoading: isLoadingSettings } = useQuery({
    queryKey: ['projects'],
    enabled: !isNew, // <-- do not fetch when new=1
    queryFn: async () => {
      const res = await fetch('/api/projects', { cache: 'no-store' });
      if (!res.ok) {
        if (res.status === 404)
          return { name: '', gitlabHost: '', projectId: '', gitlabToken: '', isActive: false } as SettingsFormData;
        throw new Error('Failed to load settings');
      }
      const list: any[] = await res.json();
      const active = list.find((p) => p.isActive) ?? list[0] ?? null;
      if (!active)
        return { name: '', gitlabHost: '', projectId: '', gitlabToken: '', isActive: false } as SettingsFormData;
      return {
        userid: active.userid,
        name: active.name,
        gitlabHost: active.gitlabHost,
        projectId: String(active.projectId),
        gitlabToken: '', // never pre-fill token
        isActive: Boolean(active.isActive),
      } as SettingsFormData;
    },
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  /* local form state */
  const [name, setName] = useState('');
  const [hostInput, setHostInput] = useState('');
  const [projectId, setProjectId] = useState('');
  const [gitlabToken, setGitlabToken] = useState('');
  const [isActive, setIsActive] = useState(false);

  /* frozen snapshot – never changes after first load (edit mode only) */
  const serverSnapshot = useRef<SettingsFormData | null>(null);

  // HYDRATE from server once (only when not in new mode)
  useEffect(() => {
    if (isNew) return;
    if (!serverSettings) return;
    if (serverSnapshot.current) return; // already hydrated
    serverSnapshot.current = serverSettings;
    setName(serverSettings.name || '');
    setHostInput(serverSettings.gitlabHost || '');
    setProjectId(String(serverSettings.projectId ?? ''));
    setGitlabToken(serverSettings.gitlabToken || '');
    setIsActive(serverSettings.isActive ?? false);
  }, [serverSettings, isNew]);

  // NEW: when ?new=1, force-clear the form and reset local states
  useEffect(() => {
    if (!isNew) return;
    serverSnapshot.current = {
      name: '',
      gitlabHost: '',
      projectId: '',
      gitlabToken: '',
      isActive: false,
    }; // treat baseline as blank for dirty calc
    setName('');
    setHostInput('');
    setProjectId('');
    setGitlabToken('');
    setIsActive(false);
    setErrors({});
    setConnStatus('idle');
    setConnMessage('');
    setShowErrors(false);
    // also clear any cached 'projects' to avoid accidental hydration
    queryClient.removeQueries({ queryKey: ['projects'] });
  }, [isNew, queryClient]);

  const composed = useMemo(
    () => composeForm({ name, hostInput, projectId, gitlabToken, isActive }),
    [name, hostInput, projectId, gitlabToken]
  );

  const dirty = useMemo(
    () => !shallowEqual(serverSnapshot.current ?? ({} as SettingsFormData), composed),
    [composed]
  );

  /* validation & UI */
  const [errors, setErrors] = useState<ReturnType<typeof validate>>({});
  const [showErrors, setShowErrors] = useState(false);
  const [tokenVisible, setTokenVisible] = useState(false);
  const [connStatus, setConnStatus] = useState<'idle' | 'checking' | 'ok' | 'fail'>('idle');
  const [connMessage, setConnMessage] = useState('');

  /* mutations */
  const saveMutation = useMutation({
    mutationFn: async (payload: SettingsFormData) => {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          // ensure required name without altering the UI
          name: (payload.name ?? '').trim() || `project-${payload.projectId}`,
          // be explicit; server will also enforce (see B)
          isActive: false,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: async (_data) => {
      // 1. wipe the cache first
      // await queryClient.invalidateQueries({ queryKey: ['projects'] });
      // 2. change route only after cache is empty
      // setActiveProject(composed.projectId);
      router.push('/projects');
    },
  });

  /* actions */
  const testConnection = async () => {
    const v = validate(composed);
    if (Object.keys(v).length) {
      setErrors(v);
      setShowErrors(true);
      return;
    }
    setShowErrors(false);
    setConnStatus('checking');
    setConnMessage('');
    try {
      const res = await fetch('/api/projects/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: composed.name,
          gitlabHost: composed.gitlabHost,
          gitlabToken: composed.gitlabToken,
          projectId: composed.projectId,
        }),
      });
      await sleep(300);
      if (!res.ok) {
        const msg = (await res.text()) || 'Validation failed';
        setConnStatus('fail');
        setConnMessage(msg);
        return;
      }
      const data = await res.json();
      setConnStatus('ok');
      setConnMessage(data?.message ?? 'GitLab credentials are valid.');
    } catch {
      setConnStatus('fail');
      setConnMessage('Network error. Please try again.');
    }
  };

  const onSave = () => {
    const v = validate(composed);
    if (Object.keys(v).length) {
      setErrors(v);
      setShowErrors(true);
      return;
    }
    setShowErrors(false);
    saveMutation.mutate(composed);
  };

  const onReset = () => {
    if (isNew) {
      // In NEW mode, reset to an empty form
      setName('');
      setHostInput('');
      setProjectId('');
      setGitlabToken('');
      setIsActive(false);
    } else if (serverSnapshot.current) {
      // In EDIT mode, restore from server snapshot
      setName(serverSnapshot.current.name || '');
      setHostInput(serverSnapshot.current.gitlabHost || ''); // keep protocol
      setProjectId(String(serverSnapshot.current.projectId ?? ''));
      setGitlabToken(serverSnapshot.current.gitlabToken || '');
      setIsActive(serverSnapshot.current.isActive ?? false);
    }
    setErrors({});
    setConnStatus('idle');
    setConnMessage('');
    setShowErrors(false);
  };

  /* derived flags */
  const saveDisabled = !dirty || saveMutation.isPending;

  /* sticky bar visibility */
  const [showDirtyBar, setShowDirtyBar] = useState(false);
  useEffect(() => {
    const requiredFilled =
      name.trim() !== '' &&
      hostInput.trim() !== '' &&
      projectId.trim() !== '' &&
      gitlabToken.trim() !== '';
    if (!requiredFilled || saveMutation.isPending) {
      setShowDirtyBar(false);
      return;
    }
    const t = setTimeout(() => setShowDirtyBar(true), 10_0000);
    return () => clearTimeout(t);
  }, [name, hostInput, projectId, gitlabToken, saveMutation.isPending]);

  /* ---------- render ---------- */
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

        <div className="rounded-2xl border border-base-300/70 shadow-sm bg-base-100/80 backdrop-blur">
          <div className="p-6 border-b border-base-300/70 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">General</h2>
              <p className="text-sm text-base-content/70">Your app identifies the active project using these details.</p>
            </div>

            <div className="flex items-center gap-2">
              <StatusPill status={connStatus} />
              <button
                onClick={testConnection}
                disabled={connStatus === 'checking' || isLoadingSettings}
                className={clsx('btn btn-outline btn-sm h-10', connStatus === 'checking' && 'btn-disabled')}
              >
                {connStatus === 'checking' ? <span className="loading loading-spinner" /> : 'Test Connection'}
              </button>
              <button
                onClick={onSave}
                disabled={saveDisabled}
                className={clsx('btn btn-primary btn-sm h-10', saveDisabled && 'btn-disabled')}
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
                      onChange={e => setName(e.target.value)}
                    />
                  </Field>

                  <Field label="GitLab Host" error={showErrors ? errors.gitlabHost : undefined}>
                    <div className="join w-full">
                      <span className="join-item btn no-animation pointer-events-none h-12">https://</span>
                      <input
                        className="input input-bordered join-item w-full h-12"
                        placeholder="gitlab.company.com"
                        value={hostInput}
                        onChange={e => setHostInput(e.target.value)}
                      />
                    </div>
                  </Field>

                  <Field label="Project ID" error={showErrors ? errors.projectId : undefined}>
                    <input
                      className="input input-bordered w-full h-12"
                      placeholder="e.g., 12345 or group/project"
                      value={projectId}
                      onChange={e => setProjectId(e.target.value)}
                    />
                  </Field>

                  <Field label="Personal Access Token" error={showErrors ? errors.gitlabToken : undefined}>
                    <div className="join w-full">
                      <input
                        className="input input-bordered join-item w-full h-12 font-mono"
                        type={tokenVisible ? 'text' : 'password'}
                        placeholder="glpat-****************"
                        value={gitlabToken}
                        onChange={e => setGitlabToken(e.target.value)}
                      />
                      <button
                        type="button"
                        className="join-item btn h-12"
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => setTokenVisible(s => !s)}
                      >
                        {tokenVisible ? 'Hide' : 'Show'}
                      </button>
                    </div>
                  </Field>

                  <Field label="Is Active" error={showErrors ? errors.isActive : undefined}>
                    <input
                      type="checkbox"
                      className="toggle toggle-primary"
                      checked={isActive}
                      onChange={(e) => setIsActive(e.target.checked)}
                    />
                  </Field>
                </div>

                <div className="lg:col-span-5 space-y-6">
                  <div className="rounded-xl border border-base-300/70 p-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium">Connection</h3>
                      <StatusPill status={connStatus} />
                    </div>
                    <div className="mt-3 text-sm">
                      {connStatus === 'idle' && (
                        <p className="text-base-content/70">
                          Click <span className="kbd kbd-sm">Test Connection</span> to verify host, token, and project.
                        </p>
                      )}
                      {connStatus === 'checking' && (
                        <div className="flex items-center gap-2">
                          <span className="loading loading-spinner" />
                          <span>Contacting GitLab…</span>
                        </div>
                      )}
                      {connStatus === 'ok' && <p className="text-success">{connMessage || 'All good!'}</p>}
                      {connStatus === 'fail' && <p className="text-error">{connMessage || 'Could not validate credentials.'}</p>}
                    </div>
                  </div>

                  <div className="rounded-xl border border-base-300/70 p-4 bg-base-200/50">
                    <h3 className="font-medium">How to create a GitLab Personal Access Token</h3>
                    <ol className="mt-2 text-sm list-decimal list-inside space-y-2">
                      <li>Sign in to GitLab (your instance).</li>
                      <li>Open <b>User menu → Preferences</b>.</li>
                      <li>Go to <b>Access Tokens</b>.</li>
                      <li>Name it (e.g. “Sanitation App”), optional expiry.</li>
                      <li>Select scope <code className="kbd kbd-sm">api</code> (write not required).</li>
                      <li>Create the token, copy the value starting with <code>glpat-</code>.</li>
                      <li>Paste it in the field on the left.</li>
                    </ol>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Sticky Action Bar */}
      <div className={clsx('fixed inset-x-0 bottom-0 transition-all', showDirtyBar ? 'translate-y-0' : 'translate-y-full')}>
        <div className="container mx-auto px-4 pb-4">
          <div className="rounded-2xl shadow-lg border border-base-300/70 bg-base-100/95 backdrop-blur p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="text-sm">
              <span className="font-medium">Unsaved changes</span>
              <span className="text-base-content/70"> — Don’t forget to save your updates.</span>
            </div>
            <div className="flex gap-2">
              <button type="button" className="btn btn-ghost" onClick={onReset} disabled={saveMutation.isPending || isLoadingSettings}>
                Reset
              </button>
              <button
                type="button"
                className={clsx('btn btn-primary', saveDisabled && 'btn-disabled')}
                onClick={onSave}
                disabled={saveDisabled}
              >
                {saveMutation.isPending ? (
                  <>
                    <span className="loading loading-spinner" />
                    Saving…
                  </>
                ) : (
                  'Save Changes'
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- small components ---------- */
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
