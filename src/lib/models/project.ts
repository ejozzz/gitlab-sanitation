//app/lib/models/project.ts
import { z } from "zod";
import type { Collection, Db } from "mongodb";
import { getDb } from "@/lib/db";

// All field names are lowercase to match the standard across the app.
export const ProjectSchema = z.object({
  name: z.string().min(1),
  gitlabhost: z.string().url().transform(s => s.replace(/\/+$/, "")),
  projectid: z.number().int().positive(),
  isactive: z.boolean().default(false),

  // Encrypted token (AES-GCM parts), always required when creating/updating a project
  tokenciphertext: z.string().min(1),
  tokennonce: z.string().min(1),
  tokentag: z.string().min(1),

  createdat: z.coerce.date().default(() => new Date()),
  updatedat: z.coerce.date().default(() => new Date()),
});

export type ProjectDTO = z.infer<typeof ProjectSchema>;
export type ProjectDoc = ProjectDTO & { _id: any };

export async function Projects(): Promise<Collection<ProjectDTO>> {
  const db: Db = await getDb();
  const col = db.collection<ProjectDTO>("Projects");

  // Idempotent indexes
  await col.createIndex({ projectid: 1 }, { unique: true });
  await col.createIndex({ isactive: 1 });
  await col.createIndex({ updatedat: -1, createdat: -1 });

  return col;
}
