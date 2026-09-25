'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function NavLinks() {
  const pathname = usePathname();

  const links = [
    { name: 'Home', href: '/', icon: '🏠' },
    { name: 'Goals', href: '/goals', icon: '🎯' },
    { name: 'Roadmaps', href: '/plan', icon: '🗺️' },
    { name: 'Explore', href: '/explore', icon: '🧭' },
    { name: 'Daily Review', href: '/review', icon: '🔄' },
    { name: 'Practice', href: '/practice', icon: '🎙️' },
    { name: 'Notes', href: '/notes', icon: '📝' },
    { name: 'Progress', href: '/progress', icon: '📈' },
    { name: 'Where I Stand', href: '/skills', icon: '🌳' },
  ];

  return (
    <>
      {links.map((link) => {
        const isActive = link.href === '/' ? pathname === '/' : pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.name}
            href={link.href}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '9px 14px',
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
