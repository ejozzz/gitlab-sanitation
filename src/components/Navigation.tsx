// src/components/Navigation.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import ThemeSwitcher from '@/components/ThemeSwitcher';
import ProjectSelector from '@/components/ProjectSelector';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import clsx from 'clsx';

type NavVariant = 'auth' | 'app';

export default function Navigation({
  variant = 'app',
}: {
  variant?: NavVariant;
}) {
  /* -------------------- AUTH NAV -------------------- */
  if (variant === 'auth') {
    return (
      <header className="sticky top-0 z-40">
        <div className="navbar bg-base-200/80 backdrop-blur border-b border-base-300/70">
          <div className="navbar-start">
            <Link href="/" className="btn btn-ghost px-2 text-lg md:text-xl">
              <span className="font-semibold">GitLab Sanitation</span>
            </Link>
          </div>
          <div className="navbar-end gap-2 pr-2">
            <ThemeSwitcher />
          </div>
        </div>
      </header>
    );
  }

  /* -------------------- APP NAV -------------------- */
  const pathname = usePathname();

  const { data: user, isLoading } = useQuery({
    queryKey: ['auth/me'],
    queryFn: async () => {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      return res.ok ? res.json() : null;
    },
    staleTime: 30_000,
  });

  const crumbs = useMemo(() => {
    const parts = (pathname || '/').split('/').filter(Boolean);
    const acc: { href: string; label: string }[] = [];
    let href = '';
    for (const p of parts) {
      href += `/${p}`;
      acc.push({ href, label: prettify(p) });
    }
    return acc.length ? acc : [{ href: '/', label: 'Home' }];
  }, [pathname]);

  return (
    <header className="sticky top-0 z-40">
      {/* <div className="absolute inset-0 h-[72px] pointer-events-none bg-gradient-to-br from-primary/15 via-primary/10 to-transparent" />
      <div className="navbar bg-base-100/80 backdrop-blur border-b border-base-300/70 shadow-sm relative"> */}

      <div className="absolute inset-0 pointer-events-none bg-gradient-to-br from-primary/15 via-primary/10 to-transparent" />
      <div className="navbar bg-base-100/80 backdrop-blur border-b border-base-300/70 shadow-sm relative">
        {/* Left: drawer trigger + brand */}
        <div className="navbar-start gap-1">
          {/* ✅ Only htmlFor to toggle the drawer; no manual state forcing */}
          <label
            htmlFor="sidebar-drawer"
            className="btn btn-square btn-ghost"
            aria-label="Open sidebar"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              className="w-5 h-5"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </label>

          <Link href="/" className="btn btn-ghost px-2 text-lg md:text-xl">
            <span className="font-semibold">GitLab Sanitation</span>
          </Link>
        </div>



        {/* Right: actions */}
        <div className="navbar-end gap-2 pr-2">
          <ProjectSelector />
          <Link href="/settings?firstTime=true" className="btn btn-primary btn-sm h-10 hidden sm:inline-flex">
            + New Project
          </Link>
          <ThemeSwitcher />
          {isLoading ? (
            <div className="avatar placeholder">
              <div className="bg-base-300/70 text-base-100 w-9 rounded-full animate-pulse" />
            </div>
          ) : user ? (
            <div className="dropdown dropdown-end">
              <label tabIndex={0} className="btn btn-ghost btn-circle avatar">
                <div className="w-9 rounded-full ring-1 ring-base-300/70">
                  <span className="grid place-items-center h-full text-xs font-semibold">
                    {getInitials(user?.username || user?.name || 'U')}
                  </span>
                </div>
              </label>
              <ul
                tabIndex={0}
                className="mt-3 p-2 shadow menu menu-sm dropdown-content bg-base-100 rounded-box w-56 border border-base-300/70"
              >
                <li className="menu-title px-2 py-1">
                  <div className="flex flex-col">
                    <span className="font-medium">{user?.username || 'Account'}</span>
                    <span className="text-xs text-base-content/60">{user?.name}</span>
                  </div>
                </li>
                <li><Link href="/projects">Projects</Link></li>
                <li><Link href="/settings">Settings</Link></li>
                <li>
                  <form action="/api/auth/logout" method="post">
                    <button type="submit">Sign out</button>
                  </form>
                </li>
              </ul>
            </div>
          ) : (
            <Link href="/login" className="btn btn-outline btn-sm h-10">
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

/* -------------------- helpers -------------------- */
function prettify(segment: string) {
  return segment.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || 'U';
}
