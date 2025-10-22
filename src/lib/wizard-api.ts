/* lib/wizard-api.ts
   Pure fetch helpers – no React, no UI, no store.
   Keeps every existing route untouched.
*/
const ok = (r: Response) => (r.ok ? r : Promise.reject(new Error(`${r.status} ${r.statusText}`)));

/* ---------- 1. Branches for ONE project (same endpoint the branch page uses) ---------- */
export async function fetchBranches(
  projectId: string,
  search: string,
  perPage = 100
): Promise<Array<{ name: string; web_url?: string }>> {
  const q = new URLSearchParams();
  q.set('projectId', projectId);
  if (search.trim().length >= 2) q.set('search', search.trim());
  q.set('perPage', String(perPage));

  const url = `/api/gitlab/branches?${q}`;
  const r = await fetch(url, { cache: 'no-store' }).then(ok);
  const j = await r.json();
  const arr = (j?.branches ?? j ?? []) as any[];
  return arr.map((b) => ({ name: b?.name ?? b?.branch ?? '', web_url: b?.web_url })).filter((b) => !!b.name);
}

/* ---------- 2. Watch-list targets (global) ---------- */
export async function fetchWatchlist(): Promise<string[]> {
  const r = await fetch('/api/watchlist', { cache: 'no-store' }).then(ok);
  const j = await r.json();
  return Array.isArray(j?.branches) ? j.branches : [];
}

/* ---------- 3. Merged status for ONE (project, branch) vs watch-list ---------- */
export async function fetchContains(
  projectId: string,
  branch: string,
  targets: string[]
): Promise<Array<{
  target: string;
  included: boolean;
  reason?: string;
  via?: 'compare' | 'search';
  web_url?: string;
  missingSample?: { short_id: string }[];
}>> {
  if (!targets.length) return [];

  const url = `/api/gitlab/branches/${encodeURIComponent(branch)}/contains`;
  const body = JSON.stringify({ projectId, targets });
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }).then(ok);
  const j = await r.json();
  return (j?.results ?? []) as any[];
}

/* ---------- 4. Convenience: do 1+2+3 in parallel for many (project,branch) ---------- */
export type WizardStatus = {
  projectId: string;
  projectName: string;
  sourceBranch: string;
  statuses: Awaited<ReturnType<typeof fetchContains>>;
};

export async function fetchWizardStatus(
  pairs: Array<{ projectId: string; projectName: string; branch: string }>
): Promise<WizardStatus[]> {
  if (!pairs.length) return [];

  // load watch-list once
  const targets = await fetchWatchlist();

  // run all contains in parallel
  const promises = pairs.map(async ({ projectId, projectName, branch }) => {
    const statuses = await fetchContains(projectId, branch, targets);
    return { projectId, projectName, sourceBranch: branch, statuses };
  });

  return Promise.all(promises);
}