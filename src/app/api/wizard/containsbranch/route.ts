import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

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

    // --- OVERRIDES: query, headers, and cookie (keep auth cookies) ---
    const qs = new URLSearchParams({
      projectId,
      activeProjectId: projectId,
    });

    // keep auth cookies (login/session), but append project override cookies
    const incomingCookie = req.headers.get('cookie') ?? '';
    const overrideCookies = `activeProjectId=${projectId}; projectId=${projectId}`;
    const mergedCookie = incomingCookie ? `${incomingCookie}; ${overrideCookies}` : overrideCookies;

    const headers: Record<string, string> = {
      'content-type': 'application/json',
      // project override signals for any code path that checks headers
      'x-active-project-id': projectId,
      'x-project-id': projectId,
      // auth + project override for cookie-based readers
      cookie: mergedCookie,
    };

    // Call the existing contains endpoint (same body shape as branch page)
    const url = `${origin}/api/gitlab/branches/${encodeURIComponent(branch)}/contains?${qs.toString()}`;
    const upstream = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ branch, targets }),
      cache: 'no-store',
      // not strictly required server->server, but harmless
      credentials: 'include',
    });

    const text = await upstream.text();
    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      // bubble up upstream body for easier debugging
      return NextResponse.json(
        {
          error: `Upstream returned non-JSON (${upstream.status})`,
          forwardedTo: url,
          usedProjectId: projectId,
          upstreamBody: text.slice(0, 500),
        },
        { status: upstream.status }
      );
    }

    return NextResponse.json(
      {
        ...json,
        _wizardDebug: {
          forwardedTo: url,
          usedProjectId: projectId,
          status: upstream.status,
          targetsCount: targets.length,
        },
      },
      { status: upstream.status }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'wizard contains failed' }, { status: 500 });
  }
}
