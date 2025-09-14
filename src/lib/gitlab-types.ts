export interface GitLabUser {
  id: number;
  username: string;
  name: string;
  state: string;
  avatar_url: string | null;
  web_url: string;
}

export interface GitLabCommit {
  id: string;
  short_id: string;
  title: string;
  message: string;
  author_name: string;
  author_email: string;
  authored_date: string;
  committed_date: string;
  web_url: string;
}

export interface GitLabBranch {
  name: string;
  merged: boolean;
  protected: boolean;
  default: boolean;
  can_push: boolean;
  web_url: string;
  commit: GitLabCommit;
}

export interface GitLabMergeRequest {
  id: number;
  iid: number;
  project_id: number;
  title: string;
  description: string | null;
  state: 'opened' | 'closed' | 'merged' | 'locked';
  created_at: string;
  updated_at: string;
  merged_at: string | null;
  merged_by: GitLabUser | null;
  source_branch: string;
  target_branch: string;
  labels: string[];
  draft: boolean;
  web_url: string;
  assignees?: GitLabUser[];
  author?: GitLabUser;
  user_notes_count?: number;
  discussion_locked?: boolean;
  changes_count?: string;
  has_conflicts?: boolean;
  blocking_discussions_resolved?: boolean;
}

export interface GitLabApproval {
  id: number;
  iid: number;
  project_id: number;
  title: string;
  description: string;
  state: string;
  created_at: string;
  updated_at: string;
  merge_status: string;
  approvals_required: number;
  approvals_left: number;
  approved_by: Array<{
    user: GitLabUser;
  }>;
}

export interface GitLabDiff {
  old_path: string;
  new_path: string;
  a_mode: string;
  b_mode: string;
  new_file: boolean;
  renamed_file: boolean;
  deleted_file: boolean;
  diff: string;
}

export interface CherryPick {
  type: 'commit' | 'merge_request';
  id: string;
  title: string;
  sourceBranch: string;
  targetBranch: string;
  detectedBy: 'message' | 'label';
  confidence: 'high' | 'medium';
  createdAt: string;
  webUrl: string;
}