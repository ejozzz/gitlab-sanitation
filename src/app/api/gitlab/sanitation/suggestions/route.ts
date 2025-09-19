import { NextRequest, NextResponse } from 'next/server';
import { getGitLabClientOrFail, handleApiError } from '@/lib/api-helpers';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');

    if (!projectId) {
      const client = await getGitLabClientOrFail();

      // Get inactive branches (90+ days old)
      const branches = await client.getBranches();
      const staleBranches = branches.filter(branch => {
        const daysSinceCommit = (Date.now() - new Date(branch.commit.authored_date).getTime()) / (1000 * 60 * 60 * 24);
        return daysSinceCommit > 90 && !branch.protected && !branch.merged;
      });

      // Get draft MRs older than 7 days
      const mergeRequests = await client.getMergeRequests({ state: 'opened' });
      const staleDraftMRs = mergeRequests.filter(mr => 
        mr.draft && 
        (Date.now() - new Date(mr.created_at).getTime()) / (1000 * 60 * 60 * 24) > 7
      );

      const suggestions = [
        ...staleBranches.map(branch => ({
          type: 'branch',
          id: branch.name,
          title: branch.name,
          reason: 'Branch inactive for 90+ days',
          age: Math.floor((Date.now() - new Date(branch.commit.authored_date).getTime()) / (1000 * 60 * 60 * 24)),
          url: branch.web_url,
        })),
        ...staleDraftMRs.map(mr => ({
          type: 'mr',
          id: mr.iid.toString(),
          title: `!${mr.iid} ${mr.title}`,
          reason: 'Draft MR older than 7 days',
          age: Math.floor((Date.now() - new Date(mr.created_at).getTime()) / (1000 * 60 * 60 * 24)),
          url: mr.web_url,
        })),
      ];

      return NextResponse.json(suggestions);
    }

    // Use specific project ID from frontend
    const { readConfig, decryptToken } = await import('@/lib/config.server');
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

    // Get inactive branches (90+ days old)
    const branches = await client.getBranches();
    const staleBranches = branches.filter(branch => {
      const daysSinceCommit = (Date.now() - new Date(branch.commit.authored_date).getTime()) / (1000 * 60 * 60 * 24);
      return daysSinceCommit > 90 && !branch.protected && !branch.merged;
    });

    // Get draft MRs older than 7 days
    const mergeRequests = await client.getMergeRequests({ state: 'opened' });
    const staleDraftMRs = mergeRequests.filter(mr => 
      mr.draft && 
      (Date.now() - new Date(mr.created_at).getTime()) / (1000 * 60 * 60 * 24) > 7
    );

    const suggestions = [
      ...staleBranches.map(branch => ({
        type: 'branch',
        id: branch.name,
        title: branch.name,
        reason: 'Branch inactive for 90+ days',
        age: Math.floor((Date.now() - new Date(branch.commit.authored_date).getTime()) / (1000 * 60 * 60 * 24)),
        url: branch.web_url,
      })),
      ...staleDraftMRs.map(mr => ({
        type: 'mr',
        id: mr.iid.toString(),
        title: `!${mr.iid} ${mr.title}`,
        reason: 'Draft MR older than 7 days',
        age: Math.floor((Date.now() - new Date(mr.created_at).getTime()) / (1000 * 60 * 60 * 24)),
        url: mr.web_url,
      })),
    ];

    return NextResponse.json(suggestions);
  } catch (error) {
    return handleApiError(error);
  }
}