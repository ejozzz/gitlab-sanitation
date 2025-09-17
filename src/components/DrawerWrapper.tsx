'use client';

import { ReactNode, useEffect, useRef, useState } from 'react';
import Navigation from '@/components/Navigation';

export default function DrawerWrapper({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  // DaisyUI's hidden checkbox for transitions
  const checkboxRef = useRef<HTMLInputElement>(null);

  // IMPORTANT: Reference the *panel* (ul.menu), not the .drawer-side container
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

  // Close on outside click (mobile only) — compare against the PANEL
  useEffect(() => {
    if (!open || isDesktop) return;

    const onOutsideCapture = (e: Event) => {
      const panelEl = panelRef.current;
      const target = e.target as Node | null;
      if (!panelEl || !target) return;

      // If the click/touch did NOT start inside the menu panel, close it
      if (!panelEl.contains(target)) {
        setOpen(false);
      }
    };

    // Capture so nothing can swallow the event first
    document.addEventListener('pointerdown', onOutsideCapture, true);
    document.addEventListener('click', onOutsideCapture, true);
    document.addEventListener('touchstart', onOutsideCapture, true);

    // ESC key to close
    const onKey = (ev: KeyboardEvent) => ev.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);

    // Optional: prevent body scroll while the drawer is open on mobile
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('pointerdown', onOutsideCapture, true);
      document.removeEventListener('click', onOutsideCapture, true);
      document.removeEventListener('touchstart', onOutsideCapture, true);
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, isDesktop]);

  const closeOnMobile = () => {
    if (!isDesktop) setOpen(false);
  };

  return (
    // `isolate` creates a new stacking context so sticky headers don't interfere
    // with click layers, which is often needed for drawers/overlays.
    <div className={`drawer isolate min-h-screen ${isDesktop && open ? 'drawer-open' : ''}`}>
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
        <Navigation />
        <main className="flex-1 p-4 lg:p-6">{children}</main>
      </div>

      {/* SIDEBAR (canonical DaisyUI: .drawer-side contains the panel) */}
      <div className="drawer-side z-[1000]">
        {/* We intentionally omit the <label class="drawer-overlay"> so nothing ever
           sits above the menu panel and "disables" it. The close-on-outside logic
           now handles dismissal reliably. */}

        {/* PANEL: put the ref here */}
        <ul ref={panelRef} className="menu p-4 w-64 min-h-full bg-base-200 text-base-content">
          <li className="menu-title"><span>GitLab Sanitation</span></li>
          <li><a href="/branches" onClick={closeOnMobile}>Branches</a></li>
          <li><a href="/cherry-picks" onClick={closeOnMobile}>Cherry-picks</a></li>
          <li><a href="/merge-requests" onClick={closeOnMobile}>Merge Requests</a></li>
          <li><a href="/settings" onClick={closeOnMobile}>Settings</a></li>
        </ul>
      </div>
    </div>
  );
}
