'use client';

import { useState } from 'react';

type Props = {
  currentPage: number;
  totalPages: number;
  onPageChange: (p: number) => void;
};

export function Pagination({ currentPage, totalPages, onPageChange }: Props) {
  const [input, setInput] = useState(String(currentPage));

  const go = () => {
    const n = Number(input);
    if (!Number.isNaN(n) && n >= 1 && n <= totalPages) onPageChange(n);
  };

  return (
    <div className="join">
      <button
        className="join-item btn btn-sm"
        disabled={currentPage === 1}
        onClick={() => onPageChange(currentPage - 1)}
      >
        «
      </button>

      <span className="join-item btn btn-sm btn-disabled">
        Page {currentPage} of {totalPages}
      </span>

      <button
        className="join-item btn btn-sm"
        disabled={currentPage === totalPages}
        onClick={() => onPageChange(currentPage + 1)}
      >
        »
      </button>

      <div className="join-item flex items-center gap-2 ml-4">
        <input
          type="number"
          className="input input-bordered input-xs w-20"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && go()}
          min={1}
          max={totalPages}
        />
        <button className="btn btn-xs btn-outline" onClick={go}>
          Go
        </button>
      </div>
    </div>
  );
}