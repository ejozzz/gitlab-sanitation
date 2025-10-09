// src/app/api/watchlist/route.ts
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function parseWatchlistEnv(raw: string | undefined): string[] {
  if (!raw) return [];
  // allow commas OR newlines; trim each; drop empties
  return raw
    .split(/[\n,]/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function GET() {
  // Support either name; use whichever you prefer in .env.local
  const raw = process.env.WATCHLIST_BRANCH ?? process.env.WATCHLIST_BRANCHES;
  const branches = parseWatchlistEnv(raw);

  return NextResponse.json({
    source: raw ? 'env' : 'default',
    branches,
  });
}
