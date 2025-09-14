import { NextRequest, NextResponse } from 'next/server';
import { readConfig, getActiveProjectConfig } from '@/lib/config';
import { writeFile } from 'fs/promises';
import { join } from 'path';

const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), 'data');
const CONFIG_FILE = join(DATA_DIR, 'config.json');

export async function GET() {
  try {
    const config = await readConfig();
    if (!config) {
      return NextResponse.json({ configured: false, projects: [] });
    }

    // Return config without sensitive data
    return NextResponse.json({
      configured: true,
      activeProjectId: config.activeProjectId,
      projectCount: config.projects.length,
      projects: config.projects.map(p => ({
        id: p.id,
        name: p.name,
        gitlabHost: p.gitlabHost,
        projectId: p.projectId,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      })),
      updatedAt: config.updatedAt,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to read configuration' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { activeProjectId } = await request.json();
    console.log('=== CONFIG API - Setting active project ===', activeProjectId);
    
    const config = await readConfig();
    if (!config) {
      return NextResponse.json(
        { error: 'No configuration found' },
        { status: 404 }
      );
    }

    // Update active project
    config.activeProjectId = activeProjectId;
    config.updatedAt = new Date().toISOString();

    console.log('Updated config activeProjectId to:', config.activeProjectId);
    
    await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Config API Error:', error);
    return NextResponse.json(
      { error: 'Failed to update configuration' },
      { status: 500 }
    );
  }
}