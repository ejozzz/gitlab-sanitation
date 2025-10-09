// lib/cookie.ts
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/config.shared";

export async function readSessionId(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}