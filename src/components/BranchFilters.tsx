// app/components/BranchFilters.tsx
'use client';

interface BranchFiltersProps {
  searchTerm: string;
  onSearchChange: (v: string) => void;
}

export default function BranchFilters({
  searchTerm,
  onSearchChange,
}: BranchFiltersProps) {
  return (
    <div className="flex flex-wrap gap-4 items-center">
      <input
        type="text"
        placeholder="Search branches..."
        className="input input-bordered"
        value={searchTerm}
        onChange={(e) => onSearchChange(e.target.value)}
      />
    </div>
  );
}
