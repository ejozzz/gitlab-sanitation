// src/components/DrawerWrapper.tsx
'use client';

import { ReactNode, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Navigation from '@/components/Navigation';
import {
  LayoutDashboard,
  GitBranch,
  GitCommit,
  GitPullRequest,
  Settings as SettingsIcon,
  ShieldCheck,
  Flag,
  ChevronDown,
} from 'lucide-react';

export default function DrawerWrapper({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  // DaisyUI's hidden checkbox for transitions
  const checkboxRef = useRef<HTMLInputElement>(null);

  // Reference the *panel* (ul.menu)
  const panelRef = useRef<HTMLUListElement>(null);

  const drawerId = 'sidebar-drawer';

  // Open on ≥lg; closed on <lg
  useEffect(() => {
    const mq = window.matchMedia('(min-width:1024px)'); // Tailwind 'lg'
    const sync = () => {
      const desktop = mq.matches;
      setIsDesktop(desktop);
      setOpen(desktop);
    };
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  // Keep the hidden checkbox in sync so DaisyUI animates
  useEffect(() => {
    if (checkboxRef.current) checkboxRef.current.checked = open;
  }, [open]);

  // ❌ REMOVE the outside-click effect & body overflow locking.
  // DaisyUI's overlay handles dismissal cleanly.

  const closeOnMobile = () => {
    if (!isDesktop) setOpen(false);
  };

  return (
    <div className={`drawer isolate min-h-screen ${open ? 'drawer-open' : ''}`}>
      <input
        ref={checkboxRef}
        id={drawerId}
        type="checkbox"
        className="drawer-toggle"
        checked={open}
        onChange={(e) => setOpen(e.target.checked)}
      />

      {/* PAGE CONTENT */}
      <div className="drawer-content flex min-h-screen flex-col">
        {/* 🔁 rely on label htmlFor in Navigation; no onMenuClick here */}
        <Navigation variant="app" />
        <BreadcrumbsBar />
        <main className="flex-1 p-4 lg:p-6">{children}</main>
      </div>

      {/* SIDEBAR */}
      <div className="drawer-side z-[1000]">
        {/* ✅ Keep overlay so clicking the backdrop toggles the checkbox */}
        <label htmlFor={drawerId} className="drawer-overlay" />
        <SidebarPanel panelRef={panelRef} onLinkClick={closeOnMobile} />
      </div>
    </div>
  );
}

/* ----------------------------- Sidebar Panel ----------------------------- */

function SidebarPanel({
  panelRef,
  onLinkClick,
}: {
  panelRef: React.RefObject<HTMLUListElement>;
  onLinkClick: () => void;
}) {
  const pathname = usePathname();

  return (
    <aside className="h-full">
      <ul
        ref={panelRef}
        className="
          menu no-caret w-72 lg:w-72 min-h-full
          bg-base-100 border-r border-base-300 shadow-sm
          p-3 gap-1
        "
      >
        {/* Brand / Title */}
        <li className="menu-title px-2 py-1">
          <span className="text-sm font-semibold opacity-70">GitLab Sanitation</span>
        </li>

        {/* (Optional) mini top card area for active project */}
        <li className="px-2 pb-2">
          <div className="rounded-2xl border border-base-300 bg-base-100 px-3 py-2">
            <div className="text-xs opacity-60">Active project</div>
            <div className="text-sm font-medium truncate">ProjectSelector ↑</div>
          </div>
        </li>

        {/* Primary nav */}
        <SidebarLink
          href="/"
          icon={<LayoutDashboard className="w-4 h-4" />}
          label="Dashboard"
          active={pathname === '/'}
          onClick={onLinkClick}
        />
        <SidebarLink
          href="/branches"
          icon={<GitBranch className="w-4 h-4" />}
          label="Branches"
          active={pathname?.startsWith('/branches')}
          onClick={onLinkClick}
        />
        <SidebarLink
          href="/cherry-picks"
          icon={<GitCommit className="w-4 h-4" />}
          label="Cherry-picks"
          active={pathname?.startsWith('/cherry-picks')}
          onClick={onLinkClick}
        />
        <SidebarLink
          href="/merge-requests"
          icon={<GitPullRequest className="w-4 h-4" />}
          label="Merge Requests"
          active={pathname?.startsWith('/merge-requests')}
          onClick={onLinkClick}
        />

        {/* Grouped section */}
        <li className="menu-title px-2 pt-3">
          <span className="text-sm font-semibold opacity-70">Quality & Compliance</span>
        </li>
        <SidebarCollapsible
          title="Reports"
          icon={<Flag className="w-4 h-4" />}
          defaultOpen={pathname?.startsWith('/reports')}
        >
          <SidebarSubLink
            href="/reports/activity"
            label="Activity"
            active={pathname === '/reports/activity'}
            onClick={onLinkClick}
          />
          <SidebarSubLink
            href="/reports/sanitation"
            label="Sanitation"
            active={pathname === '/reports/sanitation'}
            onClick={onLinkClick}
          />
          <SidebarSubLink
            href="/reports/coverage"
            label="Coverage"
            active={pathname === '/reports/coverage'}
            onClick={onLinkClick}
          />
        </SidebarCollapsible>

        {/* <SidebarCollapsible
          title="Policies"
          icon={<ShieldCheck className="w-4 h-4" />}
          defaultOpen={pathname?.startsWith('/policies')}
        >
          <SidebarSubLink
            href="/policies/branching"
            label="Branching Rules"
            active={pathname === '/policies/branching'}
            onClick={onLinkClick}
          />
          <SidebarSubLink
            href="/policies/reviews"
            label="Review & Approval"
            active={pathname === '/policies/reviews'}
            onClick={onLinkClick}
          />
        </SidebarCollapsible> */}

        {/* Settings */}
        <li className="menu-title px-2 pt-3">
          <span className="text-sm font-semibold opacity-70">System</span>
        </li>
        <SidebarLink
          href="/settings"
          icon={<SettingsIcon className="w-4 h-4" />}
          label="Settings"
          active={pathname === '/settings'}
          onClick={onLinkClick}
        />

        {/* Footer / version */}
        <li className="mt-auto pt-4 px-2">
          <div className="text-[11px] opacity-60">v0.1.0 • Next.js + DaisyUI v5</div>
        </li>
      </ul>
    </aside>
  );
}

/* ----------------------------- Building blocks ---------------------------- */

function SidebarLink({
  href,
  label,
  icon,
  active,
  onClick,
  badge,
}: {
  href: string;
  label: string;
  icon?: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
  badge?: string | number;
}) {
  return (
    <li>
      <Link
        href={href}
        onClick={onClick}
        aria-current={active ? 'page' : undefined}
        className={[
          'flex items-center gap-3 rounded-xl',
          'transition-colors',
          active ? 'active' : 'hover:bg-base-200',
        ].join(' ')}
      >
        {icon && <span className="shrink-0">{icon}</span>}
        <span className="truncate">{label}</span>
        {badge != null && (
          <span className="badge badge-sm badge-ghost ml-auto">{badge}</span>
        )}
      </Link>
    </li>
  );
}

function SidebarCollapsible({
  title,
  icon,
  children,
  defaultOpen,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <li>
      <details
        className="group [&_summary::-webkit-details-marker]:hidden [&_summary::marker]:hidden"
        {...(defaultOpen ? { open: true } : {})}
      >
        <summary
          className="no-summary-marker
    flex items-center gap-3 rounded-xl cursor-pointer
    hover:bg-base-200 transition-colors
          "
        >
          {icon && <span className="shrink-0">{icon}</span>}
          <span className="truncate">{title}</span>
          <ChevronDown
            className="
              ml-auto w-4 h-4 transition-transform
              group-open:rotate-180
            "
          />
        </summary>
        <ul className="ml-2 mt-1 space-y-1">{children}</ul>
      </details>
    </li>
  );
}



function SidebarSubLink({
  href,
  label,
  active,
  onClick,
}: {
  href: string;
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <li>
      <Link
        href={href}
        onClick={onClick}
        aria-current={active ? 'page' : undefined}
        className={[
          'flex items-center gap-2 rounded-xl pl-9 pr-3 py-2 text-sm',
          'transition-colors',
          active ? 'active' : 'hover:bg-base-200',
        ].join(' ')}
      >
        <span className="truncate">{label}</span>
      </Link>
    </li>
  );
}

function BreadcrumbsBar() {
  const pathname = usePathname();
  const parts = (pathname || '/').split('/').filter(Boolean);

  // Build crumb items from the path (no duplicate "Home")
  const items = parts.map((p, i) => ({
    href: '/' + parts.slice(0, i + 1).join('/'),
    label: prettify(p),
  }));

  return (
    <div className="bg-base-200/80 backdrop-blur border-b border-base-300/70">
      <nav className="breadcrumbs text-sm max-w-screen-2xl mx-auto px-4 lg:px-6 py-2">
        <ul>
          <li><Link href="/">Home</Link></li>
          {items.map((c, i) => (
            <li key={c.href}>
              {i === items.length - 1 ? <span className="font-medium text-base-content/90">{c.label}</span> : <Link href={c.href}>{c.label}</Link>}
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

// local helper (same as before)
function prettify(segment: string) {
  return segment.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

