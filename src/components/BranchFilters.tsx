'use client';

interface BranchFiltersProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  filter: 'all' | 'active' | 'inactive';
  onFilterChange: (value: 'all' | 'active' | 'inactive') => void;
  daysThreshold: number;
  onDaysThresholdChange: (value: number) => void;
}

export default function BranchFilters({
  searchTerm,
  onSearchChange,
  filter,
  onFilterChange,
  daysThreshold,
  onDaysThresholdChange,
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
      
      <select
        className="select select-bordered"
        value={filter}
        onChange={(e) => onFilterChange(e.target.value as any)}
      >
        <option value="all">All branches</option>
        <option value="active">Active only</option>
        <option value="inactive">Inactive only</option>
      </select>
      
      <div className="flex items-center gap-2">
        <label className="text-sm">Active threshold:</label>
        <input
          type="range"
          min="7"
          max="90"
          value={daysThreshold}
          onChange={(e) => onDaysThresholdChange(parseInt(e.target.value))}
          className="range range-xs"
        />
        <span className="text-sm">{daysThreshold} days</span>
      </div>
    </div>
  );
}