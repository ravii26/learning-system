'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Icon, type IconName } from '@/components/ui/Icon';

/**
 * Five places, one question each: what now (Today), what am I learning
 * (Learn), what might I forget (Review), what have I collected (Notebook),
 * where do I stand (You). Everything else lives inside one of them.
 */
const LINKS: Array<{ name: string; href: string; icon: IconName; match: string[] }> = [
  { name: 'Today', href: '/', icon: 'today', match: ['/'] },
  { name: 'Learn', href: '/plan', icon: 'learn', match: ['/plan', '/topics', '/goals', '/explore', '/practice'] },
  { name: 'Review', href: '/review', icon: 'review', match: ['/review'] },
  { name: 'Notebook', href: '/notes', icon: 'notebook', match: ['/notes'] },
  { name: 'You', href: '/progress', icon: 'you', match: ['/progress', '/skills'] },
];

const isActive = (pathname: string, match: string[]) =>
  match.some((m) => (m === '/' ? pathname === '/' : pathname === m || pathname.startsWith(`${m}/`)));

export default function NavLinks() {
  const pathname = usePathname();
  const [due, setDue] = useState(0);

  // Cards due right now, shown on Review. Refreshed on navigation, so it
  // drops as soon as you come back from a review session.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/review/spaced')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => !cancelled && setDue(Array.isArray(d?.dueConcepts) ? d.dueConcepts.length : 0))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return (
    <>
      {LINKS.map((link) => {
        const active = isActive(pathname, link.match);
        const badge = link.name === 'Review' && due > 0 ? due : null;
        return (
          <Link
            key={link.name}
            href={link.href}
            aria-current={active ? 'page' : undefined}
            className={[
              'relative flex flex-1 flex-col items-center justify-center gap-1 rounded-[10px] px-2 py-2 text-[0.7rem] no-underline hover:no-underline',
              'md:flex-none md:flex-row md:justify-start md:gap-3 md:px-3 md:py-0 md:h-11 md:text-[0.95rem]',
              active ? 'font-semibold text-fg md:bg-sunk' : 'font-medium text-fg-secondary hover:text-fg md:hover:bg-fill-2',
            ].join(' ')}
          >
            <Icon name={link.icon} size={20} />
            <span className="md:flex-1">{link.name}</span>
            {badge !== null && (
              <span
                className="absolute right-[18%] top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-k-fading-text px-1 text-[0.65rem] font-bold text-on-ink md:static md:h-[22px] md:min-w-[22px] md:text-[0.72rem]"
                aria-label={`${badge} due`}
              >
                {badge}
              </span>
            )}
          </Link>
        );
      })}
    </>
  );
}
