// app/api/projects/route.ts
import { NextRequest, NextResponse } from "next/server";
import { Projects } from "@/lib/db";
import { validateSession } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/config.shared";
import { cookies } from "next/headers";
import { ObjectId } from "mongodb";
import { encryptToken } from "@/lib/config.server";

function toObjectId(v: any): ObjectId {
  return v instanceof ObjectId ? v : new ObjectId(String(v));
}

async function requireUserId(): Promise<ObjectId | null> {
  const store = await cookies();
  const sid = store.get(SESSION_COOKIE)?.value;
  if (!sid) return null;
  const s = await validateSession(sid);
  if (!s) return null;
  // your validateSession returns { userId, username, ... }
  const uid = (s as any).userId ?? (s as any).userid;
  return uid ? toObjectId(uid) : null;
}

export async function GET(req: NextRequest) {
  try {
    const uid = await requireUserId();
    if (!uid) return NextResponse.json([], { status: 200 }); // client shows "No user detected" if cookie missing

    const col = await Projects();
    const url = new URL(req.url);
    const isActiveParam = url.searchParams.get("isActive"); // optional

    const filter: any = { userid: uid };
    if (isActiveParam === "true") filter.isActive = true;
    if (isActiveParam === "false") filter.isActive = false;

    const rows = await col
      .find(filter, {
        projection: {
          userid: 1,
          name: 1,
          gitlab_url: 1,
          projectId: 1,
          created_at: 1,
          updated_at: 1,
          isActive: 1,
          token: 1,
          token_last4: 1,
        },
      })
      .sort({ created_at: -1 })
      .toArray();

    // IMPORTANT: return snake_case keys the page.tsx expects
    const items = rows.map((r: any) => ({
      userid: String(r.userid),
      id: String(r._id),
      name: r.name,
      gitlabhost:
        typeof r.gitlab_url === "string" && r.gitlab_url.includes("/api/v4/projects/")
          ? r.gitlab_url.split("/api/v4/projects/")[0]
          : "",
      projectid: String(r.projectId),
      isactive: !!r.isActive,
      createdat: r.created_at,
      updatedat: r.updated_at,
      // 👇 NEW: metadata only (never plaintext)
      hasToken: !!r.token,
      tokenLast4: r.token_last4 ?? null,
    }));


    return NextResponse.json(items);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "failed to fetch projects" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const uid = await requireUserId();
    if (!uid) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const name = String(body?.name ?? "").trim();
    const gitlabHost = String(body?.gitlabHost ?? "").trim().replace(/\/+$/, "");
    const projectId = String(body?.projectId ?? "").trim();
    const gitlabToken = String(body?.gitlabToken ?? "").trim();
    const isActive = Boolean(body?.isActive); // optional

    if (!name || !gitlabHost || !projectId || !gitlabToken) {
      return NextResponse.json(
        { error: "name, gitlabHost, projectId, gitlabToken are required" },
        { status: 400 }
      );
    }

    const gitlab_url = `${gitlabHost}/api/v4/projects/${projectId}`;
    const token = await encryptToken(gitlabToken);
    const col = await Projects();
    const now = new Date();

    if (isActive) {
      await col.updateMany({ userid: uid, isActive: true }, { $set: { isActive: false, updated_at: now } });
    }

    const doc = {
      userid: uid,
      name,
      gitlab_url,
      projectId,
      token,                           // { ciphertext, nonce, tag }
      token_last4: gitlabToken.slice(-4), // NEW: for UI masking
      isActive: !!isActive,
      created_at: now,
      updated_at: now,
    };

    const ins = await col.insertOne(doc);

    return NextResponse.json({ ok: true, id: String(ins.insertedId) });
  } catch (e: any) {
    // bubble up precise error
    return NextResponse.json({ error: e?.message || "failed to create project" }, { status: 500 });
  }
}
