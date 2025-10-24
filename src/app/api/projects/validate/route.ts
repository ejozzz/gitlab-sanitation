import { NextRequest, NextResponse } from "next/server";
import { Projects } from "@/lib/db";
import { decryptToken } from "@/lib/config.server"; // IMPORTANT: your 3-arg version
import { cookies } from "next/headers";
import { validateSession } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/config.shared";
import { ObjectId } from "mongodb";

async function requireUserId(): Promise<ObjectId | null> {
  const store = await cookies();
  const sid = store.get(SESSION_COOKIE)?.value;
  if (!sid) return null;
  const s = await validateSession(sid);
  const uid = (s as any)?.userId ?? (s as any)?.userid;
  return uid ? new ObjectId(String(uid)) : null;
}

export async function POST(req: NextRequest) {
  try {
    const uid = await requireUserId();
    if (!uid) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const gitlabTokenInput = String(body?.gitlabToken ?? "").trim(); // optional
    const projectIdInput = String(body?.projectId ?? "").trim();     // optional: if omitted, use active

    // 1) Load project (active or by projectId) to get host + projectId (+ encrypted token if needed)
    const col = await Projects();
    const filter: any = { userid: uid };
    if (projectIdInput) filter.projectId = projectIdInput;
    else filter.isActive = true;

    const doc = await col.findOne(filter, {
      projection: { gitlab_url: 1, projectId: 1, token: 1 },
    });

    if (!doc) {
      return NextResponse.json({ ok: false, error: "no project found" }, { status: 404 });
    }

    const gitlabHost =
      typeof doc.gitlab_url === "string" && doc.gitlab_url.includes("/api/v4/projects/")
        ? doc.gitlab_url.split("/api/v4/projects/")[0]
        : "";
    const projectId = String(doc.projectId ?? "");

    // 2) Decide which token to use
    let tokenToUse = gitlabTokenInput;
    if (!tokenToUse) {
      // Use stored encrypted token
      const enc = doc.token;
      if (!enc || !enc.ciphertext || !enc.nonce) {
        return NextResponse.json({ ok: false, error: "no token available to test" }, { status: 200 });
      }
      // ⚠️ Your decryptToken signature is (ciphertext, nonce, tag)
      tokenToUse = await decryptToken(enc.ciphertext, enc.nonce, enc.tag);
    }

    // 3) Test against GitLab (read-only project endpoint)
    const pingUrl = `${gitlabHost}/api/v4/projects/${encodeURIComponent(projectId)}`;
    const res = await fetch(pingUrl, {
      headers: {
        Authorization: `Bearer ${tokenToUse}`,
        // or: "PRIVATE-TOKEN": tokenToUse,
      },
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return NextResponse.json(
        { ok: false, error: `gitlab responded ${res.status}`, detail: text?.slice(0, 4000) ?? "" },
        { status: 200 } // keep 200 to render nicely in UI
      );
    }

    return NextResponse.json({ ok: true, message: "Token works for this project." });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "validate failed" }, { status: 200 });
  }
}
