import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Force the selected project for this one call to /api/gitlab/branches/[branch]/contains
export async function POST(req: NextRequest) {
  try {
    const origin = new URL(req.url).origin;
    const body = await req.json().catch(() => ({}));

    const branch: string = body?.branch ?? '';
    const targets: string[] = Array.isArray(body?.targets) ? body.targets : [];
    const projectId: string | undefined =
      body?.projectId ||
      body?.activeProjectId ||
      new URL(req.url).searchParams.get('projectId') ||
      undefined;

    if (!branch || !targets.length || !projectId) {
      return NextResponse.json(
        { error: 'Missing branch, targets, or projectId' },
        { status: 400 }
      );
    }

    // 1) Build querystring override (some routes read project from query)
    const qs = new URLSearchParams({
      projectId,
      activeProjectId: projectId,
    });

    // 2) Build cookie override (some routes read from cookie)
    const incomingCookie = req.headers.get('cookie') ?? '';
    const overrideCookies = `activeProjectId=${projectId}; projectId=${projectId}`;
    const mergedCookie = incomingCookie ? `${incomingCookie}; ${overrideCookies}` : overrideCookies;

    // 3) Add explicit headers too (some paths may check headers)
    const overrideHeaders: Record<string, string> = {
      'content-type': 'application/json',
      cookie: mergedCookie,
      'x-active-project-id': projectId,
      'x-project-id': projectId,
    };

    // Call the existing route with ALL overrides in place
    const url = `${origin}/api/gitlab/branches/${encodeURIComponent(branch)}/contains?${qs.toString()}`;
    const upstream = await fetch(url, {
      method: 'POST',
      headers: overrideHeaders,
      // IMPORTANT: body matches branches/[branch] (no projectId in body)
      body: JSON.stringify({ branch, targets }),
      cache: 'no-store',
    });

    const text = await upstream.text();
    try {
      const json = JSON.parse(text);
      return NextResponse.json(json, { status: upstream.status });
    } catch {
      return NextResponse.json(
        { error: `Upstream returned non-JSON (${upstream.status})`, text: text.slice(0, 500) },
        { status: upstream.status }
      );
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'proxy failed' }, { status: 500 });
  }
}
