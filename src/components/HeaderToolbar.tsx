'use client';

import React, { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import CommandPalette from './CommandPalette';
import ThemeToggle from './ThemeToggle';
import LogoutButton from '@/app/(dashboard)/LogoutButton';
import { Icon } from '@/components/ui/Icon';

export default function HeaderToolbar() {
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsPaletteOpen((prev) => !prev);
        return;
      }

      // Global capture hotkey (Fix 5: capture must work from anywhere).
      // Skip while typing, or while the search palette is already open.
      if (e.key.toLowerCase() !== 'c' || e.ctrlKey || e.metaKey || e.altKey || isPaletteOpen) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      e.preventDefault();
      if (pathname === '/') {
        // Already on the Today screen — focus its capture input directly,
        // no navigation round-trip needed.
        window.dispatchEvent(new CustomEvent('learning-os:focus-capture'));
      } else {
        // The Today screen isn't mounted yet, so a same-tick custom event
        // would have no listener. Navigate there and let it self-focus via
        // the ?focus=capture param instead.
        router.push('/?focus=capture');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPaletteOpen, pathname, router]);

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setIsPaletteOpen(true)}
          className="flex h-10 items-center gap-2.5 rounded-[10px] border border-line bg-surface px-3 text-[0.875rem] text-fg-muted hover:border-line-hover sm:min-w-[240px]"
          title="Search topics and actions (Ctrl+K)"
        >
          <Icon name="search" size={16} />
          <span className="hidden flex-1 text-left sm:inline">Search</span>
          <kbd className="hidden rounded bg-sunk px-1.5 py-0.5 font-mono text-[0.7rem] text-fg-secondary sm:inline">Ctrl K</kbd>
        </button>
        <ThemeToggle />
        <LogoutButton />
      </div>

      <CommandPalette isOpen={isPaletteOpen} onClose={() => setIsPaletteOpen(false)} />
    </>
  );
}
