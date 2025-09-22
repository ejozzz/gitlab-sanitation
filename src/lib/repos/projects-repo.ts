//app/lib/repos/project-repo.ts
import { ObjectId } from "mongodb";
import { Projects, ProjectSchema, type ProjectDoc } from "@/lib/models/project";
import { decryptToken } from "@/lib/config.server";

/** List all projects. */
export async function listProjects(): Promise<ProjectDoc[]> {
  const col = await Projects();
  return col.find({}).sort({ updatedat: -1 }).toArray() as any;
}

/** Find one by numeric projectid. */
export async function getProjectByProjectId(projectid: number): Promise<ProjectDoc | null> {
  const col = await Projects();
  return (await col.findOne({ projectid })) as any;
}

/** Explicit insert (save new). */
export async function createProject(input: {
  name: string;
  gitlabhost: string;
  projectid: number;
  isactive?: boolean;
  tokenciphertext: string;
  tokennonce: string;
  tokentag: string;
}) {
  const col = await Projects();
  const now = new Date();

  const parsed = ProjectSchema.parse({
    ...input,
    isactive: !!input.isactive,
    createdat: now,
    updatedat: now,
  });

  const res = await col.insertOne(parsed as any);
  return res;
}

/** Explicit update (must already exist). */
export async function updateProject(projectid: number, changes: Partial<ProjectDoc>) {
  const col = await Projects();
  const set: Record<string, any> = { updatedat: new Date() };

  if (changes.name !== undefined) set.name = changes.name;
  if (changes.gitlabhost !== undefined) set.gitlabhost = changes.gitlabhost.replace(/\/+$/, "");
  if (changes.isactive !== undefined) set.isactive = !!changes.isactive;
  if (changes.tokenciphertext && changes.tokennonce && changes.tokentag) {
    set.tokenciphertext = changes.tokenciphertext;
    set.tokennonce = changes.tokennonce;
    set.tokentag = changes.tokentag;
  }

  return col.updateOne({ projectid }, { $set: set });
}

/**
 * Upsert: if project exists → update; if not → create.
 */
export async function upsertProject(input: {
  name: string;
  gitlabhost: string;
  projectid: number;
  isactive?: boolean;
  tokenciphertext?: string;
  tokennonce?: string;
  tokentag?: string;
}) {
  const existing = await getProjectByProjectId(input.projectid);
  if (!existing) {
    // New project → require encrypted token
    if (!input.tokenciphertext || !input.tokennonce || !input.tokentag) {
      throw new Error("Encrypted token required when creating new project");
    }
    return createProject({
      name: input.name,
      gitlabhost: input.gitlabhost,
      projectid: input.projectid,
      isactive: input.isactive,
      tokenciphertext: input.tokenciphertext,
      tokennonce: input.tokennonce,
      tokentag: input.tokentag,
    });
  }

  // Existing project → update, token optional
  return updateProject(existing.projectid, input);
}

/** Return active project (first isactive=true, else most recent). */
export async function getActiveProject(): Promise<ProjectDoc | null> {
  const col = await Projects();
  const act = await col.findOne({ isactive: true });
  if (act) return act as any;
  return (await col.find({}).sort({ updatedat: -1, createdat: -1 }).limit(1).next()) as any;
}

/** Mark one project active, reset others. */
export async function setActiveProjectById(projectidOrMongoId: string | number) {
  const col = await Projects();
  const query =
    typeof projectidOrMongoId === "number" || /^\d+$/.test(String(projectidOrMongoId))
      ? { projectid: Number(projectidOrMongoId) }
      : { _id: new ObjectId(String(projectidOrMongoId)) };

  const target = await col.findOne(query);
  if (!target) throw new Error("Project not found");

  await col.updateMany({ isactive: true }, { $set: { isactive: false } });
  await col.updateOne({ _id: (target as any)._id }, { $set: { isactive: true, updatedat: new Date() } });
  return target as any;
}

/** Always decrypt token at use time (encrypted at rest). */
export function materializeToken(p: ProjectDoc): string {
  return decryptToken(p.tokenciphertext, p.tokennonce, p.tokentag);
}
