//app/components/DiffViewer.tsx
'use client';

import { useState } from 'react';

interface DiffFile {
  old_path: string;
  new_path: string;
  new_file: boolean;
  renamed_file: boolean;
  deleted_file: boolean;
  diff: string;
}

interface DiffViewerProps {
  files: DiffFile[];
  loading: boolean;
}

export default function DiffViewer({ files, loading }: DiffViewerProps) {
  const [selectedFile, setSelectedFile] = useState<number>(0);

  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="skeleton h-16 w-full"></div>
        ))}
      </div>
    );
  }

  if (!files?.length) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">No changes found</p>
      </div>
    );
  }

  const currentFile = files[selectedFile];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
      <div className="lg:col-span-1">
        <div className="card bg-base-100 shadow">
          <div className="card-body p-4">
            <h3 className="card-title text-sm">Changed Files ({files.length})</h3>
            <div className="space-y-1 mt-2">
              {files.map((file, index) => (
                <button
                  key={index}
                  className={`btn btn-sm btn-block justify-start ${selectedFile === index ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setSelectedFile(index)}
                >
                  <span className="text-xs truncate">
                    {file.new_file && '+ '}
                    {file.deleted_file && '- '}
                    {file.renamed_file && '→ '}
                    {file.new_path}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      
      <div className="lg:col-span-3">
        <div className="card bg-base-100 shadow">
          <div className="card-body p-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="card-title text-sm">{currentFile.new_path}</h3>
              <div className="flex gap-2">
                {currentFile.new_file && <span className="badge badge-success badge-sm">New</span>}
                {currentFile.deleted_file && <span className="badge badge-error badge-sm">Deleted</span>}
                {currentFile.renamed_file && <span className="badge badge-info badge-sm">Renamed</span>}
              </div>
            </div>
            
            <pre className="overflow-x-auto text-sm bg-base-200 p-4 rounded-lg">
              <code className="text-xs">{currentFile.diff}</code>
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}