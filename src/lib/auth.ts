// src/lib/auth.ts
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { ObjectId } from "mongodb";
import { Users, UserSessions, Project, Projects } from "./db";

const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days

/* ----------  USER REGISTRATION ---------- */
export async function registerUser(username: string, password: string) {
  const users = await Users();

  const existingUser = await users.findOne({ username });
  if (existingUser) throw new Error("Username already exists");

  const passwordHash = await bcrypt.hash(password, 12);

  const result = await users.insertOne({
    username,
    password_hash: passwordHash,
    created_at: new Date(),
    updated_at: new Date(),
  });

  return { userId: result.insertedId.toString(), username };
}

/* ----------  USER LOGIN ---------- */
export async function loginUser(username: string, password: string) {
  const users = await Users();
  const sessions = await UserSessions();

  const user = await users.findOne({ username });
  if (!user) throw new Error("Invalid username or password");

  const isValid = await bcrypt.compare(password, user.password_hash);
  if (!isValid) throw new Error("Invalid username or password");

  const sessionId = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DURATION);

  await sessions.insertOne({
    _id: sessionId,
    userid: user._id, // store as ObjectId
    created_at: new Date(),
    expires_at: expiresAt,
  });

  return { sessionId, userId: user._id.toString(), username: user.username };
}

/* ----------  VALIDATE SESSION ---------- */
export async function validateSession(sessionId: string) {
  const sessions = await UserSessions();
  const users = await Users();

  const session = await sessions.findOne({
    _id: sessionId,
    expires_at: { $gt: new Date() },
  });

  if (!session) return null;

  const user = await users.findOne({ _id: session.userid as ObjectId });
  if (!user) return null;

  return {
    userId: user._id.toString(),
    username: user.username,
    expiresAt: session.expires_at,
  };
}

/* ----------  DELETE SESSION (LOGOUT) ---------- */
export async function deleteSession(sessionId: string) {
  const sessions = await UserSessions();
  await sessions.deleteOne({ _id: sessionId });
  return true;
}

/* ----------  GET USER BY ID ---------- */
export async function getUserById(userId: string) {
  const users = await Users();

  const user = await users.findOne(
    { _id: new ObjectId(userId) },
    { projection: { username: 1, created_at: 1 } }
  );

  return user
    ? { id: user._id.toString(), username: user.username, created_at: user.created_at }
    : null;
}

/* ----------  GET USER ACTIVE PROJECT ---------- */
export async function getUserActiveProject(userId: string) {
  const projects = await Projects();
  return await projects.findOne({
    userid: new ObjectId(userId),
    is_active: true,
  });
}

/* ----------  GET ALL USER PROJECTS ---------- */
export async function getUserProjects(userId: string) {
  const projects = await Projects();
  return await projects
    .find({ userid: new ObjectId(userId) })
    .sort({ created_at: -1 })
    .toArray();
}

/* ----------  SET USER ACTIVE PROJECT ---------- */
export async function setUserActiveProject(userId: string, projectId: string) {
  const projects = await Projects();

  // Deactivate all
  await projects.updateMany(
    { userid: new ObjectId(userId) },
    { $set: { is_active: false } }
  );

  // Activate selected
  const result = await projects.updateOne(
    { _id: new ObjectId(projectId), userid: new ObjectId(userId) },
    { $set: { is_active: true, updated_at: new Date() } }
  );

  if (result.modifiedCount === 0) {
    throw new Error("Project not found or does not belong to user");
  }
  return true;
}

/* ----------  ADD USER PROJECT ---------- */
export async function addUserProject(
  userId: string,
  name: string,
  gitlabHost: string,
  projectId: string,
  token: string
) {
  const projects = await Projects();

  const { encryptToken } = await import("@/lib/config.server");
  const ENCRYPTION_KEY = process.env.CONFIG_ENCRYPTION_KEY;
  if (!ENCRYPTION_KEY) throw new Error("Encryption key not configured");

  const encrypted = encryptToken(token);

  const result = await projects.insertOne({
    userid: new ObjectId(userId),
    name,
    gitlab_url: gitlabHost,
    projectId: projectId,
    token: {
      ciphertext: encrypted.ciphertext,
      nonce: encrypted.nonce,
      tag: encrypted.tag,
    },
    isActive: false,
    created_at: new Date(),
    updated_at: new Date(),
  });

  return { projectId: result.insertedId.toString() };
}

/* ----------  GET USER PROJECT ---------- */
export async function getUserProject(userId: string, projectId: string) {
  const projects = await Projects();
  return await projects.findOne({
    _id: new ObjectId(projectId),
    userid: new ObjectId(userId),
  });
}

/* ----------  GET USER PROJECT WITH TOKEN ---------- */
export async function getUserProjectWithToken(userId: string, projectId: string) {
  const projects = await Projects();

  const project = await projects.findOne({
    _id: new ObjectId(projectId),
    userid: new ObjectId(userId),
  });
  if (!project) return null;

  const { decryptToken } = await import("@/lib/config.server");

  const token = decryptToken(
    project.token.ciphertext,
    project.token.nonce,
    project.token.tag
  );

  return {
    ...project,
    id: project._id.toString(),
    token,
  };
}
