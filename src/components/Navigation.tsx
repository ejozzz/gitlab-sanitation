// components/Navigation.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import ThemeSwitcher from '@/components/ThemeSwitcher';
import ProjectSelector from '@/components/ProjectSelector';
import { useQuery } from '@tanstack/react-query';

export default function Navigation({
  onMenuClick,
}: {
  onMenuClick?: () => void;
}) {
  const pathname = usePathname();
  const isAuthPage = pathname === '/login' || pathname === '/register';

  const { data: user, isLoading } = useQuery({
    queryKey: ['auth/me'],
    queryFn: async () => {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      return res.ok ? res.json() : null;
    },
  });

  if (isAuthPage) return null;

  /* ----------  Common left-side : burger + brand  ---------- */
  const LeftPart = () => (
    <div className="navbar-start">
      <label
        htmlFor="sidebar-drawer"
        className="btn btn-square btn-ghost"
        onClick={onMenuClick}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
          className="w-5 h-5"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4 6h16M4 12h16M4 18h16"
          />
        </svg>
      </label>

      <Link href="/" className="btn btn-ghost normal-case text-xl">
        GitLab Sanitation
      </Link>

      
    </div>
  );

  /* ----------  Loading skeleton  ---------- */
  if (isLoading) {
    return (
      <div className="navbar bg-base-100 shadow-lg">
        <LeftPart />
        <div className="navbar-end gap-2">
          <ProjectSelector />
          <span className="loading loading-spinner loading-xs" />
          <ThemeSwitcher />
        </div>
      </div>
    );
  }

  /* ----------  Not authenticated  ---------- */
  if (!user) {
    return (
      <div className="navbar bg-base-100 shadow-lg">
        <LeftPart />
        <div className="navbar-end gap-2">
          <ProjectSelector />
          <ThemeSwitcher />
        </div>
      </div>
    );
  }

  /* ----------  Authenticated – full bar  ---------- */
  return (
    <div className="navbar bg-base-100 shadow-lg">
      <LeftPart />
      <div className="navbar-end gap-2">
        <ProjectSelector />
        <ThemeSwitcher />
      </div>
    </div>
  );
}