import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { isAuthenticated, getSessionUserId } from '@/lib/auth';
import NavLinks from '@/app/(dashboard)/NavLinks';

import { ToastProvider } from '@/components/ToastProvider';
import HeaderToolbar from '@/components/HeaderToolbar';
import { Icon } from '@/components/ui/Icon';
import { goalDisplayName } from '@/lib/focusQueue';

export const revalidate = 0; // Disable caching so the sidebar is always current

const SIDEBAR_ITEMS = 5;

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!isAuthenticated()) {
    redirect('/login');
  }
  const userId = getSessionUserId();
  if (!userId) {
    redirect('/login');
  }

  // Both lookups are independent: run them together so every page pays for
  // one database round trip here instead of two.
  // The weekly check-in is the ReviewSession table (renamed from ReviewLog in
  // the Phase 3 migration, which freed that name for the per-concept review
  // log) — don't swap in reviewLog.
  const [activeTopics, pins, lastReview] = await Promise.all([
    db.topic.findMany({
      where: { status: 'active', userId, deletedAt: null },
      select: { id: true, title: true },
      orderBy: { lastTouchedDate: 'desc' },
      take: SIDEBAR_ITEMS,
    }),
    db.focusItem.findMany({
      where: { userId, completedAt: null },
      select: { id: true, title: true, goalId: true, topicId: true, moduleId: true, goal: { select: { title: true, shortName: true } }, topic: { select: { title: true } } },
      orderBy: { createdAt: 'asc' },
      take: SIDEBAR_ITEMS,
    }),
    db.reviewSession.findFirst({
      where: { userId },
      orderBy: { reviewedAt: 'desc' },
    }),
  ]);
  // Your Focus list once you have one; until then, your active topics.
  const sidebarLabel = pins.length > 0 ? 'Focus' : 'Now';
  const sidebarItems = pins.length > 0
    ? pins.map((p) => ({
        id: p.id,
        title: p.goal ? goalDisplayName(p.goal) : p.topic?.title ?? p.title ?? 'Untitled',
        href: p.goalId ? `/goals/${p.goalId}` : p.topicId ? `/topics/${p.topicId}${p.moduleId ? `?module=${encodeURIComponent(p.moduleId)}` : ''}` : null,
      }))
    : activeTopics.map((t) => ({ id: t.id, title: t.title, href: `/topics/${t.id}` as string | null }));
  const daysSinceCheckIn = lastReview
    ? Math.floor((Date.now() - lastReview.reviewedAt.getTime()) / (1000 * 60 * 60 * 24))
    : null;
  const checkInDue = daysSinceCheckIn === null || daysSinceCheckIn >= 7;

  return (
    <ToastProvider>
      <div className="app-container">
        <aside className="app-sidebar">
          <div className="hidden px-7 pb-2 pt-7 md:block">
            <Link href="/" className="font-serif text-[1.55rem] font-medium tracking-[-0.01em] text-fg no-underline hover:no-underline">
              Learning OS
            </Link>
          </div>

          <div className="flex flex-grow flex-col md:justify-between md:px-4 md:py-5">
            <nav aria-label="Main" className="flex gap-1 px-2 py-1.5 md:flex-col md:gap-0.5 md:p-0">
              <NavLinks />
            </nav>

            <div className="hidden flex-col gap-5 px-3 md:flex">
              {sidebarItems.length > 0 && (
                <div className="flex flex-col gap-2">
                  <span className="text-[0.8rem] font-semibold text-fg-muted">{sidebarLabel}</span>
                  {sidebarItems.map((t) => (t.href
                    ? <Link key={t.id} href={t.href} className="truncate text-[0.875rem] text-fg-secondary">{t.title}</Link>
                    : <span key={t.id} className="truncate text-[0.875rem] text-fg-secondary">{t.title}</span>))}
                </div>
              )}

              {checkInDue && (
                <Link href="/review" className="text-[0.8rem] leading-snug text-fg-secondary">
                  {daysSinceCheckIn === null ? 'Try your first weekly check-in' : `Weekly check-in: ${daysSinceCheckIn} days ago`}
                </Link>
              )}

              <Link
                href="/learn/start"
                className="flex h-11 items-center gap-2.5 rounded-[10px] border border-dashed border-line-strong px-3 text-[0.875rem] font-medium text-fg-secondary no-underline hover:border-fg hover:text-fg hover:no-underline"
              >
                <Icon name="plus" size={16} />
                Learn something new
              </Link>
            </div>
          </div>
        </aside>

        <div className="app-main">
          <header className="app-header">
            <Link href="/" className="font-serif text-[1.25rem] font-medium text-fg no-underline hover:no-underline md:hidden">
              Learning OS
            </Link>
            <span className="hidden md:block" />
            <HeaderToolbar />
          </header>

          <main className="app-content">{children}</main>
        </div>
      </div>
    </ToastProvider>
  );
}
