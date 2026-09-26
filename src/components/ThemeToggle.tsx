'use client';

import React, { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';

type Theme = 'system' | 'light' | 'dark';
const ORDER: Theme[] = ['system', 'light', 'dark'];
const LABEL: Record<Theme, string> = { system: 'Theme: follows your system', light: 'Theme: light', dark: 'Theme: dark' };
const ICON = { system: 'system', light: 'sun', dark: 'moon' } as const;

function read(): Theme {
  try {
    const t = localStorage.getItem('theme');
    return t === 'light' || t === 'dark' ? t : 'system';
  } catch {
    return 'system';
  }
}

/**
 * Follows the system by default; one click cycles to light, then dark,
 * then back. The choice is remembered on this device (and applied before
 * paint by the script in app/layout.tsx).
 */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('system');

  useEffect(() => setTheme(read()), []);

  const cycle = () => {
    const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
    setTheme(next);
    try {
      if (next === 'system') localStorage.removeItem('theme');
      else localStorage.setItem('theme', next);
    } catch {
      // storage blocked: still switch for this visit
    }
    if (next === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', next);
  };

  return (
    <button
      type="button"
      onClick={cycle}
      title={LABEL[theme]}
      aria-label={`${LABEL[theme]}. Change theme`}
      className="flex h-10 w-10 items-center justify-center rounded-[10px] text-fg-secondary hover:bg-fill-2 hover:text-fg"
    >
      <Icon name={ICON[theme]} />
    </button>
  );
}
