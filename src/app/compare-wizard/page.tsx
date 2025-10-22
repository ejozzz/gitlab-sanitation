'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useDebouncedCallback } from 'use-debounce';
import Link from 'next/link';

/* =========================
   Types
   ========================= */

type ProjectLike = {
  _key: string;
  name?: string;
  path_with_namespace?: string;
  projectId?: string | number;
  id?: string | number;
  _id?: string | number;
};

type BranchHit = {
  name: string;
  web_url?: string;
  [k: string]: any;
};

type ContainsResult = {
  branch: string;
  method: 'compare';
  results: {
    target: string;
    included: boolean;
    via?: 'compare' | 'search' | 'none';
    missingCount?: number;
    missingSample?: { id: string; short_id: string; title?: string }[];
    web_url?: string;
  }[];
};

type WatchlistResp = { source: 'env' | 'default'; branches: string[] };

type WizardExecRow = {
  pid: string;
  projectName: string;
  sourceBranch: string;
  contains: ContainsResult;
  error?: string | null;
  _key: string;       // UI _key for project
  term?: string;      // which search term this row came from
};

/* =========================
   Helpers
   ========================= */

function pickApiProjectId(p: ProjectLike): string {
  const raw =
    p.projectId ??
    p.id ??
    (typeof p._id === 'object' ? (p._id as any)?.toString?.() : p._id) ??
    '';
  return String(raw ?? '').trim();
}

function projectLabel(p: ProjectLike): string {
  return p.name ?? p.path_with_namespace ?? pickApiProjectId(p) ?? p._key ?? 'Project';
}

function withQuery(base: string, q: Record<string, string | number | undefined>) {
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'http://localhost';
  const u = new URL(base, origin);
  for (const [k, v] of Object.entries(q)) {
    if (v !== undefined && v !== null && String(v).length > 0) {
      u.searchParams.set(k, String(v));
    }
  }
  return u.toString();
}

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    cache: 'no-store',
    credentials: 'same-origin',
    ...init,
  });

  const ct = res.headers.get('content-type') || '';
  if (!ct.toLowerCase().includes('application/json')) {
    const text = await res.text();
    const snippet = text.slice(0, 300);
    const hint =
      snippet.startsWith('<!DOCTYPE') || snippet.startsWith('<html')
        ? 'Server returned HTML (likely a login/redirect or error page).'
        : 'Server did not return JSON.';
    throw new Error(`${hint} status=${res.status}. First 300 chars:\n${snippet}`);
  }

  if (!res.ok) {
    let body: any = {};
    try { body = await res.json(); } catch { }
    throw new Error(`HTTP ${res.status}: ${body?.error ?? 'Request failed'}`);
  }

  return (await res.json()) as T;
}

// Evidence helpers (same semantics as /branches/[branch]/page.tsx)
function deriveEvidenceTerm(featureBranch: string): string {
  const numeric = featureBranch.match(/(\d{4,})/);
  if (numeric?.[1]) return numeric[1];
  const lastSeg = featureBranch.split('/').pop();
  return lastSeg && lastSeg.trim().length > 0 ? lastSeg : featureBranch;
}

function makeEvidenceHref(sourceBranch: string, targetBranch: string, pid?: string) {
  const base = `/branches/${encodeURIComponent(sourceBranch)}/evidence`;
  const qs = new URLSearchParams();
  qs.set('branch', targetBranch);                  // main branch to compare against
  qs.set('q', deriveEvidenceTerm(sourceBranch));   // evidence term derived from source feature branch
  if (pid) qs.set('projectId', pid);               // pass pid (harmless if page ignores it)
  return `${base}?${qs.toString()}`;
}


/* =========================
   Local state shapes
   ========================= */

// Per project (pid) → per term → hits[]
type ResultsByPidByTerm = Record<string, Record<string, BranchHit[]>>;

// Per project (_key) → per term → chosen branch name
type ChosenByKeyByTerm = Record<string, Record<string, string>>;

const DebugBlock: React.FC<{ title: string; items: string[] }> = ({ title, items }) => {
  if (!items || items.length === 0) return null;
  return (
    <div className="mt-4 rounded-xl border border-base-300 bg-base-200 p-3">
      <div className="font-semibold opacity-70">{title}</div>
      <ul className="mt-2 text-xs opacity-80 space-y-1">
        {items.map((t, i) => (
          <li key={i} className="break-all">{t}</li>
        ))}
      </ul>
    </div>
  );
};

/* =========================
   Page
   ========================= */

export default function CompareWizardPage() {
  // Projects (Step 1)
  const projectsQuery = useQuery<ProjectLike[]>({
    queryKey: ['projects:list'],
    queryFn: async () => {
      const res = await fetch('/api/projects', { cache: 'no-store' });
      if (!res.ok) throw new Error(`Failed to load projects (${res.status})`);
      const items: any[] = await res.json();
      return (items ?? []).map((p, i) => ({
        ...p,
        _key: p._key ?? `${String(p.projectId ?? p.id ?? p._id ?? i)}-${i}`,
      })) as ProjectLike[];
    },
    staleTime: 15_000,
  });

  const projects = useMemo(() => projectsQuery.data ?? [], [projectsQuery.data]);

  // Wizard state
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);

  // MULTI-TERM SEARCH STATE
  const [searchInput, setSearchInput] = useState<string>(''); // text in the box
  const [searchTerms, setSearchTerms] = useState<string[]>([]); // chips/tags
  const [searching, setSearching] = useState<boolean>(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // results per pid per term
  const [resultsByPidByTerm, setResultsByPidByTerm] = useState<ResultsByPidByTerm>({});

  // chosen per _key per term
  const [chosenByKeyByTerm, setChosenByKeyByTerm] = useState<ChosenByKeyByTerm>({});

  // Exec
  const [executing, setExecuting] = useState<boolean>(false);
  const [execError, setExecError] = useState<string | null>(null);
  const [execData, setExecData] = useState<WizardExecRow[]>([]);
  const searchCallsRef = useRef<string[]>([]);
  const execCallsRef = useRef<string[]>([]);

  // Watchlist (same as /branches/[branch]/page.tsx)
  const watchlistQuery = useQuery<WatchlistResp>({
    queryKey: ['watchlist-env'],
    queryFn: async () => {
      const res = await fetch('/api/watchlist', { cache: 'no-store' });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    staleTime: 60_000,
  });
  const watchlistBranches = useMemo(() => watchlistQuery.data?.branches ?? [], [watchlistQuery.data]);

  // Selected projects + resolved pid (for API use)
  const selectedProjects = useMemo((): (ProjectLike & { __pid: string })[] => {
    const set = new Set(selectedKeys);
    const raw = projects.filter(p => set.has(p._key));
    const withPid = raw
      .map(p => ({ ...p, __pid: pickApiProjectId(p) }))
      .filter(p => p.__pid && p.__pid.length > 0);

    return withPid as (ProjectLike & { __pid: string })[];
  }, [projects, selectedKeys]);

  // Reset results/selections when terms or selection change
  useEffect(() => {
    setResultsByPidByTerm({});
    setChosenByKeyByTerm(prev => {
      // prune removed projects/terms but keep existing picks for still-present ones
      const keepKeys = new Set(selectedKeys);
      const keepTerms = new Set(searchTerms);
      const next: ChosenByKeyByTerm = {};
      for (const [_key, perTerm] of Object.entries(prev)) {
        if (!keepKeys.has(_key)) continue;
        for (const [term, branch] of Object.entries(perTerm || {})) {
          if (!keepTerms.has(term)) continue;
          next[_key] = next[_key] || {};
          next[_key][term] = branch;
        }
      }
      return next;
    });
    searchCallsRef.current = [];
  }, [searchTerms.join('|'), selectedKeys.join('|')]);

  const toggleProject = useCallback((k: string) => {
    setSelectedKeys(prev => {
      const set = new Set(prev);
      if (set.has(k)) set.delete(k);
      else set.add(k);
      return Array.from(set);
    });
  }, []);

  /* =========================
     Step 2: multi-term search
     ========================= */

  // Add term from input on Enter
  const addTermFromInput = useCallback(() => {
    const t = searchInput.trim();
    if (t.length < 2) return;
    setSearchTerms(prev => (prev.includes(t) ? prev : [...prev, t]));
    setSearchInput('');
  }, [searchInput]);

  // Remove a term chip
  const removeTerm = useCallback((term: string) => {
    setSearchTerms(prev => prev.filter(t => t !== term));
  }, []);

  // Execute search across all terms & selected projects
  const executeSearch = useCallback(async () => {
    if (searchTerms.length === 0 || selectedProjects.length === 0) {
      setResultsByPidByTerm({});
      setSearchError(searchTerms.length === 0 ? 'Add at least one search term.' : null);
      return;
    }

    setSearching(true);
    setSearchError(null);
    searchCallsRef.current = [];

    try {
      // Build: pid -> term -> BranchHit[]
      const perProject: { pid: string; perTerm: Record<string, BranchHit[]> }[] = await Promise.all(
        selectedProjects.map(async (proj) => {
          const pid = (proj as any).__pid as string;

          const perTermEntries = await Promise.all(
            searchTerms.map(async (term) => {
              const url = withQuery('/api/compare-wizard/branches', {
                search: term,
                projectId: pid,
                perPage: 100,
              });
              searchCallsRef.current.push(url);

              const hitsRaw = await fetchJSON<BranchHit[] | { branches?: BranchHit[] }>(url, {
                headers: { 'x-compare-wizard': '1', 'x-compare-wizard-project-id': pid },
              });
              const hits = Array.isArray(hitsRaw) ? hitsRaw : (hitsRaw?.branches ?? []);
              return [term, hits] as const;
            })
          );

          const perTerm: Record<string, BranchHit[]> = {};
          for (const [term, hits] of perTermEntries) perTerm[term] = hits;
          return { pid, perTerm };
        })
      );

      const nextMap: ResultsByPidByTerm = {};
      for (const p of perProject) nextMap[p.pid] = p.perTerm;
      setResultsByPidByTerm(nextMap);
    } catch (e: any) {
      setSearchError(e?.message ?? 'Search error');
    } finally {
      setSearching(false);
    }
  }, [searchTerms, selectedProjects]);

  // tiny debounce for manual clicks
  const debouncedExecuteSearch = useDebouncedCallback(executeSearch, 150);

  // Auto-run search whenever we enter Step 2 OR when inputs change while on Step 2.
  // We use a "signature" so the effect can fire reliably and also re-fire after going Back → Next.
  const searchSig = useMemo(
    () =>
      JSON.stringify({
        terms: searchTerms,                        // preserve order
        pids: selectedProjects.map((p: any) => p.__pid),
        keys: selectedProjects.map((p) => p._key),
      }),
    [searchTerms, selectedProjects]
  );

  // Force re-run on every entry to Step 2 (even if sig didn't change) by clearing the last sig when leaving Step 2.
  const lastStep2SigRef = useRef<string>('');

  // when we LEAVE step 2, clear the remembered signature so next entry always triggers
  useEffect(() => {
    if (step !== 2) {
      lastStep2SigRef.current = '';
    }
  }, [step]);

  // when we ENTER step 2 (or when inputs change while on step 2), run executeSearch if we have data
  useEffect(() => {
    if (step !== 2) return;
    if (searchTerms.length === 0 || selectedProjects.length === 0) return;

    if (lastStep2SigRef.current !== searchSig) {
      lastStep2SigRef.current = searchSig;
      // immediate (no debounce)
      executeSearch();
    }
  }, [step, searchSig, searchTerms.length, selectedProjects.length, executeSearch]);


  /* =========================
     Step 3: execution
     ========================= */
  const runExecution = useCallback(async () => {
    setExecuting(true);
    setExecError(null);
    setExecData([]);
    execCallsRef.current = [];

    // Flatten selections: for each selected project and each term, if a branch is chosen -> create a job
    const selections = selectedProjects.flatMap((proj) => {
      const _key = proj._key;
      const pid = (proj as any).__pid as string;
      const perTerm = chosenByKeyByTerm[_key] || {};
      return Object.entries(perTerm)
        .filter(([, branch]) => !!branch && branch.trim().length > 0)
        .map(([term, branch]) => ({
          _key,
          pid,
          projectName: projectLabel(proj),
          sourceBranch: branch,
          term,
        }));
    });

    if (selections.length === 0) {
      setExecError('No selected branches to execute. Choose a branch for at least one term.');
      setExecuting(false);
      return;
    }

    // Pull watchlist and pass to API
    const targets = watchlistBranches;
    if (!targets || targets.length === 0) {
      setExecError('No watchlist branches configured. Configure /api/watchlist first.');
      setExecuting(false);
      return;
    }

    try {
      const tasks = selections.map(async (sel) => {
        const { pid, sourceBranch, projectName, _key, term } = sel;

        const containsUrl = withQuery(`/api/compare-wizard/branches/${encodeURIComponent(sourceBranch)}/contains`, {
          projectId: pid,
        });
        const body = { branch: sourceBranch, targets };

        execCallsRef.current.push(`${containsUrl}  BODY:${JSON.stringify(body)}`);

        const payload = await fetchJSON<ContainsResult>(
          containsUrl,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-compare-wizard': '1',
              'x-compare-wizard-project-id': pid,
            },
            body: JSON.stringify(body),
          }
        );

        return {
          pid,
          projectName,
          sourceBranch,
          contains: payload,
          error: null,
          _key,
          term,
        } as WizardExecRow;
      });

      const out = await Promise.all(tasks);
      setExecData(out);
    } catch (e: any) {
      setExecError(e?.message ?? 'Execution error');
    } finally {
      setExecuting(false);
    }
  }, [selectedProjects, chosenByKeyByTerm, watchlistBranches]);

  // auto-run on entering Step 3 or when per-term selections change
  const execSig = useMemo(
    () =>
      JSON.stringify(
        selectedProjects.map((p: any) => ({
          k: p._key,
          pid: p.__pid,
          picks: chosenByKeyByTerm[p._key] || {},
        }))
      ),
    [selectedProjects, chosenByKeyByTerm]
  );
  const lastExecSigRef = useRef<string>('');

  useEffect(() => {
    if (step !== 3) {
      lastExecSigRef.current = '';
    }
  }, [step]);

  useEffect(() => {
    if (step === 3 && !executing && execSig && lastExecSigRef.current !== execSig) {
      lastExecSigRef.current = execSig;
      runExecution();
    }
  }, [step, execSig, executing, runExecution]);

  /* ---------- step navigation (Back / Next) ---------------------------------- */
  const canGoStep2 = selectedProjects.length > 0;
  const anySelectionChosen = useMemo(() => {
    for (const _key of Object.keys(chosenByKeyByTerm)) {
      const per = chosenByKeyByTerm[_key];
      if (per && Object.values(per).some(v => !!v)) return true;
    }
    return false;
  }, [chosenByKeyByTerm]);

  const goBack = () => setStep(prev => (prev === 1 ? 1 : ((prev - 1) as 1 | 2 | 3)));
  const goNextFrom1 = () => setStep(2 as 1 | 2 | 3);
  const goNextFrom2 = () => setStep(3 as 1 | 2 | 3);

  const StepHeader: React.FC<{ n: 1 | 2 | 3; title: string }> = ({ n, title }) => (
    <div className="mt-2 mb-3">
      <div className="text-sm opacity-60">Step {n}</div>
      <h2 className="text-xl font-semibold">{title}</h2>
    </div>
  );

  /* =========================
     Layout: fit screen & wider container
     ========================= */
  return (
    <div className="min-h-screen flex flex-col">
      <div className="w-full max-w-7xl mx-auto px-4 pt-4 pb-2">
        {/* DaisyUI Steps header */}
        <ul className="steps w-full mb-4">
          <li
            className={`step ${step >= 1 ? 'step-primary' : ''}`}
            onClick={() => setStep(1)}
            aria-label="Select Projects"
          >
            Select
          </li>
          <li
            className={`step ${step >= 2 && canGoStep2 ? 'step-primary' : ''} ${!canGoStep2 ? 'pointer-events-none opacity-50' : ''}`}
            onClick={() => canGoStep2 && setStep(2)}
            aria-label="Search Branch"
          >
            Search
          </li>
          <li
            className={`step ${step >= 3 && anySelectionChosen ? 'step-primary' : ''} ${!anySelectionChosen ? 'pointer-events-none opacity-50' : ''}`}
            onClick={() => anySelectionChosen && setStep(3)}
            aria-label="Watchlist Status"
          >
            Status
          </li>
        </ul>
      </div>

      {/* Content */}
      <div className="w-full max-w mx-auto px-4 pb-6 flex-1">
        {/* Step 1 */}
        <section className={`${step === 1 ? '' : 'hidden'} flex flex-col min-h-[60vh]`}>
          <StepHeader n={1} title="Choose one or more GitLab projects" />
          {projectsQuery.isLoading && <div className="loading loading-dots loading-md" />}
          {projectsQuery.error && (
            <div className="alert alert-error mt-3">
              <span>{(projectsQuery.error as Error)?.message ?? 'Failed to load projects'}</span>
            </div>
          )}
          {!projectsQuery.isLoading && !projectsQuery.error && (
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3 mt-3">
              {projects.map((p) => {
                const checked = selectedKeys.includes(p._key);
                return (
                  <label key={p._key} className="card bg-base-200 shadow-sm p-3 cursor-pointer hover:shadow-md transition">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        className="checkbox checkbox-primary mt-1"
                        checked={checked}
                        onChange={() => toggleProject(p._key)}
                      />
                      <div>
                        <div className="font-medium">{projectLabel(p)}</div>
                        <div className="text-xs opacity-70">pid: {pickApiProjectId(p)}</div>
                        <div className="text-xs opacity-50">_key: {p._key}</div>
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          )}

          {/* Back / Next row pinned to bottom of section */}
          <div className="mt-auto pt-6 flex items-center justify-between">
            <button className="btn" onClick={goBack} disabled={step === 1}>Back</button>
            <button
              className="btn btn-primary"
              disabled={!canGoStep2}
              onClick={() => {
                if (!canGoStep2) return;
                goNextFrom1();
              }}
            >
              Next
            </button>
          </div>
        </section>

        {/* Step 2 */}
        <section className={`${step === 2 ? '' : 'hidden'} flex flex-col min-h-[60vh]`}>
          <StepHeader n={2} title="Search the same branch name across the selected projects" />

          {/* Input + chips */}
          <div className="card bg-base-100 shadow-sm">
            <div className="card-body">
              <div className="flex items-center gap-2">
                <input
                  className="input input-bordered w-full"
                  placeholder="Type a term (min 2 chars) and press Enter to add…"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addTermFromInput();
                    }
                  }}
                />
                <button
                  className="btn btn-primary"
                  onClick={() => debouncedExecuteSearch()}
                  disabled={selectedProjects.length === 0 || searchTerms.length === 0}
                  title={searchTerms.length === 0 ? 'Add at least one term' : 'Run search'}
                >
                  Search
                </button>
              </div>

              {/* Chips */}
              <div className="mt-3 flex flex-wrap gap-2">
                {searchTerms.map((t) => (
                  <div key={t} className="badge badge-lg gap-1 bg-primary border border-base-300">
                    <span className="font-mono">{t}</span>
                    <button
                      className="btn btn-ghost btn-xs px-1"
                      title="Remove"
                      onClick={() => removeTerm(t)}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>

              {searchError && (
                <div className="alert alert-error mt-3">
                  <span style={{ whiteSpace: 'pre-wrap' }}>{searchError}</span>
                </div>
              )}

              {searching && (
                <div className="mt-3 flex items-center gap-2">
                  <span className="loading loading-spinner loading-sm" />
                  <span className="text-sm opacity-70">
                    Searching {searchTerms.length} term{searchTerms.length > 1 ? 's' : ''} across {selectedProjects.length} projects…
                  </span>
                </div>
              )}

              {/* Per-project results, now a responsive 2-column grid */}
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                {selectedProjects.map((proj) => {
                  const pid = (proj as any).__pid as string;
                  const perTermHits = resultsByPidByTerm[pid] || {};
                  return (
                    <div key={`${proj._key}-${pid}`} className="rounded-xl border border-base-300 p-3">
                      <div className="mb-2">
                        <div className="font-medium">{projectLabel(proj)}</div>
                        <div className="text-xs opacity-60">pid: {pid} | _key: {proj._key}</div>
                      </div>

                      {/* rows for each term */}
                      <div className="space-y-2">
                        {searchTerms.map((term) => {
                          const hits = perTermHits[term] ?? [];
                          const loadingState = (searching && !(pid in resultsByPidByTerm)) || (searching && !(term in (resultsByPidByTerm[pid] || {})));
                          const emptyState = !searching && hits.length === 0 && (resultsByPidByTerm[pid] && term in (resultsByPidByTerm[pid] || {}));

                          const chosen = (chosenByKeyByTerm[proj._key]?.[term]) ?? '';

                          return (
                            <div key={`${proj._key}-${pid}-${term}`} className="grid grid-cols-1 md:grid-cols-3 gap-2 items-center">
                              <div className="text-xs md:text-sm">
                                <span className="opacity-60 mr-2">Term:</span>
                                <span className="font-mono">{term}</span>
                              </div>

                              <div className="md:col-span-2">
                                <select
                                  className="select select-bordered w-full"
                                  value={chosen}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setChosenByKeyByTerm(prev => ({
                                      ...prev,
                                      [proj._key]: {
                                        ...(prev[proj._key] || {}),
                                        [term]: val,
                                      }
                                    }));
                                  }}
                                  disabled={hits.length === 0}
                                >
                                  <option value="" disabled>
                                    {hits.length > 0 ? 'Pick a branch for this term' : 'No branches'}
                                  </option>
                                  {hits.map((b) => (
                                    <option key={`${pid}-${term}-${b.name}`} value={b.name}>
                                      {b.name}
                                    </option>
                                  ))}
                                </select>

                                <div className="text-xs opacity-60 mt-1">
                                  {chosen ? `Selected: ${chosen}` : 'None selected'}
                                </div>

                                {loadingState && <div className="mt-1 text-xs opacity-70">Loading…</div>}
                                {emptyState && <div className="mt-1 text-xs opacity-70">No results for “{term}”.</div>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* <DebugBlock title="Search calls" items={searchCallsRef.current} /> */}

              {/* Back / Next */}
              <div className="mt-6 flex items-center justify-between">
                <button className="btn" onClick={() => setStep(1)}>Back</button>
                <button
                  className="btn btn-primary"
                  disabled={!anySelectionChosen}
                  onClick={() => {
                    if (!anySelectionChosen) return;
                    // Force a fresh run on Step 3 even if the signature is identical
                    lastExecSigRef.current = '';
                    setStep(3);
                    // proactively run now; the step-3 effect is still there as a safety net
                    setTimeout(() => { runExecution(); }, 0);
                  }}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Step 3 */}
        <section className={`${step === 3 ? '' : 'hidden'} flex flex-col min-h-[60vh]`}>
          <StepHeader n={3} title="Watchlist / Contains Status per project" />

          {execError && (
            <div className="alert alert-error">
              <span style={{ whiteSpace: 'pre-wrap' }}>{execError}</span>
            </div>
          )}

          {executing && (
            <div className="mt-2 flex items-center gap-2">
              <span className="loading loading-spinner loading-sm" />
              <span className="text-sm opacity-70">Checking watchlist across projects…</span>
            </div>
          )}

          {/* <DebugBlock title="Execution calls" items={execCallsRef.current} /> */}

          {/* Now a responsive 3-column grid (1 on mobile, 2 on md, 3 on lg+) */}
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {execData.map((row) => {
              const cardKey = `${row.pid}::${row.sourceBranch}::${row.term ?? ''}`;
              const results = row.contains?.results ?? [];
              return (
                <div key={cardKey} className="card bg-base-200 border border-base-300">
                  <div className="card-body">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold">{row.projectName}</div>
                        <div className="text-xs opacity-70">
                          pid: {row.pid}
                          {row.term ? (
                            <>
                              <span className="opacity-60 mx-1">•</span>
                              <span>term: <span className="font-mono">{row.term}</span></span>
                            </>
                          ) : null}
                        </div>
                        <div className="text-xs">Source: <span className="font-mono">{row.sourceBranch}</span></div>
                      </div>
                    </div>

                    {row.error && (
                      <div className="alert alert-warning mt-2">
                        <span>{row.error}</span>
                      </div>
                    )}

                    {!row.error && (
                      <div className="mt-2">
                        <div className="text-sm font-medium mb-1">Targets</div>
                        <ul className="space-y-1">
                          {results.map((r) => {
                            const merged = !!r.included;
                            const label = merged
                              ? (r.via === 'search' ? 'Merged (CP)' : 'Merged')
                              : 'Not merged';
                            const badgeClass = merged
                              ? (r.via === 'search' ? 'badge-info' : 'badge-success')
                              : 'badge-error';

                            return (
                              <li key={`${cardKey}-${r.target}`} className="flex items-center justify-between bg-base-100 rounded-lg px-2 py-1">
                                <div className="text-sm">
                                  <span className="font-mono">{r.target}</span>
                                  {typeof r.missingCount === 'number' && r.missingCount > 0 && !merged && (
                                    <span className="ml-2 text-xs opacity-60">missing: {r.missingCount}</span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className={`badge ${badgeClass}`}>{label}</span>
                                  {(() => {
                                    const href = makeEvidenceHref(row.sourceBranch, r.target, row.pid);
                                    return (
                                      <Link
                                        className="btn btn-xs btn-outline"
                                        href={href}
                                        target="_blank"
                                        rel="noreferrer"
                                        prefetch={false}   // optional: avoids prefetching evidence pages
                                      >
                                        Proof
                                      </Link>

                                    );
                                  })()}
                                  {/* MR Map (internal graph), opens in new tab */}
                                  <a
                                    className="btn btn-xs"
                                    href={`/mr-graph?branch=${encodeURIComponent(row.sourceBranch)}&projectId=${encodeURIComponent(row.pid)}&q=${encodeURIComponent(row.term ?? row.sourceBranch)}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    title="Open MR map in a new tab"
                                  >
                                    Map
                                  </a>

                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Back only on Step 3 */}
          <div className="mt-auto pt-6 flex items-center justify-between">
            <button className="btn" onClick={() => setStep(2)}>Back</button>
            <div />
          </div>
        </section>
      </div>
    </div>
  );
}
