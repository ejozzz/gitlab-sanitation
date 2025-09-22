//app/page.tsx
'use client';

import Link from 'next/link';
import { useProjectStore } from '@/lib/project-store';

export default function HomePage() {
  const { activeProjectId } = useProjectStore();

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="text-center py-16">
        <h1 className="text-5xl font-bold mb-6">GitLab Sanitation Dashboard</h1>
        <p className="text-xl text-gray-600 mb-8">
          Analyze and sanitize your GitLab repositories with powerful DevOps tools
        </p>
        
        {activeProjectId ? (
          <div className="mb-8">
            <div className="badge badge-primary badge-lg mb-4">Project Active</div>
            <p className="text-base-content/70">Ready to analyze your repository</p>
          </div>
        ) : (
          <div className="mb-8">
            <div className="badge badge-warning badge-lg mb-4">No Project Selected</div>
            <p className="text-base-content/70">Please configure a project to get started</p>
          </div>
        )}
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-12">
          <Link href="/branches" className={`card bg-base-100 shadow-xl hover:shadow-2xl transition-shadow ${!activeProjectId ? 'opacity-50' : ''}`}>
            <div className="card-body">
              <h2 className="card-title">Branches</h2>
              <p>View and analyze repository branches with activity filtering</p>
            </div>
          </Link>
          
          <Link href="/cherry-picks" className={`card bg-base-100 shadow-xl hover:shadow-2xl transition-shadow ${!activeProjectId ? 'opacity-50' : ''}`}>
            <div className="card-body">
              <h2 className="card-title">Cherry-picks</h2>
              <p>Detect cherry-picked commits and merge requests</p>
            </div>
          </Link>
          
          <Link href="/merge-requests" className={`card bg-base-100 shadow-xl hover:shadow-2xl transition-shadow ${!activeProjectId ? 'opacity-50' : ''}`}>
            <div className="card-body">
              <h2 className="card-title">Merge Requests</h2>
              <p>Analyze MRs with approval and change details</p>
            </div>
          </Link>
          
          <Link href="/settings" className="card bg-base-100 shadow-xl hover:shadow-2xl transition-shadow">
            <div className="card-body">
              <h2 className="card-title">Settings</h2>
              <p>Configure GitLab connections and preferences</p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}