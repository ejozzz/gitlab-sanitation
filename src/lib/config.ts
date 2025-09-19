import { z } from 'zod';
import crypto from 'crypto';
import { readFile } from 'fs/promises';
import { join } from 'path';

const algorithm = 'aes-256-gcm';

// Individual project configuration
export const projectConfigSchema = z.object({
  id: z.string(), // Unique project ID
  name: z.string(),
  gitlabHost: z.string().url(),
  projectId: z.union([z.string(), z.number()]),
  tokenCiphertext: z.string(),
  tokenNonce: z.string(),
  tokenTag: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// Main configuration with multiple projects
export const configSchema = z.object({
  activeProjectId: z.string().optional(),
  projects: z.array(projectConfigSchema),
  updatedAt: z.string().datetime(),
});

export type ProjectConfig = z.infer<typeof projectConfigSchema>;
export type Config = z.infer<typeof configSchema>;

export const settingsFormSchema = z.object({
  name: z.string().min(1, 'Project name is required'),
  gitlabHost: z.string().url(),
  projectId: z.union([z.string(), z.number()]),
  gitlabToken: z.string().min(1, 'Token is required'),
  isActive: z.boolean().default(false),
});

export type SettingsFormData = z.infer<typeof settingsFormSchema>;

const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), 'data');
const CONFIG_FILE = join(DATA_DIR, 'config.json');
const ENCRYPTION_KEY = process.env.CONFIG_ENCRYPTION_KEY;

if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 32) {
  console.warn('CONFIG_ENCRYPTION_KEY must be set and 32 characters long for production use');
}

export function encryptToken(token: string, key: string): {
  ciphertext: string;
  nonce: string;
  tag: string;
} {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  
  let ciphertext = cipher.update(token, 'utf8', 'hex');
  ciphertext += cipher.final('hex');
  
  const tag = cipher.getAuthTag();
  
  return {
    ciphertext,
    nonce: iv.toString('hex'),
    tag: tag.toString('hex'),
  };
}

export function decryptToken(
  ciphertext: string,
  nonce: string,
  tag: string,
  key: string
): string {
  const decipher = crypto.createDecipheriv(algorithm, key, Buffer.from(nonce, 'hex'));
  decipher.setAuthTag(Buffer.from(tag, 'hex'));
  
  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

export async function readConfig(): Promise<Config | null> {
  try {
    if (!ENCRYPTION_KEY) {
      throw new Error('CONFIG_ENCRYPTION_KEY not set');
    }

    const data = await readFile(CONFIG_FILE, 'utf-8');
    const parsed = configSchema.parse(JSON.parse(data));
    
    return parsed;
  } catch (error) {
    return null;
  }
}

export async function getActiveProjectConfig(): Promise<(ProjectConfig & { token: string }) | null> {
  const config = await readConfig();
  if (!config || !config.activeProjectId) return null;

  const activeProject = config.projects.find(p => p.id === config.activeProjectId);
  if (!activeProject || !ENCRYPTION_KEY) return null;

  const token = decryptToken(
    activeProject.tokenCiphertext,
    activeProject.tokenNonce,
    activeProject.tokenTag,
    ENCRYPTION_KEY
  );

  return {
    ...activeProject,
    token,
  };
}