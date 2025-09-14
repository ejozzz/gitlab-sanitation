import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { db } from './db';

const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days

// User registration
export async function registerUser(username: string, password: string) {
  try {
    // Check if user already exists
    const existingUser = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existingUser) {
      throw new Error('Username already exists');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Insert user
    const result = db.prepare(`
      INSERT INTO users (username, password_hash) 
      VALUES (?, ?)
    `).run(username, passwordHash);

    return { userId: result.lastInsertRowid, username };
  } catch (error) {
    throw new Error(`Registration failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// User login
export async function loginUser(username: string, password: string) {
  try {
    // Get user
    const user = db.prepare('SELECT id, password_hash FROM users WHERE username = ?').get(username) as {
      id: number;
      password_hash: string;
    } | undefined;

    if (!user) {
      throw new Error('Invalid username or password');
    }

    // Verify password
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      throw new Error('Invalid username or password');
    }

    // Create session
    const sessionId = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + SESSION_DURATION);

    db.prepare(`
      INSERT INTO user_sessions (id, user_id, expires_at) 
      VALUES (?, ?, ?)
    `).run(sessionId, user.id, expiresAt.toISOString());

    return { sessionId, userId: user.id, username };
  } catch (error) {
    throw new Error(`Login failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Validate session
export async function validateSession(sessionId: string) {
  try {
    const session = db.prepare(`
      SELECT s.user_id, s.expires_at, u.username 
      FROM user_sessions s 
      JOIN users u ON s.user_id = u.id 
      WHERE s.id = ? AND s.expires_at > ?
    `).get(sessionId, new Date().toISOString()) as {
      user_id: number;
      username: string;
      expires_at: string;
    } | undefined;

    if (!session) {
      return null;
    }

    return {
      userId: session.user_id,
      username: session.username,
      expiresAt: new Date(session.expires_at),
    };
  } catch (error) {
    console.error('Session validation error:', error);
    return null;
  }
}

// Delete session (logout)
export async function deleteSession(sessionId: string) {
  try {
    db.prepare('DELETE FROM user_sessions WHERE id = ?').run(sessionId);
    return true;
  } catch (error) {
    console.error('Session deletion error:', error);
    return false;
  }
}

// Get user by ID
export async function getUserById(userId: number) {
  try {
    const user = db.prepare(`
      SELECT id, username, created_at 
      FROM users 
      WHERE id = ?
    `).get(userId) as {
      id: number;
      username: string;
      created_at: string;
    } | undefined;

    return user;
  } catch (error) {
    console.error('Get user error:', error);
    return null;
  }
}

// Get user's active project
export async function getUserActiveProject(userId: number) {
  try {
    const project = db.prepare(`
      SELECT id, name, gitlab_host, project_id, is_active, created_at, updated_at
      FROM user_projects 
      WHERE user_id = ? AND is_active = true 
      LIMIT 1
    `).get(userId) as {
      id: number;
      name: string;
      gitlab_host: string;
      project_id: string;
      is_active: boolean;
      created_at: string;
      updated_at: string;
    } | undefined;

    return project;
  } catch (error) {
    console.error('Get active project error:', error);
    return null;
  }
}

// Get all user projects
export async function getUserProjects(userId: number) {
  try {
    const projects = db.prepare(`
      SELECT id, name, gitlab_host, project_id, is_active, created_at, updated_at
      FROM user_projects 
      WHERE user_id = ? 
      ORDER BY created_at DESC
    `).all(userId) as Array<{
      id: number;
      name: string;
      gitlab_host: string;
      project_id: string;
      is_active: boolean;
      created_at: string;
      updated_at: string;
    }>;

    return projects;
  } catch (error) {
    console.error('Get user projects error:', error);
    return [];
  }
}

// Set user active project
export async function setUserActiveProject(userId: number, projectId: number) {
  try {
    // First, deactivate all projects for this user
    db.prepare('UPDATE user_projects SET is_active = false WHERE user_id = ?').run(userId);

    // Then activate the selected project
    const result = db.prepare(`
      UPDATE user_projects 
      SET is_active = true, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ? AND user_id = ?
    `).run(projectId, userId);

    if (result.changes === 0) {
      throw new Error('Project not found or does not belong to user');
    }

    return true;
  } catch (error) {
    console.error('Set active project error:', error);
    return false;
  }
}

// Add user project
export async function addUserProject(
  userId: number,
  name: string,
  gitlabHost: string,
  projectId: string,
  token: string
) {
  try {
    // Encrypt token
    const { encryptToken } = await import('@/lib/config');
    const ENCRYPTION_KEY = process.env.CONFIG_ENCRYPTION_KEY;
    
    if (!ENCRYPTION_KEY) {
      throw new Error('Encryption key not configured');
    }

    const encrypted = encryptToken(token, ENCRYPTION_KEY);

    // Insert project
    const result = db.prepare(`
      INSERT INTO user_projects (
        user_id, name, gitlab_host, project_id, 
        token_ciphertext, token_nonce, token_tag, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      name,
      gitlabHost,
      projectId,
      encrypted.ciphertext,
      encrypted.nonce,
      encrypted.tag,
      false // Not active by default
    );

    return { projectId: result.lastInsertRowid };
  } catch (error) {
    console.error('Add user project error:', error);
    throw new Error(`Failed to add project: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Get user project by ID
export async function getUserProject(userId: number, projectId: number) {
  try {
    const project = db.prepare(`
      SELECT id, name, gitlab_host, project_id, is_active, created_at, updated_at
      FROM user_projects 
      WHERE id = ? AND user_id = ?
    `).get(projectId, userId) as {
      id: number;
      name: string;
      gitlab_host: string;
      project_id: string;
      is_active: boolean;
      created_at: string;
      updated_at: string;
    } | undefined;

    return project;
  } catch (error) {
    console.error('Get user project error:', error);
    return null;
  }
}

// Get user project with decrypted token
export async function getUserProjectWithToken(userId: number, projectId: number) {
  try {
    const project = db.prepare(`
      SELECT id, name, gitlab_host, project_id, token_ciphertext, token_nonce, token_tag, is_active
      FROM user_projects 
      WHERE id = ? AND user_id = ?
    `).get(projectId, userId) as {
      id: number;
      name: string;
      gitlab_host: string;
      project_id: string;
      token_ciphertext: string;
      token_nonce: string;
      token_tag: string;
      is_active: boolean;
    } | undefined;

    if (!project) return null;

    // Decrypt token
    const { decryptToken } = await import('@/lib/config');
    const ENCRYPTION_KEY = process.env.CONFIG_ENCRYPTION_KEY;
    
    if (!ENCRYPTION_KEY) {
      throw new Error('Encryption key not configured');
    }

    const token = decryptToken(
      project.token_ciphertext,
      project.token_nonce,
      project.token_tag,
      ENCRYPTION_KEY
    );

    return {
      id: project.id,
      name: project.name,
      gitlabHost: project.gitlab_host,
      projectId: project.project_id,
      token: token,
      isActive: project.is_active,
    };
  } catch (error) {
    console.error('Get user project with token error:', error);
    return null;
  }
}