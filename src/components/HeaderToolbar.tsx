'use client';

import React, { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import CommandPalette from './CommandPalette';
import LogoutButton from '@/app/(dashboard)/LogoutButton';

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
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button
          type="button"
          onClick={() => setIsPaletteOpen(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 14px',
            borderRadius: '9999px',
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            color: 'var(--color-text-secondary)',
            fontSize: '0.82rem',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
          className="glass-panel-hover"
          title="Search topics or actions (Ctrl+K)"
        >
          <span>🔍</span>
          <span>Quick Search...</span>
          <kbd
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              padding: '2px 6px',
              borderRadius: '4px',
              fontSize: '0.72rem',
              color: '#818cf8',
            }}
          >
            ⌘K
          </kbd>
        </button>
        <LogoutButton />
      </div>

      <CommandPalette isOpen={isPaletteOpen} onClose={() => setIsPaletteOpen(false)} />
    </>
  );
}


