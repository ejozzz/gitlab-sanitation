// src/lib/config.shared.ts
import { z } from "zod";

// Individual project configuration
export const projectConfigSchema = z.object({
  id: z.string(),
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
  name: z.string().min(1, "Project name is required"),
  gitlabHost: z.string().url(),
  projectId: z.union([z.string()]),
  gitlabToken: z.string().min(1, "Token is required"),
  isActive:z.boolean().default(false)
});

export type SettingsFormData = z.infer<typeof settingsFormSchema>;
export const SESSION_COOKIE = "session-id";
