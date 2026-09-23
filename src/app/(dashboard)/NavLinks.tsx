'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function NavLinks() {
  const pathname = usePathname();

  const links = [
    { name: 'Today', href: '/', icon: '☀️' },
    { name: 'Plan', href: '/plan', icon: '📊' },
    { name: 'Where You Stand', href: '/skills', icon: '🧭' },
    { name: 'Goals', href: '/goals', icon: '🎯' },
    { name: 'Notes', href: '/notes', icon: '📓' },
    { name: 'Weekly Review', href: '/review', icon: '🔄' },
    { name: 'Exploration Mode', href: '/explore', icon: '⏱️' },
  ];

  return (
    <>
      {links.map((link) => {
        const isActive = pathname === link.href;
        return (
          <Link
            key={link.name}
            href={link.href}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '12px 16px',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.95rem',
              fontWeight: 500,
              background: isActive ? 'rgba(99, 102, 241, 0.12)' : 'transparent',
              border: isActive ? '1px solid rgba(99, 102, 241, 0.15)' : '1px solid transparent',
              color: isActive ? 'var(--color-primary-light)' : 'var(--color-text-secondary)',
              transition: 'all var(--transition-fast)',
            }}
          >
            <span style={{ fontSize: '1.1rem' }}>{link.icon}</span>
            <span>{link.name}</span>
          </Link>
        );
      })}
    </>
  );
}
