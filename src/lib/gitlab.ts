import { z } from 'zod';
import type {
  GitLabUser,
  GitLabCommit,
  GitLabBranch,
  GitLabMergeRequest,
  GitLabApproval,
  GitLabDiff
} from './gitlab-types';

// Schema definitions for validation (optional - you can remove if not needed for validation)
const gitlabUserSchema = z.object({
  id: z.number(),
  username: z.string(),
  name: z.string(),
  state: z.string(),
  avatar_url: z.string().nullable(),
  web_url: z.string(),
});

const gitlabCommitSchema = z.object({
  id: z.string(),
  short_id: z.string(),
  title: z.string(),
  message: z.string(),
  author_name: z.string(),
  author_email: z.string(),
  authored_date: z.string(),
  committed_date: z.string(),
  web_url: z.string(),
});

const gitlabBranchSchema = z.object({
  name: z.string(),
  merged: z.boolean(),
  protected: z.boolean(),
  default: z.boolean(),
  can_push: z.boolean(),
  web_url: z.string(),
  commit: gitlabCommitSchema,
});

const gitlabMergeRequestSchema = z.object({
  id: z.number(),
  iid: z.number(),
  project_id: z.number(),
  title: z.string(),
  description: z.string().nullable(),
  state: z.enum(['opened', 'closed', 'merged', 'locked']),
  created_at: z.string(),
  updated_at: z.string(),
  merged_at: z.string().nullable(),
  merged_by: gitlabUserSchema.nullable(),
  source_branch: z.string(),
  target_branch: z.string(),
  labels: z.array(z.string()),
  draft: z.boolean(),
  web_url: z.string(),
  assignees: z.array(gitlabUserSchema).optional(),
  author: gitlabUserSchema.optional(),
  user_notes_count: z.number().optional(),
  discussion_locked: z.boolean().optional(),
  changes_count: z.string().optional(),
  has_conflicts: z.boolean().optional(),
  blocking_discussions_resolved: z.boolean().optional(),
});

// Export types from schemas (if you want to keep both)
export type GitLabUserFromSchema = z.infer<typeof gitlabUserSchema>;
export type GitLabCommitFromSchema = z.infer<typeof gitlabCommitSchema>;
export type GitLabBranchFromSchema = z.infer<typeof gitlabBranchSchema>;
export type GitLabMergeRequestFromSchema = z.infer<typeof gitlabMergeRequestSchema>;

// API Client
export class GitLabAPIClient {
  private baseUrl: string;
  private token: string;
  private projectId: string | number;
  

  constructor(baseUrl: string, token: string, projectId: string | number) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.token = token;
    this.projectId = projectId;
  }

  // Add getter method
  public getProjectId(): string | number {
    return this.projectId;
  }

  public getGitLabHost(): string {
    return this.baseUrl;
  }

  public async fetchGitLab<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}/api/v4${endpoint}`;
    
    // Add agent options to ignore SSL errors (development only)
    const fetchOptions: RequestInit = {
      ...options,
      headers: {
        'PRIVATE-TOKEN': this.token,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...options.headers,
      },
    };

    // For Node.js environment, add SSL bypass
    if (typeof process !== 'undefined' && process.versions?.node) {
      // @ts-ignore - Node.js specific option
      fetchOptions.agent = new (await import('https')).Agent({
        rejectUnauthorized: false
      });
    }

    try {
      const response = await fetch(url, fetchOptions);

      // Check if response is JSON
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        console.error('Non-JSON response:', text.substring(0, 200));
        throw new Error(`Server returned HTML instead of JSON. This might be due to SSL issues. Response: ${text.substring(0, 100)}...`);
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(`GitLab API error: ${response.status} ${response.statusText} - ${errorData.error || ''}`);
      }

      return response.json();
    } catch (error) {
      if (error instanceof Error) {
        // Re-throw fetch/network errors with more context
        if (error.message.includes('fetch') || error.message.includes('certificate')) {
          throw new Error(`Network/SSL error: ${error.message}. This might be due to an expired or invalid SSL certificate.`);
        }
      }
      throw error;
    }
  }

  async validateToken(): Promise<{ user: GitLabUser; project: any }> {
    const user = await this.fetchGitLab<GitLabUser>('/user');
    const project = await this.fetchGitLab<any>(`/projects/${this.projectId}`);
    return { user, project };
  }

  async getBranches(search?: string): Promise<GitLabBranch[]> {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    
    return this.fetchGitLab<GitLabBranch[]>(
      `/projects/${this.projectId}/repository/branches?${params}`
    );
  }

  async getBranch(branchName: string): Promise<GitLabBranch | null> {
    try {
      return await this.fetchGitLab<GitLabBranch>(
        `/projects/${this.projectId}/repository/branches/${encodeURIComponent(branchName)}`
      );
    } catch (error) {
      if (error instanceof Error && error.message.includes('404')) {
        return null;
      }
      throw error;
    }
  }

  async getCommits(refName?: string, perPage: number = 100): Promise<GitLabCommit[]> {
    const params = new URLSearchParams();
    if (refName) params.append('ref_name', refName);
    params.append('per_page', perPage.toString());
    
    return this.fetchGitLab<GitLabCommit[]>(
      `/projects/${this.projectId}/repository/commits?${params}`
    );
  }

  async getMergeRequests(params: {
    state?: 'opened' | 'closed' | 'merged' | 'all';
    target_branch?: string;
    labels?: string;
    page?: number;
    per_page?: number;
  } = {}): Promise<GitLabMergeRequest[]> {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) searchParams.append(key, value.toString());
    });

    return this.fetchGitLab<GitLabMergeRequest[]>(
      `/projects/${this.projectId}/merge_requests?${searchParams}`
    );
  }

  async getMergeRequestApprovals(iid: number): Promise<GitLabApproval> {
    return this.fetchGitLab<GitLabApproval>(
      `/projects/${this.projectId}/merge_requests/${iid}/approvals`
    );
  }

  async getMergeRequestChanges(iid: number): Promise<{ changes: GitLabDiff[] }> {
    return this.fetchGitLab<{ changes: GitLabDiff[] }>(
      `/projects/${this.projectId}/merge_requests/${iid}/changes`
    );
  }

  async getCommitDiff(sha: string): Promise<GitLabDiff[]> {
    return this.fetchGitLab<GitLabDiff[]>(
      `/projects/${this.projectId}/repository/commits/${sha}/diff`
    );
  }
}