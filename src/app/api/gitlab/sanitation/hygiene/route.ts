import { NextRequest, NextResponse } from 'next/server';
import { getGitLabClientOrFail, handleApiError } from '@/lib/api-helpers';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');

    if (!projectId) {
      const client = await getGitLabClientOrFail();

      const mergeRequests = await client.getMergeRequests({ state: 'opened' });
      const branches = await client.getBranches();

      const hygiene = {
        draftCount: mergeRequests.filter(mr => mr.draft).length,
        noReviewersCount: mergeRequests.filter(mr => !mr.assignees || mr.assignees.length === 0).length,
        noLabelsCount: mergeRequests.filter(mr => mr.labels.length === 0).length,
        staleBranchesCount: branches.filter(branch => {
          const daysSinceCommit = (Date.now() - new Date(branch.commit.authored_date).getTime()) / (1000 * 60 * 60 * 24);
          return daysSinceCommit > 90 && !branch.protected;
        }).length,
      };

      return NextResponse.json(hygiene);
    }

    // Use specific project ID from frontend
    const { readConfig, decryptToken } = await import('@/lib/config');
    const config = await readConfig();
    const ENCRYPTION_KEY = process.env.CONFIG_ENCRYPTION_KEY;
    
    if (!config || !ENCRYPTION_KEY) {
      throw new Error('Configuration error');
    }

    const project = config.projects.find(p => p.projectId === projectId);
    if (!project) {
      throw new Error(`Project with ID ${projectId} not found`);
    }

    const token = decryptToken(
      project.tokenCiphertext,
      project.tokenNonce,
      project.tokenTag,
      ENCRYPTION_KEY
    );

    const { GitLabAPIClient } = await import('@/lib/gitlab');
    const client = new GitLabAPIClient(
      project.gitlabHost,
      token,
      project.projectId
    );

    const mergeRequests = await client.getMergeRequests({ state: 'opened' });
    const branches = await client.getBranches();

    const hygiene = {
      draftCount: mergeRequests.filter(mr => mr.draft).length,
      noReviewersCount: mergeRequests.filter(mr => !mr.assignees || mr.assignees.length === 0).length,
      noLabelsCount: mergeRequests.filter(mr => mr.labels.length === 0).length,
      staleBranchesCount: branches.filter(branch => {
        const daysSinceCommit = (Date.now() - new Date(branch.commit.authored_date).getTime()) / (1000 * 60 * 60 * 24);
        return daysSinceCommit > 90 && !branch.protected;
      }).length,
    };

    return NextResponse.json(hygiene);
  } catch (error) {
    return handleApiError(error);
  }
}