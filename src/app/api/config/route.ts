import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';

/* ----------  GET  ---------- */
export async function GET() {
  try {
    const rows = db.prepare(
      `SELECT id, name, gitlab_url, created_at, updated_at
       FROM projects
       ORDER BY created_at DESC`
    ).all();

    return NextResponse.json({
      configured: rows.length > 0,
      activeProjectId: rows[0]?.id ?? null,   // simplest: newest = active
      projectCount: rows.length,
      projects: rows.map((r: any) => ({
        id: r.id,
        name: r.name,
        gitlabHost: r.gitlab_url.split('/api/v4/projects/')[0], // derive host
        projectId: r.gitlab_url.split('/api/v4/projects/')[1],
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
      updatedAt: rows[0]?.updated_at ?? null,
    });
  } catch (e: any) {
    console.error('GET /api/config', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/* ----------  POST  – switch active project ---------- */
export async function POST(request: NextRequest) {
  try {
    const { activeProjectId } = await request.json();

    // We simply store the active-project id in a single-row table
    db.prepare(
      `INSERT OR REPLACE INTO config (key, value)
       VALUES ('activeProjectId', @id)`
    ).run({ id: String(activeProjectId) });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error('POST /api/config', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}