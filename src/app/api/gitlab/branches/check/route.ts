//app/api/gitlab/branches/check/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getGitLabClientOrFail, handleApiError } from '@/lib/api-helpers';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const branchName = searchParams.get('name');
    const projectId = searchParams.get('projectid');

    if (!branchName) {
      return NextResponse.json(
        { error: 'Branch name is required' },
        { status: 400 }
      );
    }

    if (!projectId) {
      const client = await getGitLabClientOrFail();
      const branch = await client.getBranch(branchName);
      
      return NextResponse.json({
        exists: !!branch,
        branch: branch ? {
          name: branch.name,
          lastCommit: branch.commit.authored_date,
          author: branch.commit.author_name,
        } : null,
      });
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

    const branch = await client.getBranch(branchName);
    
    return NextResponse.json({
      exists: !!branch,
      branch: branch ? {
        name: branch.name,
        lastCommit: branch.commit.authored_date,
        author: branch.commit.author_name,
      } : null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}