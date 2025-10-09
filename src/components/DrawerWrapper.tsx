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

/**
 * Drawer wrapper with hover-to-open submenus and "keep open when active" behavior.
 */
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
        <Navigation variant="app" />
        <BreadcrumbsBar />
        <main className="flex-1 p-4 lg:p-6">{children}</main>
      </div>

      {/* SIDEBAR */}
      <div className="drawer-side z-[1000]">
        {/* overlay so clicking the backdrop toggles the checkbox */}
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
  const pathname = usePathname() || '/';

  // Helpers to detect active groups
  const isReportsActive =
    pathname === '/reports' ||
    pathname.startsWith('/reports/');

  // const isPoliciesActive =
  //   pathname === '/policies' ||
  //   pathname.startsWith('/policies/');

  return (
    <aside className="h-full">
      <ul
        ref={panelRef}
        className="
          menu no-caret w-72 lg:w-72 min-h-full
          bg-base-200 border-r border-base-300 shadow-sm
          p-3 gap-1
        "
      >
        {/* Brand / Title */}
        <li className="menu-title px-2 py-1 text-base-content">
          <span className="text-sm font-semibold opacity-70 flex">GitLab Checker</span>
        </li>

        <div className="divider"></div>

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
          active={pathname.startsWith('/branches')}
          onClick={onLinkClick}
        />
        <SidebarLink
          href="/cherry-picks"
          icon={<GitCommit className="w-4 h-4" />}
          label="Cherry-picks"
          active={pathname.startsWith('/cherry-picks')}
          onClick={onLinkClick}
        />
        <SidebarLink
          href="/merge-requests"
          icon={<GitPullRequest className="w-4 h-4" />}
          label="Merge Requests"
          active={pathname.startsWith('/merge-requests')}
          onClick={onLinkClick}
        />

        {/* Grouped section */}
        <li className="menu-title px-2 pt-3">
          <span className="text-sm font-semibold opacity-70">Quality & Compliance</span>
        </li>

        {/* Hover-to-open + keep-open-when-active */}
        <SidebarCollapsibleHover
          title="Reports"
          icon={<Flag className="w-4 h-4" />}
          isGroupActive={isReportsActive}
          items={[
            { href: '/reports/activity', label: 'Activity' },
            { href: '/reports/sanitation', label: 'Sanitation' },
            { href: '/reports/coverage', label: 'Coverage' },
          ]}
          pathname={pathname}
          onLinkClick={onLinkClick}
        />

        {/* Example for Policies if you want later
        <SidebarCollapsibleHover
          title="Policies"
          icon={<ShieldCheck className="w-4 h-4" />}
          isGroupActive={isPoliciesActive}
          items={[
            { href: '/policies/branching', label: 'Branching Rules' },
            { href: '/policies/reviews', label: 'Review & Approval' },
          ]}
          pathname={pathname}
          onLinkClick={onLinkClick}
        />
        */}

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
          'flex items-center gap-3 rounded-xl px-3 py-2',
          'transition-colors',
          active ? 'active bg-base-100/70' : 'hover:bg-base-200',
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

/**
 * Collapsible group that:
 *  - opens on hover (desktop) using group-hover + CSS transitions
 *  - stays open if any child route is active (isGroupActive)
 *  - can also be toggled via click for keyboard/mobile
 */
function SidebarCollapsibleHover({
  title,
  icon,
  items,
  pathname,
  isGroupActive,
  onLinkClick,
}: {
  title: string;
  icon?: React.ReactNode;
  items: { href: string; label: string }[];
  pathname: string;
  isGroupActive: boolean;
  onLinkClick: () => void;
}) {
  const [isToggled, setIsToggled] = useState(false);

  // If a child is active or the group is toggled, we consider it open.
  const isOpen = isGroupActive || isToggled;

  // Any item active?
  const activeSet = new Set(items.map((i) => i.href));
  const anyChildActive = activeSet.has(pathname);

  return (
    <li className="relative group">
      <button
        type="button"
        className={[
          'no-summary-marker w-full text-left',
          'flex items-center gap-3 rounded-xl px-3 py-2',
          'cursor-pointer transition-colors',
          anyChildActive ? 'bg-base-100/70' : 'hover:bg-base-200',
        ].join(' ')}
        aria-expanded={isOpen}
        onClick={() => setIsToggled((s) => !s)}
      >
        {icon && <span className="shrink-0">{icon}</span>}
        <span className="truncate">{title}</span>
        <ChevronDown
          className={[
            'ml-auto w-4 h-4 transition-transform',
            isOpen ? 'rotate-180' : 'group-hover:rotate-180',
          ].join(' ')}
        />
      </button>

      {/* Submenu */}
      <ul
        className={[
          'ml-2 mt-1 space-y-1 overflow-hidden pr-1',
          // Animate height & opacity; open if active/toggled OR on hover (desktop)
          'transition-[max-height,opacity] duration-200',
          (isOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'),
          'group-hover:max-h-96 group-hover:opacity-100',
        ].join(' ')}
      >
        {items.map((it) => (
          <SidebarSubLink
            key={it.href}
            href={it.href}
            label={it.label}
            active={pathname === it.href}
            onClick={onLinkClick}
          />
        ))}
      </ul>
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
          active ? 'active bg-base-100/70' : 'hover:bg-base-200',
        ].join(' ')}
      >
        <span className="truncate">{label}</span>
      </Link>
    </li>
  );
}

/* -------------------------------- Breadcrumbs ------------------------------- */

function BreadcrumbsBar() {
  const pathname = usePathname();

  // split into segments; keep both encoded and decoded forms
  const segments = (pathname || '/')
    .split('/')
    .filter(Boolean)
    .map((encoded) => ({
      encoded,
      decoded: safeDecode(encoded),
    }));

  // Build items with encoded hrefs (for correct routing) and readable labels
  const items = segments.map((seg, i) => {
    const href =
      '/' + segments.slice(0, i + 1).map((s) => s.encoded).join('/');

    const label =
      seg.decoded.includes('/') ? seg.decoded : prettify(seg.decoded);

    return { href, label, isLast: i === segments.length - 1 };
  });

  if (items.length === 0) return null;

  return (
    <div className="bg-base-200/80 backdrop-blur border-b border-base-300/70">
      <nav className="breadcrumbs text-sm max-w-screen-2xl mx-auto px-4 lg:px-6 py-2">
        <ul>
          <li>
            <Link href="/">Home</Link>
          </li>
          {items.map((c) => (
            <li key={c.href}>
              {c.isLast ? (
                <span className="font-medium text-base-content/90">{c.label}</span>
              ) : (
                <Link href={c.href}>{c.label}</Link>
              )}
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

function safeDecode(s: string) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function prettify(segment: string) {
  return segment
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
