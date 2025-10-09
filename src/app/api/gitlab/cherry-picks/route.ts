//app/api/gitlab/cherry-picks/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getGitLabClientOrFail, handleApiError } from '@/lib/api-helpers';

function detectCherryPicksFromCommits(commits: any[]): Array<{
  type: 'commit';
  id: string;
  title: string;
  detectedBy: 'message';
  confidence: 'high';
  createdAt: string;
}> {
  return commits
    .filter(commit => commit.message.includes('(cherry picked from commit'))
    .map(commit => ({
      type: 'commit' as const,
      id: commit.id,
      title: commit.title,
      detectedBy: 'message' as const,
      confidence: 'high' as const,
      createdAt: commit.authored_date,
    }));
}

function detectCherryPicksFromMRs(mergeRequests: any[]): Array<{
  type: 'merge_request';
  id: string;
  title: string;
  sourceBranch: string;
  targetBranch: string;
  detectedBy: 'label';
  confidence: 'medium';
  createdAt: string;
  webUrl: string;
}> {
  return mergeRequests
    .filter(mr => mr.labels.includes('cherry-pick'))
    .map(mr => ({
      type: 'merge_request' as const,
      id: mr.iid.toString(),
      title: mr.title,
      sourceBranch: mr.source_branch,
      targetBranch: mr.target_branch,
      detectedBy: 'label' as const,
      confidence: 'medium' as const,
      createdAt: mr.created_at,
      webUrl: mr.web_url,
    }));
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const method = searchParams.get('method') || 'all';
    const projectId = searchParams.get('projectId');

    if (!projectId) {
      const client = await getGitLabClientOrFail();
      const allCherryPicks: any[] = [];

      if (method === 'all' || method === 'message') {
        const commits = await client.getCommits(undefined, 50);
        const messageBased = detectCherryPicksFromCommits(commits);
        allCherryPicks.push(...messageBased);
      }

      if (method === 'all' || method === 'label') {
        const mergeRequests = await client.getMergeRequests({ labels: 'cherry-pick' });
        const labelBased = detectCherryPicksFromMRs(mergeRequests);
        allCherryPicks.push(...labelBased);
      }

      return NextResponse.json(allCherryPicks);
    }

    // Use specific project ID from frontend
    const { readConfig, decryptToken } = await import('@/lib/config.server');
    const config = await readConfig();
    const ENCRYPTION_KEY = process.env.CONFIG_ENCRYPTION_KEY;
    
    if (!config || !ENCRYPTION_KEY) {
      throw new Error('Configuration error');
    }

    const project = config.projects.find(p => p.projectid === projectId);
    if (!project) {
      throw new Error(`Project with ID ${projectId} not found`);
    }

    const token = decryptToken(
      project.tokenCiphertext,
      project.tokenNonce,
      project.tokenTag
    );

    const { GitLabAPIClient } = await import('@/lib/gitlab');
    const client = new GitLabAPIClient(
      project.gitlabHost,
      token,
      project.projectId
    );

    const allCherryPicks: any[] = [];

    if (method === 'all' || method === 'message') {
      const commits = await client.getCommits(undefined, 50);
      const messageBased = detectCherryPicksFromCommits(commits);
      allCherryPicks.push(...messageBased);
    }

    if (method === 'all' || method === 'label') {
      const mergeRequests = await client.getMergeRequests({ labels: 'cherry-pick' });
      const labelBased = detectCherryPicksFromMRs(mergeRequests);
      allCherryPicks.push(...labelBased);
    }

    return NextResponse.json(allCherryPicks);
  } catch (error) {
    return handleApiError(error);
  }
}