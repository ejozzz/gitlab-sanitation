// src/lib/api-helpers.ts
import { NextRequest, NextResponse } from 'next/server';
import { getActiveProjectConfig } from './active-project.server';
import { GitLabAPIClient } from './gitlab';

export async function getGitLabClient(): Promise<GitLabAPIClient | null> {
  // Always get the current active project (not cached)
  const config = await getActiveProjectConfig();
  if (!config) return null;

  return new GitLabAPIClient(
    config.gitlabHost,
    config.token,
    config.projectId
  );
}

export async function getGitLabClientOrFail(): Promise<GitLabAPIClient> {
  const config = await getActiveProjectConfig();
  if (!config) {
    throw new Error('No active project configured');
  }

  return new GitLabAPIClient(
    config.gitlabHost,
    config.token,
    config.projectId
  );
}

export function handleApiError(error: unknown): NextResponse {
  if (error instanceof Error) {
    if (error.message === 'No active project configured') {
      return NextResponse.json(
        { error: 'No project selected. Please configure a project in settings.' },
        { status: 401 }
      );
    }
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
  
  return NextResponse.json(
    { error: 'An unexpected error occurred' },
    { status: 500 }
  );
}