'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { ResponsiveHeatMap } from '@nivo/heatmap';
import { ResponsiveSankey } from '@nivo/sankey';

/* ===================== Types (match your existing APIs) ===================== */

type WatchlistResp = { source: 'env' | 'default'; branches: string[] };

type MRItem = {
  iid: number;
  title: string;
  web_url?: string;
  author?: { name?: string; username?: string; avatar_url?: string };
  assignee?: { name?: string; username?: string } | null;
  assignees?: Array<{ name?: string; username?: string }>;
  reviewers?: Array<{ name?: string; username?: string }>;
  source_branch?: string;
  target_branch?: string;
  state?: 'opened' | 'closed' | 'merged' | 'locked';
  draft?: boolean;
  labels?: string[];
  created_at?: string;
  updated_at?: string;
  merged_at?: string | null;
};

type ListResp = MRItem[];

type MetricsResp = {
  window: '7d' | '30d';
  opened: number;
  merged: number;
  closed: number;
  drafts: number;
  stale_open: number;
  avg_time_to_merge_hours: number;
  since: string;
  target_branch: string | null;
};

type TSResp = {
  window: '7d' | '30d';
  target_branch: string | null;
  since: string;
  series: Array<{ date: string; opened: number; merged: number; closed: number }>;
};

type FlowOverviewResp = {
  mode: 'overview';
  window: '7d' | '30d';
  target_branch: null;
  since: string;
  families: string[];
  targets: string[];
  matrix: Array<{ family: string; target: string; count: number }>;
  topRoutes: Array<{ family: string; target: string; count: number }>;
};

type FlowDrillResp = {
  mode: 'drill';
  window: '7d' | '30d';
  target_branch: string;
  since: string;
  nodes: string[];
  links: Array<{ source: string; target: string; opened: number; merged: number; closed: number }>;
};

type ReviewsResp = {
  window: '7d' | '30d';
  target_branch: string | null;
  since: string;
  total_inspected: number;
  leaderboard: Array<{ reviewer: string; count: number }>;
  authors: string[];
  reviewers: string[];
  matrix: Array<{ author: string; reviewer: string; count: number }>;
};

/* ===================== Fetchers ===================== */

async function fetchWatchlist(): Promise<WatchlistResp> {
  const r = await fetch('/api/watchlist', { cache: 'no-store' });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function fetchMRs(params: {
  state: string;
  target_branch?: string;
  labels?: string;
  page: number;
  perPage: number;
}): Promise<ListResp> {
  const u = new URL('/api/gitlab/merge-requests', window.location.origin);
  u.searchParams.set('state', params.state);
  u.searchParams.set('page', String(params.page));
  u.searchParams.set('perPage', String(params.perPage));
  if (params.target_branch) u.searchParams.set('target_branch', params.target_branch);
  if (params.labels) u.searchParams.set('labels', params.labels);
  const r = await fetch(u.toString(), { cache: 'no-store' });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function fetchMetrics(params: { target_branch?: string; window?: '7d' | '30d' }) {
  const u = new URL('/api/metrics/mr/summary', window.location.origin);
  if (params.target_branch) u.searchParams.set('target_branch', params.target_branch);
  u.searchParams.set('window', params.window ?? '7d');
  const r = await fetch(u.toString(), { cache: 'no-store' });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<MetricsResp>;
}

async function fetchTimeseries(params: { target_branch?: string; window?: '7d' | '30d' }) {
  const u = new URL('/api/metrics/mr/timeseries', window.location.origin);
  if (params.target_branch) u.searchParams.set('target_branch', params.target_branch);
  u.searchParams.set('window', params.window ?? '30d');
  const r = await fetch(u.toString(), { cache: 'no-store' });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<TSResp>;
}

async function fetchFlow(params: { target_branch?: string; window?: '7d' | '30d' }) {
  const u = new URL('/api/metrics/mr/flow', window.location.origin);
  if (params.target_branch) u.searchParams.set('target_branch', params.target_branch);
  u.searchParams.set('window', params.window ?? '30d');
  const r = await fetch(u.toString(), { cache: 'no-store' });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<FlowOverviewResp | FlowDrillResp>;
}

async function fetchReviews(params: { target_branch?: string; window?: '7d' | '30d' }) {
  const u = new URL('/api/metrics/mr/reviews', window.location.origin);
  if (params.target_branch) u.searchParams.set('target_branch', params.target_branch);
  u.searchParams.set('window', params.window ?? '30d');
  const r = await fetch(u.toString(), { cache: 'no-store' });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<ReviewsResp>;
}

/* ===================== Small UI helpers ===================== */

function chipColor(state?: string, draft?: boolean) {
  if (draft) return 'badge-warning';
  switch (state) {
    case 'merged': return 'badge-success';
    case 'closed': return 'badge-neutral';
    case 'opened': return 'badge-primary';
    default: return '';
  }
}
function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  const [a, b] = [parts[0] || '', parts[1] || ''];
  return (a[0] || '').toUpperCase() + (b[0] || '').toUpperCase();
}

/* ===================== Simple activity charts (lightweight) ===================== */

function StackedBars({ data, height = 120 }: {
  data: Array<{ date: string; opened: number; merged: number; closed: number }>;
  height?: number;
}) {
  const width = Math.max(300, data.length * 10);
  const maxY = Math.max(1, ...data.map((d) => d.opened + d.merged + d.closed));
  const barW = Math.max(4, Math.floor(width / Math.max(1, data.length)));
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-40">
      {data.map((d, i) => {
        const x = i * barW + 1;
        const hOpen = (d.opened / maxY) * (height - 24);
        const hMerged = (d.merged / maxY) * (height - 24);
        const hClosed = (d.closed / maxY) * (height - 24);
        let y = height - 12;
        return (
          <g key={d.date} className="transition-opacity duration-150 hover:opacity-100 opacity-90">
            <rect x={x} y={(y -= hClosed)} width={barW - 2} height={hClosed} className="fill-base-300" />
            <rect x={x} y={(y -= hMerged)} width={barW - 2} height={hMerged} className="fill-success" />
            <rect x={x} y={(y -= hOpen)} width={barW - 2} height={hOpen} className="fill-primary" />
            <title>{`${d.date}\nopened:${d.opened} merged:${d.merged} closed:${d.closed}`}</title>
          </g>
        );
      })}
      <line x1="0" y1={height - 12} x2={width} y2={height - 12} className="stroke-base-300" />
    </svg>
  );
}
function Sparkline({ data, height = 60 }: { data: Array<{ date: string; merged: number }>; height?: number }) {
  const width = Math.max(300, data.length * 6);
  const maxY = Math.max(1, ...data.map((d) => d.merged));
  const pts = data.map((d, i) => {
    const x = (i / Math.max(1, data.length - 1)) * (width - 2);
    const y = height - 2 - (d.merged / maxY) * (height - 4);
    return `${x},${y}`;
  });
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-20">
      <polyline points={pts.join(' ')} className="stroke-success fill-none" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <line x1="0" y1={height - 2} x2={width} y2={height - 2} className="stroke-base-300" />
    </svg>
  );
}

/* ===================== Reviewer leaderboard ===================== */

function ReviewerRow({ name, count, max }: { name: string; count: number; max: number }) {
  const pct = Math.round((count / Math.max(1, max)) * 100);
  return (
    <li className="px-2 py-2 rounded-lg hover:bg-base-200 transition-colors">
      <div className="flex items-center gap-3">
        <div className="avatar placeholder">
          <div className="bg-primary text-primary-content rounded-full w-8 h-8 text-xs flex items-center justify-center">
            {initials(name)}
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-center">
            <span className="truncate">{name}</span>
            <span className="badge badge-sm">{count}</span>
          </div>
          <progress className="progress progress-primary h-2 mt-1" value={pct} max={100}></progress>
        </div>
      </div>
    </li>
  );
}
function ReviewerLeaderboard({ data }: { data: ReviewsResp | undefined }) {
  if (!data) return <div className="skeleton h-40 w-full" />;
  const top = (data.leaderboard ?? []).slice(0, 10);
  if (!top.length) return <div className="alert alert-info">No approvals found in this window.</div>;
  const max = Math.max(1, ...top.map((r) => r.count));
  return <ul className="menu">{top.map((r) => <ReviewerRow key={r.reviewer} name={r.reviewer} count={r.count} max={max} />)}</ul>;
}

/* ===================== Page ===================== */

export default function MergeRequestsPage() {
  // watchlist
  const { data: watch, isFetching: watchLoading, error: watchErr } = useQuery({
    queryKey: ['watchlist'],
    queryFn: fetchWatchlist,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const pills = useMemo(() => watch?.branches ?? [], [watch]);

  // filters
  const [targetBranch, setTargetBranch] = useState<string>('');
  const [state, setState] = useState<'opened' | 'merged' | 'closed' | 'all'>('opened');
  const [labels, setLabels] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const perPage = 20;

  // NEW: drill target for Flow Detail tab (does not affect MR list)
  const [drillTarget, setDrillTarget] = useState<string>('');

  // list
  const { data: list, isFetching: listLoading, error: listErr } = useQuery({
    queryKey: ['mrs', targetBranch, state, labels, page, perPage],
    queryFn: () => fetchMRs({ state, target_branch: targetBranch || undefined, labels: labels || undefined, page, perPage }),
    keepPreviousData: true,
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  });
  const items = useMemo(() => list ?? [], [list]);

  // KPIs
  const [windowKpi, setWindowKpi] = useState<'7d' | '30d'>('7d');
  const { data: kpi, isFetching: kpiLoading, error: kpiErr } = useQuery({
    queryKey: ['mr-metrics', targetBranch, windowKpi],
    queryFn: () => fetchMetrics({ target_branch: targetBranch || undefined, window: windowKpi }),
    staleTime: 30_000,
    refetchInterval: 0,
    refetchOnWindowFocus: false,
  });

  // === Tabs
  type Tab = 'activity' | 'flow' | 'flowDetail' | 'reviews';
  const [activeTab, setActiveTab] = useState<Tab>('activity');

  // Activity
  const [windowTs, setWindowTs] = useState<'7d' | '30d'>('30d');
  const { data: ts, isFetching: tsLoading, error: tsErr } = useQuery({
    queryKey: ['mr-timeseries', targetBranch, windowTs],
    queryFn: () => fetchTimeseries({ target_branch: targetBranch || undefined, window: windowTs }),
    enabled: activeTab === 'activity',
    staleTime: 60_000,
    refetchInterval: 0,
    refetchOnWindowFocus: false,
  });
  const mergedOnly = useMemo(() => (ts?.series ?? []).map(({ date, merged }) => ({ date, merged })), [ts]);

  // Flow (overview)
  const [windowFlow, setWindowFlow] = useState<'7d' | '30d'>('30d');
  const { data: flowOverview, isFetching: flowOverviewLoading, error: flowOverviewErr } = useQuery({
    queryKey: ['mr-flow-overview', windowFlow],
    queryFn: () => fetchFlow({ window: windowFlow }), // no target -> overview
    enabled: activeTab === 'flow',
    staleTime: 60_000,
    refetchInterval: 0,
    refetchOnWindowFocus: false,
  });

  // Flow (detail / drill)
  const { data: flowDrill, isFetching: flowDrillLoading, error: flowDrillErr } = useQuery({
    queryKey: ['mr-flow-drill', drillTarget, windowFlow],
    queryFn: () => fetchFlow({ target_branch: drillTarget, window: windowFlow }),
    enabled: activeTab === 'flowDetail' && !!drillTarget,
    staleTime: 60_000,
    refetchInterval: 0,
    refetchOnWindowFocus: false,
  });

  // Reviews
  const [windowRev, setWindowRev] = useState<'7d' | '30d'>('30d');
  const { data: reviews, isFetching: revLoading, error: revErr } = useQuery({
    queryKey: ['mr-reviews', targetBranch, windowRev],
    queryFn: () => fetchReviews({ target_branch: targetBranch || undefined, window: windowRev }),
    enabled: activeTab === 'reviews',
    staleTime: 60_000,
    refetchInterval: 0,
    refetchOnWindowFocus: false,
  });

  return (
    <div className="p-4 space-y-6">
      <div className="breadcrumbs text-sm">
        <ul><li><Link href="/">Home</Link></li><li>Merge Requests</li></ul>
      </div>

      {/* Branch pills */}
      {watchErr ? <div className="alert alert-error"><span>{(watchErr as Error).message}</span></div> : null}
      <div className="flex flex-wrap gap-3">
        {watchLoading && !pills.length ? (<><div className="skeleton h-12 w-64 rounded-xl" /><div className="skeleton h-12 w-64 rounded-xl" /></>) : null}
        {pills.map((p) => {
          const active = targetBranch === p;
          return (
            <button key={p} onClick={() => { setTargetBranch(p); setPage(1); }}
              className={['card card-border shadow-sm cursor-pointer transition-colors w-auto',
                active ? 'bg-primary text-primary-content' : 'bg-base-100 hover:bg-base-200',
              ].join(' ')} title={`Filter MRs targeting ${p}`}>
              <div className="card-body py-3 px-4">
                <div className="font-mono text-sm break-all">{p}</div>
                <div className="text-xs opacity-70">{active ? 'Selected' : 'Click to filter by target branch'}</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* KPI cards */}
      {kpiErr ? <div className="alert alert-error"><span>{(kpiErr as Error).message}</span></div> : null}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <div className="card card-border bg-base-100"><div className="card-body"><div className="stat-title">Opened ({kpi?.window ?? windowKpi})</div><div className="stat-value text-primary">{kpiLoading ? '…' : kpi?.opened ?? '—'}</div></div></div>
        <div className="card card-border bg-base-100"><div className="card-body"><div className="stat-title">Merged</div><div className="stat-value text-success">{kpiLoading ? '…' : kpi?.merged ?? '—'}</div></div></div>
        <div className="card card-border bg-base-100"><div className="card-body"><div className="stat-title">Closed</div><div className="stat-value">{kpiLoading ? '…' : kpi?.closed ?? '—'}</div></div></div>
        <div className="card card-border bg-base-100"><div className="card-body"><div className="stat-title">Drafts</div><div className="stat-value">{kpiLoading ? '…' : kpi?.drafts ?? '—'}</div></div></div>
        <div className="card card-border bg-base-100"><div className="card-body"><div className="stat-title">Stale (≥3d)</div><div className="stat-value text-warning">{kpiLoading ? '…' : kpi?.stale_open ?? '—'}</div></div></div>
        <div className="card card-border bg-base-100"><div className="card-body"><div className="stat-title">Avg TTM (h)</div><div className="stat-value">{kpiLoading ? '…' : kpi?.avg_time_to_merge_hours ?? '—'}</div></div></div>
      </div>
      <div className="flex items-center gap-2">
        <div className="join">
          <button className={`btn btn-sm join-item ${windowKpi === '7d' ? 'btn-primary' : ''}`} onClick={() => setWindowKpi('7d')}>7d</button>
          <button className={`btn btn-sm join-item ${windowKpi === '30d' ? 'btn-primary' : ''}`} onClick={() => setWindowKpi('30d')}>30d</button>
        </div>
        {kpi?.since ? <div className="text-xs opacity-70">since {new Date(kpi.since).toLocaleString()}{kpi?.target_branch ? <> · target <b className="font-mono">{kpi.target_branch}</b></> : null}</div> : null}
      </div>

      {/* TABS — DaisyUI pills */}
      <div role="tablist" className="tabs tabs-boxed">
        <button role="tab" className={`tab ${activeTab === 'activity' ? 'tab-active' : ''}`} onClick={() => setActiveTab('activity')}>Activity</button>
        <button role="tab" className={`tab ${activeTab === 'flow' ? 'tab-active' : ''}`} onClick={() => setActiveTab('flow')}>Branch Flow</button>
        <button role="tab" className={`tab ${activeTab === 'flowDetail' ? 'tab-active' : ''}`} onClick={() => setActiveTab('flowDetail')}>Flow Detail</button>
        <button role="tab" className={`tab ${activeTab === 'reviews' ? 'tab-active' : ''}`} onClick={() => setActiveTab('reviews')}>Review Heatmap</button>
      </div>

      {/* Activity tab */}
      {activeTab === 'activity' && (
        <>
          <div className="card card-border bg-base-200">
            <div className="card-body">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Activity (Opened / Merged / Closed)</h2>
                <div className="card-actions">
                  <div className="join">
                    <button className={`btn btn-sm join-item ${windowTs === '7d' ? 'btn-primary' : ''}`} onClick={() => setWindowTs('7d')}>7d</button>
                    <button className={`btn btn-sm join-item ${windowTs === '30d' ? 'btn-primary' : ''}`} onClick={() => setWindowTs('30d')}>30d</button>
                  </div>
                </div>
              </div>
              {tsErr ? <div className="alert alert-error"><span>{(tsErr as Error).message}</span></div> : null}
              {tsLoading ? <div className="skeleton h-40 w-full" /> : (ts?.series?.length ? (
                <>
                  <StackedBars data={ts.series} />
                  <div className="text-xs opacity-70 mt-2">
                    {ts.target_branch ? <>Target <b className="font-mono">{ts.target_branch}</b> · </> : null}
                    Window {ts.window} · since {ts.since ? new Date(ts.since).toLocaleString() : '-'}
                  </div>
                  <div className="mt-3 flex gap-3 text-xs">
                    <span className="inline-flex items-center gap-1"><span className="w-3 h-3 bg-primary inline-block rounded" /> Opened</span>
                    <span className="inline-flex items-center gap-1"><span className="w-3 h-3 bg-success inline-block rounded" /> Merged</span>
                    <span className="inline-flex items-center gap-1"><span className="w-3 h-3 bg-base-300 inline-block rounded" /> Closed</span>
                  </div>
                </>
              ) : <div className="alert alert-info">No data in this window.</div>)}
            </div>
          </div>

          <div className="card card-border bg-base-200">
            <div className="card-body">
              <h3 className="font-medium mb-2">Merged per day (velocity)</h3>
              {tsLoading ? <div className="skeleton h-20 w-full" /> : ((ts?.series?.length ?? 0) > 0 ? (
                <Sparkline data={mergedOnly} />
              ) : <div className="alert alert-info">No merged MRs in this window.</div>)}
            </div>
          </div>
        </>
      )}

      {/* Branch Flow — Overview */}
      {activeTab === 'flow' && (
        <div className="card card-border bg-base-100">
          <div className="card-body space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Flow Overview</h2>
              <div className="card-actions">
                <div className="join">
                  <button className={`btn btn-sm join-item ${windowFlow === '7d' ? 'btn-primary' : ''}`} onClick={() => setWindowFlow('7d')}>7d</button>
                  <button className={`btn btn-sm join-item ${windowFlow === '30d' ? 'btn-primary' : ''}`} onClick={() => setWindowFlow('30d')}>30d</button>
                </div>
              </div>
            </div>

            {flowOverviewErr ? <div className="alert alert-error"><span>{(flowOverviewErr as Error).message}</span></div> : null}
            {flowOverviewLoading || !flowOverview ? (
              <div className="skeleton h-[360px] w-full" />
            ) : flowOverview.mode === 'overview' ? (
              <>
                <div className="w-full h-[320px]">
                  <ResponsiveHeatMap
                    data={flowOverview.matrix.reduce((acc, m) => {
                      let row = acc.find((r: any) => r.id === m.family);
                      if (!row) { row = { id: m.family, data: [] as any[] }; acc.push(row); }
                      row.data.push({ x: m.target, y: m.count });
                      return acc;
                    }, [] as any[])}
                    keys={flowOverview.targets}
                    indexBy="id"
                    margin={{ top: 20, right: 12, bottom: 60, left: 120 }}
                    padding={2}
                    forceSquare={false}
                    enableLabels={false}
                    colors={{ type: 'sequential', scheme: 'greens' }}
                    axisLeft={{ tickSize: 0, tickPadding: 6 }}
                    axisTop={{ tickRotation: -45, tickSize: 0, tickPadding: 6 }}
                    theme={{ text: { fontSize: 11 } }}
                    tooltip={({ xKey, yKey, value }) => (
                      <div className="px-2 py-1 rounded bg-base-200 text-sm">
                        {String(yKey)} ← {String(xKey)}: {value}
                      </div>
                    )}
                  />
                </div>

                <div className="mt-2">
                  <h3 className="text-md font-medium mb-1">Top Routes</h3>
                  <ul className="menu menu-compact">
                    {flowOverview.topRoutes.map((r) => (
                      <li key={`${r.family}→${r.target}`}>
                        <button
                          onClick={() => {
                            setDrillTarget(r.target);   // set drill target only
                            setActiveTab('flowDetail'); // switch to detail tab -> triggers drill query
                          }}
                        >
                          {r.family} → {r.target} <span className="badge badge-sm ml-2">{r.count}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}

      {/* Branch Flow — Detail (Sankey) */}
      {activeTab === 'flowDetail' && (
        <div className="card card-border bg-base-100">
          <div className="card-body">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Flow → {drillTarget || '—'}</h2>
              <div className="card-actions">
                <button className="btn btn-sm" onClick={() => setActiveTab('flow')}>Back to Overview</button>
              </div>
            </div>

            {flowDrillErr ? <div className="alert alert-error"><span>{(flowDrillErr as Error).message}</span></div> : null}

            {flowDrillLoading || !flowDrill ? (
              <div className="skeleton h-[360px] w-full" />
            ) : flowDrill.mode === 'drill' && flowDrill.links?.length ? (
              <div className="w-full h-[360px] rounded-lg border border-base-300 bg-base-100">
                <ResponsiveSankey
                  data={{
                    nodes: flowDrill.nodes.map((id) => ({ id })),
                    links: flowDrill.links.map((l) => ({
                      source: l.source,
                      target: l.target,
                      value: Math.max(1, (l.opened ?? 0) + (l.merged ?? 0) + (l.closed ?? 0)),
                      meta: l,
                    })),
                  }}
                  margin={{ top: 16, right: 12, bottom: 16, left: 12 }}
                  nodeThickness={12}
                  nodeSpacing={16}
                  nodeBorderWidth={1}
                  linkOpacity={0.45}
                  linkBlendMode="multiply"
                  label={(n) => String(n.id)}
                  labelPosition="outside"
                  labelPadding={6}
                  labelOrientation="vertical"
                  colors={{ scheme: 'set2' }}
                  theme={{ text: { fontSize: 11 } }}
                  linkTooltip={({ link }) => {
                    const m = (link as any).meta as FlowDrillResp['links'][number];
                    return (
                      <div className="px-2 py-1 rounded bg-base-200 text-sm">
                        <div><b className="font-mono">{m.source}</b> → <b className="font-mono">{m.target}</b></div>
                        <div className="opacity-80">opened: {m.opened ?? 0} · merged: {m.merged ?? 0} · closed: {m.closed ?? 0}</div>
                      </div>
                    );
                  }}
                />
              </div>
            ) : (
              <div className="alert">No flows into <b className="font-mono">{drillTarget}</b> for this window.</div>
            )}
          </div>
        </div>
      )}

      {/* Review Heatmap */}
      {activeTab === 'reviews' && (
        <div className="card card-border bg-base-100">
          <div className="card-body">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Review Insights</h2>
              <div className="card-actions">
                <div className="join">
                  <button className={`btn btn-sm join-item ${windowRev === '7d' ? 'btn-primary' : ''}`} onClick={() => setWindowRev('7d')}>7d</button>
                  <button className={`btn btn-sm join-item ${windowRev === '30d' ? 'btn-primary' : ''}`} onClick={() => setWindowRev('30d')}>30d</button>
                </div>
              </div>
            </div>

            {revErr ? <div className="alert alert-error"><span>{(revErr as Error).message}</span></div> : null}
            {revLoading || !reviews ? (
              <div className="grid md:grid-cols-3 gap-4">
                <div className="skeleton h-40 w-full md:col-span-1" />
                <div className="skeleton h-[360px] w-full md:col-span-2" />
              </div>
            ) : (
              <div className="grid md:grid-cols-3 gap-4">
                <div className="card bg-base-100 md:col-span-1">
                  <div className="card-body">
                    <h3 className="font-medium">Top Reviewers</h3>
                    <ReviewerLeaderboard data={reviews} />
                    {reviews?.total_inspected != null ? (
                      <div className="text-xs opacity-70 mt-2">From {reviews.total_inspected} recent MRs</div>
                    ) : null}
                  </div>
                </div>

                <div className="md:col-span-2">
                  <div className="w-full h-[360px] rounded-lg border border-base-300 bg-base-100">
                    <ResponsiveHeatMap
                      data={(() => {
                        const grouped = new Map<string, Map<string, number>>();
                        for (const a of reviews.authors) grouped.set(a, new Map());
                        for (const cell of reviews.matrix) {
                          if (!grouped.has(cell.author)) grouped.set(cell.author, new Map());
                          grouped.get(cell.author)!.set(cell.reviewer, cell.count);
                        }
                        return Array.from(grouped.entries()).map(([author, map]) => ({
                          id: author,
                          data: reviews.reviewers.map(r => ({ x: r, y: map.get(r) ?? 0 })),
                        }));
                      })()}
                      keys={reviews.reviewers}
                      indexBy="id"
                      margin={{ top: 24, right: 12, bottom: 24, left: 120 }}
                      forceSquare={true}
                      padding={2}
                      enableLabels={false}
                      colors={{ type: 'sequential', scheme: 'greens' }}
                      axisTop={{ tickRotation: -45, tickSize: 3, tickPadding: 6 }}
                      axisLeft={{ tickSize: 3, tickPadding: 6 }}
                      theme={{ text: { fontSize: 11 }, tooltip: { container: { fontSize: 12 } } }}
                      tooltip={({ xKey, yKey, value }) => (
                        <div className="px-2 py-1 rounded bg-base-200 text-sm">
                          {String(yKey)} reviewed by <b>{String(xKey)}</b>: {value}
                        </div>
                      )}
                      legends={[{ anchor: 'bottom', translateY: 18, length: 160, thickness: 8, direction: 'row', tickSize: 0, title: 'more reviews →', titleAlign: 'start', titleOffset: 8 }]}
                    />
                  </div>
                  {reviews?.since ? <div className="text-xs opacity-70 mt-2">since {new Date(reviews.since).toLocaleString()}</div> : null}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main MR table */}
      <div className="card card-border bg-base-100">
        <div className="card-body">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <div className="form-control">
              <label className="label"><span className="label-text">State</span></label>
              <select className="select select-bordered select-sm" value={state}
                onChange={(e) => { setState(e.target.value as any); setPage(1); }}>
                <option value="opened">Opened</option>
                <option value="merged">Merged</option>
                <option value="closed">Closed</option>
                <option value="all">All</option>
              </select>
            </div>
            <div className="form-control">
              <label className="label"><span className="label-text">Labels (comma)</span></label>
              <input className="input input-bordered input-sm" placeholder="bug, urgent" value={labels}
                onChange={(e) => { setLabels(e.target.value); setPage(1); }} />
            </div>
          </div>

          {listErr ? <div className="alert alert-error"><span>{(listErr as Error).message}</span></div> : null}

          <div className="overflow-x-auto">
            <table className="table table-zebra">
              <thead>
                <tr><th>Title</th><th>Author</th><th>Source → Target</th><th>State</th><th>Updated</th></tr>
              </thead>
              <tbody>
                {(items || []).map((m) => (
                  <tr key={m.iid}>
                    <td className="max-w-xl">{m.web_url ? <a className="link link-primary" href={m.web_url} target="_blank" rel="noreferrer">{m.title}</a> : <span className="font-medium">{m.title}</span>}</td>
                    <td className="whitespace-nowrap">{m.author?.name ?? m.author?.username ?? '—'}</td>
                    <td className="whitespace-nowrap">
                      <span className="font-mono">{m.source_branch}</span> <span className="opacity-70">→</span> <span className="font-mono">{m.target_branch}</span>
                    </td>
                    <td><span className={`badge ${chipColor(m.state, m.draft)}`}>{m.draft ? 'draft' : m.state}</span></td>
                    <td className="whitespace-nowrap">{m.updated_at ? new Date(m.updated_at).toLocaleString() : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex items-center justify-between mt-4">
              <div className="text-sm opacity-70">
                Target: {targetBranch ? <b className="font-mono">{targetBranch}</b> : '—'} · State: <b>{state}</b> · Labels: <b>{labels || '—'}</b>
              </div>
              <div className="join">
                <button className="btn join-item" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1 || listLoading}>Prev</button>
                <button className="btn join-item" onClick={() => setPage((p) => p + 1)} disabled={listLoading}>Next</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
