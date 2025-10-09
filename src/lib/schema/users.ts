// //app/lib/models/project.ts
// import { z } from "zod";
// import type { Collection, Db } from "mongodb";
// import { getDb } from "@/lib/db";

// // All field names are lowercase to match the standard across the app.
// export const UsersSchema = z.object({
//   username: z.string().min(1),
//   password_hash:  z.string().min(1),
//   create_dat: z.coerce.date().default(() => new Date()),
//   updated_at: z.coerce.date().default(() => new Date()),
// });

// export type UsersDTO = z.infer<typeof UsersSchema>;
// export type UsersDoc = UsersDTO & { _id: any };

// export async function Users(): Promise<Collection<UsersDTO>> {
//   const db: Db = await getDb();
//   const col = db.collection<UsersDTO>("Users");

//   // Idempotent indexes
//   await col.createIndex({ username: 1 }, { unique: true });
//   await col.createIndex({ updatedat: -1, createdat: -1 });

//   return col;
// }
