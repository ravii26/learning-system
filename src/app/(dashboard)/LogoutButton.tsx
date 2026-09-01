'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';

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
        <div className="avatar-circle">LO</div>
        <span style={{ fontSize: '0.82rem' }}>Account</span>
        <span style={{ fontSize: '0.65rem', opacity: 0.6, marginLeft: '-2px' }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="avatar-dropdown">
          <div style={{
            padding: '10px 12px 8px',
            borderBottom: '1px solid var(--border-color)',
            marginBottom: '4px',
          }}>
            <p style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>Learning OS</p>
            <p style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>Single User Mode</p>
          </div>
          <button
            className="avatar-dropdown-item danger"
            onClick={handleSignOut}
            disabled={signingOut}
          >
            <span>🚪</span>
            <span>{signingOut ? 'Signing out...' : 'Sign Out'}</span>
          </button>
        </div>
      )}
    </div>
  );
}
