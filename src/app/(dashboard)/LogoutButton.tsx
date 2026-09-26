'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';

export default function LogoutButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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
            <p style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>Learning OS</p>
            <p style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>Your personal workspace</p>
          </div>
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
