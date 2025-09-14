// components/Navigation.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import ThemeSwitcher from '@/components/ThemeSwitcher';
import ProjectSelector from '@/components/ProjectSelector';
import { useQuery } from '@tanstack/react-query';

export default function Navigation() {
  const pathname = usePathname();
  const isAuthPage = pathname === '/login' || pathname === '/register';

  const { data: user } = useQuery({
    queryKey: ['current-user'],
    queryFn: async () => {
      const res = await fetch('/api/auth/me');
      return res.ok ? res.json() : null;
    },
    retry: false,
  });

  /* ---------- 1.  Always show the bar ---------- */
  const brand = (
    <Link href="/" className="btn btn-ghost normal-case text-xl">
      GitLab Sanitation
    </Link>
  );

  /* ---------- 2.  Main nav items (hidden on auth pages) ---------- */
  const navItems = [
    { href: '/branches', label: 'Branches' },
    { href: '/cherry-picks', label: 'Cherry-picks' },
    { href: '/merge-requests', label: 'Merge Requests' },
    { href: '/settings', label: 'Settings' },
  ];

  const mainNav = isAuthPage ? null : (
    <>
      {/* mobile hamburger */}
      <div className="navbar-start">
        <div className="dropdown">
          <label tabIndex={0} className="btn btn-ghost lg:hidden">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h8m-8 6h16"
              />
            </svg>
          </label>
          <ul
            tabIndex={0}
            className="menu menu-sm dropdown-content mt-3 z-[1] p-2 shadow bg-base-100 rounded-box w-52"
          >
            {navItems.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={pathname === item.href ? 'active' : ''}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* brand visible on left for mobile */}
        {brand}
      </div>

      {/* desktop centre nav */}
      <div className="navbar-center hidden lg:flex">
        <ul className="menu menu-horizontal px-1">
          {navItems.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className={pathname === item.href ? 'active' : ''}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </>
  );

  /* ---------- 3.  Right side (always visible items) ---------- */
  const rightSide = (
    <div className="navbar-end gap-2">
      <ThemeSwitcher />
      <ProjectSelector />

      {!user && isAuthPage && (
        <>
          <Link href="/login" className="btn btn-ghost btn-sm">
            Sign In
          </Link>
          <Link href="/register" className="btn btn-primary btn-sm">
            Register
          </Link>
        </>
      )}
    </div>
  );

  /* ---------- 4.  Render the bar ---------- */
  return (
    <div className="navbar bg-base-100 shadow-lg">
      {mainNav || (
        // auth page: only brand on the left
        <div className="navbar-start">{brand}</div>
      )}
      {rightSide}
    </div>
  );
}