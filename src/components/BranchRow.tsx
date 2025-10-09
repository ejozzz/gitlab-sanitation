// components/BranchRow.tsx
import { GitLabBranch } from '@/lib/gitlab-types';

type Props = { branch: GitLabBranch };

export function BranchRow({ branch }: Props) {
  return (
    <tr>
      <td className="font-mono text-sm">{branch.name}</td>
      <td className="text-sm">
        {branch.commit?.committed_date
          ? new Date(branch.commit.committed_date).toLocaleDateString()
          : '—'}
      </td>
      <td className="text-sm">
        {branch.commit?.author_name ?? '—'}
      </td>
      <td>{branch.protected ? '✅' : '❌'}</td>
      <td>
        {/* placeholder buttons – wire up later */}
        <div className="flex gap-2">
          <button className="btn btn-xs btn-ghost">View</button>
          <button className="btn btn-xs btn-ghost">Delete</button>
        </div>
      </td>
    </tr>
  );
}