// src/app/api/projects/validate/route.ts
import { NextRequest, NextResponse } from "next/server";
import { encryptToken } from "@/lib/config.server";

export async function POST(req: NextRequest) {
  try {
    const { gitlabToken } = await req.json();
    if (!gitlabToken) {
      return NextResponse.json({ ok: false, error: "gitlabToken required" }, { status: 400 });
    }
    const enc = await encryptToken(gitlabToken);
    return NextResponse.json({ ok: true, sample: { ...enc, preview: gitlabToken.slice(0, 6) + "…" } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "validate failed" }, { status: 500 });
  }
}
