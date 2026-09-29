'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { useAiMode } from '@/lib/useAiMode';

export default function LogoutButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [account, setAccount] = useState<{ email: string | null; name: string | null } | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const { manual, mode, setMode } = useAiMode();

  useEffect(() => {
    fetch('/api/auth')
      .then((r) => r.json())
      .then((d) => { setAccount(d.user ?? null); setIsOwner(d.isOwner === true); })
      .catch(() => {});
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'logout' }),
      });
    } catch (e) {
      console.error('Sign out error:', e);
    }
    router.push('/login');
    router.refresh();
  };

  return (
    <div style={{ position: 'relative' }} ref={dropdownRef}>
      <button
        className="avatar-btn"
        onClick={() => setOpen(prev => !prev)}
        aria-label="User menu"
        aria-expanded={open}
      >
        <div className="avatar-circle">
          <Icon name="you" size={15} />
        </div>
        <span className="hidden text-[0.82rem] sm:inline">Account</span>
      </button>

      {open && (
        <div className="avatar-dropdown">
          <div style={{
            padding: '10px 12px 8px',
            borderBottom: '1px solid var(--border-color)',
            marginBottom: '4px',
          }}>
            <p style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>{account?.name || 'Learning OS'}</p>
            <p style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>{account?.email || 'Owner workspace — set up email login from the sign-in page'}</p>
          </div>
          <Link href="/friends" className="avatar-dropdown-item no-underline hover:no-underline" onClick={() => setOpen(false)}>
            <Icon name="you" size={16} />
            <span>Friends</span>
          </Link>
          {mode && (
            <button type="button" className="avatar-dropdown-item" onClick={() => setMode(manual ? 'app' : 'manual')}
              title="Plans, lessons and practice days: written by the app's AI, or by your own ChatGPT/Claude (copy-paste, free)">
              <Icon name="link" size={16} />
              <span>{manual ? 'AI: my own chat ✓ (switch to app)' : 'AI: app (use my own chat)'}</span>
            </button>
          )}
          {isOwner && (
            <Link href="/usage" className="avatar-dropdown-item no-underline hover:no-underline" onClick={() => setOpen(false)}>
              <Icon name="board" size={16} />
              <span>AI usage &amp; cost</span>
            </Link>
          )}
          <button
            className="avatar-dropdown-item danger"
            onClick={handleSignOut}
            disabled={signingOut}
          >
            <Icon name="logout" size={16} />
            <span>{signingOut ? 'Signing out…' : 'Sign out'}</span>
          </button>
        </div>
      )}
    </div>
  );
}
