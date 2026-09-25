import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { isAuthenticated, getSessionUserId } from '@/lib/auth';
import NavLinks from '@/app/(dashboard)/NavLinks';
import LogoutButton from '@/app/(dashboard)/LogoutButton';

import { ToastProvider } from '@/components/ToastProvider';
import HeaderToolbar from '@/components/HeaderToolbar';

export const revalidate = 0; // Disable caching to ensure stats are always up to date

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

  // Fetch active topics count (limit tracker)
  const activeCount = await db.topic.count({
    where: { status: 'active', userId },
  });

  // Fetch days since last review.
  // ReviewSession is the weekly-audit snapshot — was named ReviewLog until
  // the Phase 3 migration, which renamed it to free that name for the new
  // per-concept ReviewLog. This query means "days since last weekly audit",
  // so it has to follow the rename; using db.reviewLog here now would
  // silently query per-concept review events instead.
  const lastReview = await db.reviewSession.findFirst({
    where: { userId },
    orderBy: { reviewedAt: 'desc' },
  });

  let daysSinceLastReview: number | null = null;
  if (lastReview) {
    const diffTime = Math.abs(new Date().getTime() - lastReview.reviewedAt.getTime());
    daysSinceLastReview = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  }

  return (
    <ToastProvider>
      <div className="app-container">
        {/* Sidebar Navigation */}
        <aside className="app-sidebar">
          <div style={{ padding: '24px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--color-primary), var(--color-accent))' }}></div>
            <span style={{ fontSize: '1.2rem', fontWeight: 700, letterSpacing: '-0.025em', background: 'linear-gradient(to right, #fff, #a855f7)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Learning OS
            </span>
          </div>
          
          <div style={{ flexGrow: 1, padding: '24px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <NavLinks />
            </nav>
            
            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '20px', fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--color-success)', display: 'inline-block', boxShadow: '0 0 6px var(--color-success)', flexShrink: 0 }} />
              <span>Personal Learning Workspace</span>
            </div>
          </div>
        </aside>

        {/* Main Panel */}
        <div className="app-main">
          {/* Header */}
          <header className="app-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>📚</span>
                <div 
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '6px', 
                    background: 'rgba(99, 102, 241, 0.1)', 
                    border: '1px solid rgba(99, 102, 241, 0.2)',
                    padding: '4px 12px', 
                    borderRadius: '9999px',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    color: 'var(--color-primary-light)'
                  }}
                >
                  {activeCount} {activeCount === 1 ? 'topic' : 'topics'} in progress
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
                <span style={{ color: 'var(--color-text-secondary)' }}>Last review:</span>
                {daysSinceLastReview === null ? (
                  <Link
                    href="/review"
                    style={{
                      color: 'var(--color-warning)',
                      fontWeight: 500,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      textDecoration: 'none',
                      borderBottom: '1px dashed rgba(245,158,11,0.4)',
                      paddingBottom: '1px',
                      transition: 'opacity 0.15s ease',
                    }}
                  >
                    Start your first review →
                  </Link>
                ) : (
                  <span style={{
                    color: daysSinceLastReview > 7 ? 'var(--color-danger)' : 'var(--color-success)',
                    fontWeight: 500,
                  }}>
                    {daysSinceLastReview === 0 ? 'Today' : `${daysSinceLastReview}d ago`}
                  </span>
                )}
              </div>
            </div>

            <HeaderToolbar />
          </header>

          {/* Content */}
          <main className="app-content">
            {children}
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
