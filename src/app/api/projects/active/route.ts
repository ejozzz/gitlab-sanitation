// app/api/projects/active/route.ts
import { NextResponse } from 'next/server';
import db from '@/lib/db';

export async function GET() {
  try {
    // pick the newest row as “active”
    const row = db
      .prepare(
        `SELECT id, name, gitlab_url
         FROM projects
         ORDER BY created_at DESC
         LIMIT 1`
      )
      .get();

    if (!row) {
      return NextResponse.json({ error: 'No project configured' }, { status: 404 });
    }

    return NextResponse.json({
      id: row.id,
      name: row.name,
      gitlab_url: row.gitlab_url,
    });
  } catch (e: any) {
    console.error('GET /api/projects/active', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}