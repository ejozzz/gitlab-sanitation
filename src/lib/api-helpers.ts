// src/lib/api-helpers.ts
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { ObjectId } from 'mongodb';
import { GitLabAPIClient } from '@/lib/gitlab';
import { Projects } from '@/lib/db';
import { validateSession } from '@/lib/auth';
import { SESSION_COOKIE } from '@/lib/config.shared';
import { decryptToken } from '@/lib/config.server';

/** Normalize possible field names in your Projects doc */
function pickHost(doc: any): string | undefined {
  return doc?.gitlabHost ?? doc?.gitlabhost ?? doc?.gitlab_url;
}
function pickProjectId(doc: any): number | undefined {
  const v = doc?.projectId ?? doc?.projectid ?? doc?.id;
  if (v == null) return undefined;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}
function pickEncToken(doc: any): { ciphertext: string; nonce: string; tag: string } | undefined {
  const t = doc?.token;
  if (!t?.ciphertext || !t?.nonce || !t?.tag) return undefined;
  return t;
}

/**
 * Load a project config by an explicit projectId (preferred path).
 */
async function loadProjectById(projectId: string | number) {
  const col = await Projects();
  // Store as string in DB? This covers both.
  const doc =
    (await col.findOne({ projectId: String(projectId) } as any)) ??
    (await col.findOne({ id: String(projectId) } as any));
  if (!doc) return null;

  const host = pickHost(doc);
  const pid = pickProjectId(doc);
  const enc = pickEncToken(doc);
  if (!host || !pid || !enc) return null;

  const token = decryptToken(enc.ciphertext, enc.nonce, enc.tag);
  return { gitlabHost: String(host), projectId: pid, token };
}

/**
 * Resolve current user's active project from DB via session cookie.
 */
async function loadActiveProjectFromSession() {
  const sid = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!sid) return null;

  const auth = await validateSession(sid);
  if (!auth?.userId) return null;

  const col = await Projects();
  const doc = await col.findOne({ userid: new ObjectId(auth.userId), isActive: true } as any);
  if (!doc) return null;

  const host = pickHost(doc);
  const pid = pickProjectId(doc);
  const enc = pickEncToken(doc);
  if (!host || !pid || !enc) return null;

  const token = decryptToken(enc.ciphertext, enc.nonce, enc.tag);
  return { gitlabHost: String(host), projectId: pid, token };
}

/**
 * Main resolver that matches your new implementation:
 * 1) If URL has ?projectId= or ?activeProjectId=, use that directly.
 * 2) Otherwise, fall back to user's active project (isActive: true).
 */
async function resolveGitLabConfig(req?: NextRequest) {
  let fromUrl: URL | null = null;
  try {
    if (req?.url) fromUrl = new URL(req.url);
  } catch {
    // ignore
  }

  const q = fromUrl?.searchParams;
  const explicitId =
    q?.get('projectId') ??
    q?.get('activeProjectId') ??
    undefined;

  if (explicitId) {
    const direct = await loadProjectById(explicitId);
    if (direct) return direct;
    // if explicitId provided but not found, treat as 404
    const e: any = new Error('Project not found for provided projectId.');
    e.status = 404;
    throw e;
  }

  const active = await loadActiveProjectFromSession();
  if (active) return active;

  const e: any = new Error('No active project selected. Provide ?projectId=… or activate one in Settings.');
  e.status = 401;
  throw e;
}

/** Soft getter that returns null instead of throwing. */
export async function getGitLabClient(req?: NextRequest): Promise<GitLabAPIClient | null> {
  try {
    const cfg = await resolveGitLabConfig(req);
    return new GitLabAPIClient(cfg.gitlabHost, cfg.token, cfg.projectId);
  } catch {
    return null;
  }
}

/** Strict variant used by API routes. Throws with a proper status. */
export async function getGitLabClientOrFail(req?: NextRequest): Promise<GitLabAPIClient> {
  const cfg = await resolveGitLabConfig(req);
  return new GitLabAPIClient(cfg.gitlabHost, cfg.token, cfg.projectId);
}

/** Unified error handler for API routes. */
export function handleApiError(error: unknown) {
  const e = error as any;
  const status = typeof e?.status === 'number' ? e.status : 500;
  const message =
    status === 401
      ? 'No active project selected. Provide ?projectId=… or activate a project in Settings.'
      : e?.message ?? 'An unexpected error occurred';
  return NextResponse.json({ error: message }, { status });
}
