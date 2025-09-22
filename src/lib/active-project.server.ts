// src/lib/active-project.server.ts
import { Projects, Config } from "@/lib/db";
import { decryptToken } from "@/lib/config.server";

export type ActiveProjectConfig = {
  gitlabHost: string;
  projectId: number;
  token: string;
};

export async function getActiveProjectConfig(): Promise<ActiveProjectConfig | null> {
  const projectsCol = await Projects();
  const configCol = await Config();

  const kv = await configCol.findOne({ key: "activeProjectId" });
  let p: any | null = null;

  if (kv?.value) p = await projectsCol.findOne({ projectId: String(kv.value) });
  if (!p) p = await projectsCol.find({}).sort({ created_at: -1 }).limit(1).next();
  if (!p) return null;

  const gitlabHost =
    typeof p.gitlab_url === "string" && p.gitlab_url.includes("/api/v4/projects/")
      ? p.gitlab_url.split("/api/v4/projects/")[0].replace(/\/+$/, "")
      : (p.gitlabHost || "").replace(/\/+$/, "");

  const projectId = Number(p.projectId);
  if (!gitlabHost || !projectId || Number.isNaN(projectId)) return null;

  let token: string | null = null;
  if (p.token?.ciphertext && p.token?.nonce && p.token?.tag) {
    token = decryptToken(p.token.ciphertext, p.token.nonce, p.token.tag);
  } else if (p.access_token) {
    token = String(p.access_token); // legacy read; will be removed on next save
  }
  if (!token) return null;

  return { gitlabHost, projectId, token };
}
