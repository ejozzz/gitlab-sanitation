import { NextRequest, NextResponse } from 'next/server';
import { getGitLabClientOrFail, handleApiError } from '@/lib/api-helpers';

export async function GET(request: NextRequest) {
  try {
    console.log('=== API BRANCHES DEBUG ===');
    
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || undefined;
    const projectId = searchParams.get('projectId');
    
    console.log('Received projectId from frontend:', projectId);

    if (!projectId) {
      console.log('No projectId provided, using active project from config');
      const client = await getGitLabClientOrFail();
      console.log('Using projectId from config:', client.getProjectId());
      
      const branches = await client.getBranches(search);
      console.log('Found branches count:', branches.length);
      return NextResponse.json(branches);
    }

    // Use the specific project ID from frontend
    console.log('Using specific projectId:', projectId);
    
    // Get config to find this project
    const { readConfig } = await import('@/lib/config');
    const config = await readConfig();
    
    if (!config) {
      throw new Error('No configuration found');
    }

    const project = config.projects.find(p => p.id === projectId);
    if (!project) {
      throw new Error(`Project with ID ${projectId} not found`);
    }

    // Decrypt token and create client for this specific project
    const { decryptToken } = await import('@/lib/config');
    const ENCRYPTION_KEY = process.env.CONFIG_ENCRYPTION_KEY;
    
    if (!ENCRYPTION_KEY) {
      throw new Error('CONFIG_ENCRYPTION_KEY not set');
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

    console.log('Created client for project:', project.name, 'ID:', project.id);
    const branches = await client.getBranches(search);
    console.log('Found branches count:', branches.length);
    
    return NextResponse.json(branches);
  } catch (error) {
    console.error('API Error:', error);
    return handleApiError(error);
  }
}