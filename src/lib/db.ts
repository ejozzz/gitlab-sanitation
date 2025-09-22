// lib/db.ts
import { MongoClient, Db, Collection, ServerApiVersion, IndexSpecification } from "mongodb";

/**
 * ENV
 */
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017";
const MONGODB_DB = process.env.MONGODB_DB || "gitlab_sanitation";

/**
 * Global client cache (important for Next.js dev to avoid multiple clients)
 */
declare global {
  // eslint-disable-next-line no-var
  var __mongoClient: MongoClient | undefined;
}
let _client: MongoClient | undefined;
let _db: Db | undefined;

/**
 * Types (Mongo “documents”)
 */
export interface User {
  _id?: any;
  username: string;
  password_hash: string;
  created_at?: Date;
  updated_at?: Date;
}

export interface UserProject {
  _id?: any;
  user_id: any; // store User _id (ObjectId or string—keep consistent)
  name: string;
  gitlab_host: string;
  project_id: string;
  token: {
    ciphertext: string;
    nonce: string;
    tag: string;
  };
  is_active?: boolean;
  created_at?: Date;
  updated_at?: Date;
}

export interface UserSession {
  _id: string;          // keep your TEXT primary key style
  user_id: any;         // User _id
  created_at?: Date;
  expires_at: Date;     // TTL will be applied on this field
}

export interface Project {
  _id?: any;
  name: string;
  gitlab_url: string;
  projectId: string;
  created_at?: Date;
  updated_at?: Date;
  isActive?:boolean;
  token?: {
    ciphertext: string;
    nonce: string;
    tag: string;
  };
}

export interface ConfigKV {
  _id?: any;
  key: string;
  value: string;
}

/**
 * Connect & init (create collections + indexes once)
 */
async function connectMongo(): Promise<Db> {
  if (_db) return _db;

  if (!_client) {
    _client =
      global.__mongoClient ??
      new MongoClient(MONGODB_URI, {
        serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
      });

    // cache on global in dev
    if (process.env.NODE_ENV !== "production") {
      global.__mongoClient = _client;
    }
  }

  await _client.connect();

  _db = _client.db(MONGODB_DB);
  await initializeDatabase(_db);
  return _db;
}

/**
 * Create collections (if missing) and ensure indexes (SQLite “constraints”)
 */
async function initializeDatabase(db: Db) {
  // Create collections idempotently
  const existing = new Set((await db.listCollections().toArray()).map(c => c.name));
  const ensure = async (name: string) => {
    if (!existing.has(name)) await db.createCollection(name);
    return db.collection(name);
  };

  const users = await ensure("users");
  const user_projects = await ensure("user_projects");
  const user_sessions = await ensure("user_sessions");
  const projects = await ensure("projects");
  const config = await ensure("config");

  // ----- users -----
  await users.createIndexes([
    { key: { username: 1 }, unique: true },
  ]);

  // ----- user_projects -----
  await user_projects.createIndexes([
    { key: { user_id: 1 } },
    { key: { is_active: 1 } },
    // Prevent duplicate names per user
    { key: { user_id: 1, name: 1 }, unique: true },
    // Optional: prevent duplicate project_id per user
    { key: { user_id: 1, project_id: 1 }, unique: true },
  ]);

  // ----- user_sessions -----
  // Keep your string id as _id; add TTL on expires_at
 await user_sessions.createIndexes([
  { key: { user_id: 1 }, name: "user_sessions_user_id" },
  // TTL index: document expires at the time in `expires_at`
  { key: { expires_at: 1 }, expireAfterSeconds: 0, name: "user_sessions_expires_ttl" },
]);

  // ----- projects (global list) -----
  await projects.createIndexes([
    { key: { projectId: 1 }, unique: true },
    { key: { name: 1 } },
  ]);

  // ----- config (single-row KV with unique key) -----
  await config.createIndexes([
    { key: { key: 1 }, unique: true },
  ]);
}

/**
 * Helpers to get typed collections
 */
export async function getDb(): Promise<Db> {
  return connectMongo();
}
export async function Users(): Promise<Collection<User>> {
  return (await getDb()).collection<User>("users");
}
export async function UserProjects(): Promise<Collection<UserProject>> {
  return (await getDb()).collection<UserProject>("user_projects");
}
export async function UserSessions(): Promise<Collection<UserSession>> {
  return (await getDb()).collection<UserSession>("user_sessions");
}
export async function Projects(): Promise<Collection<Project>> {
  return (await getDb()).collection<Project>("projects");
}
export async function Config(): Promise<Collection<ConfigKV>> {
  return (await getDb()).collection<ConfigKV>("config");
}

/**
 * Close (optional for scripts; in Next.js you usually let the process keep it)
 */
export async function closeDatabase() {
  if (_client) {
    await _client.close();
    _client = undefined;
    _db = undefined;
  }
}

// Default export so `import db from '@/lib/db'` keeps working
// (returns the connected Db instance)
export default await getDb();
