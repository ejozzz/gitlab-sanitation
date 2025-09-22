//app/components/TargetBranchPicker.tsx
'use client';

import { useQuery } from '@tanstack/react-query';

export default function TargetBranchPicker() {
  const { data: branches } = useQuery({
    queryKey: ['branches'],
    queryFn: async () => {
      const response = await fetch('/api/gitlab/branches');
      if (!response.ok) throw new Error('Failed to fetch branches');
      return response.json();
    },
  });

  return (
    <select className="select select-bordered select-sm">
      <option>main</option>
      <option>develop</option>
      {branches?.map((branch: any) => (
        <option key={branch.name} value={branch.name}>
          {branch.name}
        </option>
      ))}
    </select>
  );
}