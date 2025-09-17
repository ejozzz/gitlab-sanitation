// app/api/projects/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { settingsFormSchema, encryptToken } from '@/lib/config';
import { GitLabAPIClient } from '@/lib/gitlab';
import db from '@/lib/db';

const ENCRYPTION_KEY = process.env.CONFIG_ENCRYPTION_KEY;
if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 32) {
  throw new Error('CONFIG_ENCRYPTION_KEY must be set and 32 characters long');
}

/* ----------  GET  ---------- */
export async function GET() {
  try {
    const rows = db
      .prepare('SELECT id, name, gitlab_url FROM projects ORDER BY name ASC')
      .all();
    return NextResponse.json(rows);
  } catch (e: any) {
    console.error('GET /api/projects', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/* ----------  POST  ---------- */
export async function POST(request: NextRequest) {
  try {
    const body       = await request.json();
    const validated  = settingsFormSchema.parse(body);

    // ----- validate token & fetch user/project info -----
    const client = new GitLabAPIClient(
      validated.gitlabHost,
      validated.gitlabToken,
      validated.projectId
    );
    const { user, project } = await client.validateToken();

    // ----- encrypt token (optional – you can store plain if you prefer) -----
    const encrypted = encryptToken(validated.gitlabToken, ENCRYPTION_KEY!);

    console.log('Start inserting to project');

    // ----- insert into SQLite  (positional binding) -----
    const stmt = db.prepare(`
      INSERT INTO projects (name, gitlab_url, access_token,projectid)
      VALUES (?, ?, ?, ?)
    `);
    const info = stmt.run(
      validated.name,
      `${validated.gitlabHost}/api/v4/projects/${validated.projectId}`,
      validated.gitlabToken, // or encrypted.ciphertext if you want encrypted
      validated.projectId
    );

    // ----- return public part to UI -----
    return NextResponse.json({
      project: {
        id:   info.lastInsertRowid,
        name: validated.name,
        gitlab_url: `${validated.gitlabHost}/api/v4/projects/${validated.projectId}`,
        projectid: validated.projectId,
      },
      user: {
        name:     user.name,
        username: user.username,
      },
      projectDetails: {
        name:                  project.name,
        path_with_namespace:   project.path_with_namespace,
      },
    });
  } catch (error: any) {
    console.error('POST /api/projects', error);
    return NextResponse.json(
      { error: error.message || 'Failed to add project' },
      { status: 400 }
    );
  }
}