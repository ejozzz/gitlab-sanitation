// src/lib/config.server.ts
import "server-only";

import crypto from "crypto";
import { readFile } from "fs/promises";
import { join } from "path";
import { configSchema, type Config, type ProjectConfig } from "./config.shared";

const algorithm = "aes-256-gcm";

const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), "data");
const CONFIG_FILE = join(DATA_DIR, "config.json");
const ENCRYPTION_KEY = process.env.CONFIG_ENCRYPTION_KEY;

// NOTE: aes-256-gcm requires a 32-BYTE key, not just 32 characters.
// If you’re providing ASCII key text, it must be 32 chars (32 bytes in utf8).
// Prefer a true 32-byte base64 key and decode it.
function getKey(): Buffer | null {
  if (!ENCRYPTION_KEY) return null;

  // If you store base64 in env, uncomment this:
  // return Buffer.from(ENCRYPTION_KEY, "base64");

  const buf = Buffer.from(ENCRYPTION_KEY, "utf8");
  if (buf.length !== 32) {
    console.warn("CONFIG_ENCRYPTION_KEY must be 32 bytes for aes-256-gcm");
    return null;
  }
  return buf;
}

export function encryptToken(token: string, keyText: string): {
  ciphertext: string;
  nonce: string;
  tag: string;
} {
  const key = Buffer.from(keyText, "utf8"); // or base64 decode if you use base64
  if (key.length !== 32) throw new Error("CONFIG_ENCRYPTION_KEY must be 32 bytes");

  const iv = crypto.randomBytes(12); // 12 bytes is the recommended IV size for GCM
  const cipher = crypto.createCipheriv(algorithm, key, iv);

  let ciphertext = cipher.update(token, "utf8", "hex");
  ciphertext += cipher.final("hex");

  const tag = cipher.getAuthTag();
  return {
    ciphertext,
    nonce: iv.toString("hex"),
    tag: tag.toString("hex"),
  };
}

export function decryptToken(
  ciphertext: string,
  nonce: string,
  tag: string,
  keyText: string
): string {
  const key = Buffer.from(keyText, "utf8"); // or base64 decode if you use base64
  if (key.length !== 32) throw new Error("CONFIG_ENCRYPTION_KEY must be 32 bytes");

  const decipher = crypto.createDecipheriv(
    algorithm,
    key,
    Buffer.from(nonce, "hex")
  );
  decipher.setAuthTag(Buffer.from(tag, "hex"));

  let decrypted = decipher.update(ciphertext, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

export async function readConfig(): Promise<Config | null> {
  try {
    const key = getKey();
    if (!key) throw new Error("CONFIG_ENCRYPTION_KEY not set or invalid");

    const data = await readFile(CONFIG_FILE, "utf-8");
    const parsed = configSchema.parse(JSON.parse(data));
    return parsed;
  } catch {
    return null;
  }
}

export async function getActiveProjectConfig(): Promise<(ProjectConfig & { token: string }) | null> {
  const config = await readConfig();
  const key = getKey();
  if (!config || !config.activeProjectId || !key) return null;

  const activeProject = config.projects.find((p) => p.id === config.activeProjectId);
  if (!activeProject) return null;

  const token = decryptToken(
    activeProject.tokenCiphertext,
    activeProject.tokenNonce,
    activeProject.tokenTag,
    key.toString("utf8")
  );

  return { ...activeProject, token };
}
