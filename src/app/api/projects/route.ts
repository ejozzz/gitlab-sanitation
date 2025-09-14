import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { configSchema, projectConfigSchema, settingsFormSchema, encryptToken } from '@/lib/config';
import { GitLabAPIClient } from '@/lib/gitlab';
import { randomUUID } from 'crypto';

const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), 'data');
const CONFIG_FILE = join(DATA_DIR, 'config.json');
const ENCRYPTION_KEY = process.env.CONFIG_ENCRYPTION_KEY;

if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 32) {
  throw new Error('CONFIG_ENCRYPTION_KEY must be set and 32 characters long');
}

async function ensureDataDir() {
  try {
    await mkdir(DATA_DIR, { recursive: true });
  } catch (error) {
    // Directory might already exist
  }
}

export async function GET() {
  try {
    const data = await readFile(CONFIG_FILE, 'utf-8').catch(() => null);
    if (!data) {
      return NextResponse.json([]);
    }

    const parsed = configSchema.parse(JSON.parse(data));
    
    // Return projects without tokens (for security)
    const projects = parsed.projects.map(project => ({
      id: project.id,
      name: project.name,
      gitlabHost: project.gitlabHost,
      projectId: project.projectId,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    }));

    return NextResponse.json(projects);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to read projects' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = settingsFormSchema.parse(body);

    await ensureDataDir();

    // Validate GitLab connection
    const client = new GitLabAPIClient(
      validated.gitlabHost,
      validated.gitlabToken,
      validated.projectId
    );

    const { user, project } = await client.validateToken();

    // Load existing config or create new
    let config: any;
    try {
      const existingData = await readFile(CONFIG_FILE, 'utf-8');
      config = configSchema.parse(JSON.parse(existingData));
    } catch {
      config = { projects: [], activeProjectId: null };
    }

    // Create new project
    const encrypted = encryptToken(validated.gitlabToken, ENCRYPTION_KEY!);
    const newProject = {
      id: randomUUID(),
      name: validated.name,
      gitlabHost: validated.gitlabHost,
      projectId: validated.projectId,
      tokenCiphertext: encrypted.ciphertext,
      tokenNonce: encrypted.nonce,
      tokenTag: encrypted.tag,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    config.projects.push(newProject);
    
    // Set as active if it's the first project
    if (config.projects.length === 1) {
      config.activeProjectId = newProject.id;
    }

    config.updatedAt = new Date().toISOString();

    await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));

    return NextResponse.json({
      project: {
        id: newProject.id,
        name: newProject.name,
        gitlabHost: newProject.gitlabHost,
        projectId: newProject.projectId,
      },
      user: {
        name: user.name,
        username: user.username,
      },
      projectDetails: {
        name: project.name,
        path_with_namespace: project.path_with_namespace,
      },
    });
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to add project' },
      { status: 400 }
    );
  }
}