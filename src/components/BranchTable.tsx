//app/components/BranchTable.tsx
'use client';

import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import BranchExistenceCheck from '@/components/BranchExistenceCheck';
import type { GitLabBranch } from '@/lib/gitlab-types';


interface BranchTableProps {
  branches: GitLabBranch[];
  isLoading: boolean;
  filter: 'all' | 'active' | 'inactive';
  daysThreshold: number;
}

export default function BranchTable({ branches, isLoading, filter, daysThreshold }: BranchTableProps) {
  const [selectedBranch, setSelectedBranch] = useState<string>('main');

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="skeleton h-16 w-full"></div>
        ))}
      </div>
    );
  }

  if (!branches?.length) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">No branches found</p>
      </div>
    );
  }

  const isActive = (branch: GitLabBranch) => {
    const daysSinceCommit = (Date.now() - new Date(branch.commit.authored_date).getTime()) / (1000 * 60 * 60 * 24);
    return daysSinceCommit <= daysThreshold;
  };

  const filteredBranches = branches.filter(branch => {
    if (filter === 'active') return isActive(branch);
    if (filter === 'inactive') return !isActive(branch);
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <BranchExistenceCheck />
      </div>
      
      <div className="overflow-x-auto">
        <table className="table table-zebra w-full">
          <thead>
            <tr>
              <th>Branch</th>
              <th>Last Commit</th>
              <th>Author</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredBranches.map((branch) => (
              <tr key={branch.name}>
                <td>
                  <div className="flex items-center gap-2">
                    {branch.protected && <span className="badge badge-warning badge-sm">protected</span>}
                    {branch.default && <span className="badge badge-primary badge-sm">default</span>}
                    <span className="font-mono">{branch.name}</span>
                  </div>
                </td>
                <td>
                  <div>
                    <div className="text-sm">{branch.commit.title}</div>
                    <div className="text-xs text-gray-500">
                      {formatDistanceToNow(new Date(branch.commit.authored_date), { addSuffix: true })}
                    </div>
                  </div>
                </td>
                <td>{branch.commit.author_name}</td>
                <td>
                  <span className={`badge ${isActive(branch) ? 'badge-success' : 'badge-error'} badge-sm`}>
                    {isActive(branch) ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td>
                  <button className="btn btn-ghost btn-xs">View Details</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}