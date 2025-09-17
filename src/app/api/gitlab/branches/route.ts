// app/api/gitlab/branches/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getGitLabClientOrFail, handleApiError } from '@/lib/api-helpers';
import db from '@/lib/db'; // ← SQLITE

export async function GET(request: NextRequest) {
  try {
    console.log('=== API BRANCHES DEBUG ===');

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || undefined;
    const projectId = searchParams.get('projectId');

    console.log('Received projectId from frontend:', projectId);

    /* ---------- 1.  No projectId → use “active” (newest) project ---------- */
    if (!projectId) {
      console.log('No projectId provided, using active project from DB');

      const row = db
        .prepare(
          `SELECT id, name, gitlab_url, access_token,projectid
           FROM projects
           ORDER BY created_at DESC
           LIMIT 1`
        )
        .get();

      if (!row) {
        throw new Error('No project configured in DB');
      }

      const gitlabHost = row.gitlab_url.split('/api/v4/projects/')[0];
      const token      = row.access_token; // or decrypt if you stored encrypted
      const numericId  = row.gitlab_url.split('/api/v4/projects/')[1];

      console.log('Using project from DB →', row.name, 'ID:', numericId);

      const { GitLabAPIClient } = await import('@/lib/gitlab');
      const client = new GitLabAPIClient(gitlabHost, token, numericId);
      const branches = await client.getBranches(search);

      console.log('Found branches count:', branches.length);
      return NextResponse.json(branches);
    }

    /* ---------- 2.  Specific projectId supplied ---------- */
    console.log('Using specific projectId:', projectId);

    // Exact match on the numeric part we stored in gitlab_url
    const row = db
      .prepare(
        `SELECT id, name, gitlab_url, access_token,projectid
         FROM projects
         WHERE gitlab_url LIKE '%/projects/' || ?`
      )
      .get(projectId);

    if (!row) {
      throw new Error(`Project ${projectId} not found in DB`);
    }

    const gitlabHost = row.gitlab_url.split('/api/v4/projects/')[0];
    const token      = row.access_token;
    console.log('Created client for project:', row.name, 'URL:', row.gitlab_url);

    const { GitLabAPIClient } = await import('@/lib/gitlab');
    const client = new GitLabAPIClient(gitlabHost, token, projectId);
    const branches = await client.getBranches(search);

    console.log('Found branches count:', branches.length);
    return NextResponse.json(branches);
  } catch (error) {
    console.error('API Error:', error);
    return handleApiError(error);
  }
}