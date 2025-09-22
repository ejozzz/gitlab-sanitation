//app/components/ApprovalsPanel.tsx
'use client';

import { useQuery } from '@tanstack/react-query';

interface GitLabUser {
  name: string;
  username: string;
  avatar_url: string | null;
}

interface Approval {
  user: GitLabUser;
}

interface ApprovalsData {
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
  approved_by: Approval[];
}

interface ApprovalsPanelProps {
  mrId: number;
}

export default function ApprovalsPanel({ mrId }: ApprovalsPanelProps) {
  const { data: approvals, isLoading } = useQuery<ApprovalsData>({
    queryKey: ['approvals', mrId],
    queryFn: async () => {
      const response = await fetch(`/api/gitlab/merge-requests/${mrId}/approvals`);
      if (!response.ok) throw new Error('Failed to fetch approvals');
      return response.json();
    },
  });

  if (isLoading) {
    return <div className="skeleton h-32 w-full"></div>;
  }

  if (!approvals) {
    return <div className="text-gray-500">No approval data available</div>;
  }

  return (
    <div className="card bg-base-100 shadow">
      <div className="card-body">
        <h3 className="card-title">Approvals</h3>
        
        <div className="flex justify-between items-center mb-4">
          <div>
            <span className="text-2xl font-bold">{approvals.approvals_required - approvals.approvals_left}</span>
            <span className="text-gray-500"> / {approvals.approvals_required} required</span>
          </div>
          <div className={`badge ${approvals.approvals_left === 0 ? 'badge-success' : 'badge-warning'} badge-lg`}>
            {approvals.approvals_left === 0 ? 'Approved' : `${approvals.approvals_left} remaining`}
          </div>
        </div>

        {approvals.approved_by.length > 0 && (
          <div>
            <h4 className="font-medium mb-2">Approved by:</h4>
            <div className="flex flex-wrap gap-2">
              {approvals.approved_by.map((approval: Approval, index: number) => (
                <div key={index} className="flex items-center gap-2">
                  <div className="avatar">
                    <div className="w-8 rounded-full">
                      <img 
                        src={approval.user.avatar_url || '/default-avatar.png'} 
                        alt={approval.user.name} 
                      />
                    </div>
                  </div>
                  <span className="text-sm">{approval.user.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}