// src/lib/types.ts
export type AgeBucket = { label: string; count: number };

export type SummaryResponse = {
  context: {
    projectId: number;
    gitlabHost: string;
    defaultBranch?: string;
    timeRange: { from: string; to: string };
  };
  kpis: {
    branchHygiene: {
      totalBranches: number;
      staleCount: number;
      orphanedCount: number;
      namingCompliancePct: number;
      protectedViolations: number; // placeholder = 0 for now
      ageBuckets: AgeBucket[];
    };
  };
  topLists: {
    staleBranches: { name: string; daysSinceCommit: number; author: string }[];
    nonCompliantNames: { name: string; author: string }[];
    orphanedBranches: { name: string; author: string }[];
  };
  highlights: {
    type: "alert" | "insight";
    severity: "high" | "medium" | "low" | "info";
    title: string;
    summary: string;
    link?: string;
  }[];
};
