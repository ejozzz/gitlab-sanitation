import { NextRequest, NextResponse } from 'next/server';
import { getGitLabClientOrFail, handleApiError } from '@/lib/api-helpers';

export async function GET(
  request: NextRequest,
  { params }: { params: { iid: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');

    if (!projectId) {
      const client = await getGitLabClientOrFail();
      const approvals = await client.getMergeRequestApprovals(parseInt(params.iid));
      return NextResponse.json(approvals);
    }

    // Use specific project ID from frontend
    const { readConfig, decryptToken } = await import('@/lib/config');
    const config = await readConfig();
    const ENCRYPTION_KEY = process.env.CONFIG_ENCRYPTION_KEY;
    
    if (!config || !ENCRYPTION_KEY) {
      throw new Error('Configuration error');
    }

    const project = config.projects.find(p => p.id === projectId);
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

    const approvals = await client.getMergeRequestApprovals(parseInt(params.iid));
    
    return NextResponse.json(approvals);
  } catch (error) {
    return handleApiError(error);
  }
}