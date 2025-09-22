//app/dashboard/page.tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import type { SummaryResponse } from "@/lib/types";
import Link from "next/link";
import { useState } from "react";

function Pie({ percent }: { percent: number }) {
  const r = 36, c = 2 * Math.PI * r;
  const filled = (Math.min(Math.max(percent, 0), 100) / 100) * c;
  return (
    <svg viewBox="0 0 100 100" className="w-24 h-24">
      <circle cx="50" cy="50" r={r} fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth="12" />
      <circle cx="50" cy="50" r={r} fill="none" stroke="currentColor" strokeWidth="12"
        strokeDasharray={`${filled} ${c - filled}`} strokeLinecap="round" transform="rotate(-90 50 50)" />
      <text x="50" y="50" textAnchor="middle" dominantBaseline="middle" className="fill-current text-sm font-bold">
        {percent.toFixed(1)}%
      </text>
    </svg>
  );
}

function Bars({ buckets }: { buckets: { label: string; count: number }[] }) {
  const max = Math.max(1, ...buckets.map(b => b.count));
  return (
    <div className="grid grid-cols-4 gap-3">
      {buckets.map(b => (
        <div key={b.label} className="flex flex-col items-center">
          <div className="h-28 w-8 bg-base-300 rounded">
            <div className="w-8 bg-primary rounded-b" style={{ height: `${(b.count / max) * 100}%` }} title={`${b.label}: ${b.count}`} />
          </div>
          <div className="text-xs mt-1">{b.label}</div>
          <div className="text-xs opacity-70">{b.count}</div>
        </div>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const [params, setParams] = useState<{ staleDays?: number }>({});

  const q = useQuery<SummaryResponse>({
    queryKey: ["metrics-summary", params],
    queryFn: async () => {
      const url = new URL("/api/metrics/summary", window.location.origin);
      if (params.staleDays) url.searchParams.set("staleDays", String(params.staleDays));
      const res = await fetch(url.toString(), { cache: "no-store" });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      return data;
    },
    refetchInterval: 30_000, // auto-refresh every 30s
  });

  if (q.isLoading) return <div className="p-6">Loading…</div>;
  if (q.isError) return <div className="alert alert-error m-6"><span>{(q.error as Error).message}</span></div>;
  const data = q.data!;
  const bh = data.kpis.branchHygiene;

  return (
    <div className="p-6 space-y-6">
      <div className="breadcrumbs text-sm">
        <ul>
          <li><Link href="/">Home</Link></li>
          <li>Dashboard</li>
        </ul>
      </div>

      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Branch Hygiene</h1>
        <div className="flex items-center gap-3">
          <label className="label text-xs">Stale ≥ days</label>
          <input
            type="number" min={7} step={1}
            className="input input-sm input-bordered w-24"
            defaultValue={30}
            onChange={(e) => setParams({ staleDays: Number(e.target.value || 30) })}
          />
          <button className="btn btn-sm" onClick={() => q.refetch()}>Apply</button>
        </div>
      </div>

      <div className="text-sm opacity-70">
        Project: <span className="font-mono">{data.context.projectId}</span> @ {data.context.gitlabHost} • Range: {data.context.timeRange.from} → {data.context.timeRange.to}
      </div>

      {/* Highlights */}
      {data.highlights.length > 0 && (
        <div className="grid md:grid-cols-2 gap-4">
          {data.highlights.map((h, i) => (
            <div key={i} className={`alert ${h.severity === "high" ? "alert-error" : h.severity === "medium" ? "alert-warning" : "alert-info"}`}>
              <div>
                <span className="font-bold">{h.title}</span>
                <div className="text-sm">{h.summary}</div>
              </div>
              {h.link && <Link className="btn btn-sm" href={h.link}>View</Link>}
            </div>
          ))}
        </div>
      )}

      {/* KPI cards */}
      <div className="grid md:grid-cols-4 gap-4">
        <div className="card bg-base-200"><div className="card-body">
          <h3 className="card-title text-base">Total Branches</h3>
          <div className="text-3xl font-bold">{bh.totalBranches}</div>
        </div></div>

        <div className="card bg-base-200" id="stale"><div className="card-body">
          <h3 className="card-title text-base">Stale ≥ threshold</h3>
          <div className="text-3xl font-bold">{bh.staleCount}</div>
        </div></div>

        <div className="card bg-base-200"><div className="card-body">
          <h3 className="card-title text-base">Orphaned (no open MR)</h3>
          <div className="text-3xl font-bold">{bh.orphanedCount}</div>
        </div></div>

        <div className="card bg-base-200" id="naming"><div className="card-body">
          <h3 className="card-title text-base">Naming Compliance</h3>
          <div className="flex items-center gap-4">
            <Pie percent={bh.namingCompliancePct} />
            <div className="text-sm opacity-70">Compliant branches</div>
          </div>
        </div></div>
      </div>

      {/* Charts */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="card bg-base-200"><div className="card-body">
          <h3 className="card-title text-base">Age Buckets</h3>
          <Bars buckets={bh.ageBuckets} />
        </div></div>

        <div className="card bg-base-200"><div className="card-body">
          <h3 className="card-title text-base">Compliance Pie</h3>
          <div className="flex items-center gap-6">
            <Pie percent={bh.namingCompliancePct} />
            <div className="text-sm">Adjust regex via <code>?nameRegex=</code> or ENV.</div>
          </div>
        </div></div>
      </div>

      {/* Drilldowns */}
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="card bg-base-200"><div className="card-body">
          <h3 className="card-title text-base">Top Stale Branches</h3>
          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead><tr><th>Branch</th><th>Days</th><th>Author</th></tr></thead>
              <tbody>
                {data.topLists.staleBranches.map((b, i) => (
                  <tr key={i}><td className="font-mono">{b.name}</td><td>{b.daysSinceCommit}</td><td>{b.author}</td></tr>
                ))}
                {data.topLists.staleBranches.length === 0 && <tr><td colSpan={3} className="opacity-60">No stale branches 🎉</td></tr>}
              </tbody>
            </table>
          </div>
        </div></div>

        <div className="card bg-base-200"><div className="card-body">
          <h3 className="card-title text-base">Non-Compliant Names</h3>
          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead><tr><th>Branch</th><th>Author</th></tr></thead>
              <tbody>
                {data.topLists.nonCompliantNames.map((b, i) => (
                  <tr key={i}><td className="font-mono">{b.name}</td><td>{b.author}</td></tr>
                ))}
                {data.topLists.nonCompliantNames.length === 0 && <tr><td colSpan={2} className="opacity-60">All branches follow the convention 🎯</td></tr>}
              </tbody>
            </table>
          </div>
        </div></div>

        <div className="card bg-base-200"><div className="card-body">
          <h3 className="card-title text-base">Orphaned Branches</h3>
          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead><tr><th>Branch</th><th>Author</th></tr></thead>
              <tbody>
                {data.topLists.orphanedBranches.map((b, i) => (
                  <tr key={i}><td className="font-mono">{b.name}</td><td>{b.author}</td></tr>
                ))}
                {data.topLists.orphanedBranches.length === 0 && <tr><td colSpan={2} className="opacity-60">No orphaned branches ✅</td></tr>}
              </tbody>
            </table>
          </div>
        </div></div>
      </div>
    </div>
  );
}
