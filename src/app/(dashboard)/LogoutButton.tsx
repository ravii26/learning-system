'use client';

import { useRouter } from 'next/navigation';

export default function LogoutButton() {
  const router = useRouter();

  const handleLogout = async () => {
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'logout' }),
      });
      if (res.ok) {
        router.push('/login');
        router.refresh();
      }
    } catch (e) {
      console.error('Logout failed:', e);
    }
  };

  return (
    <button
      onClick={handleLogout}
      className="btn btn-secondary"
      style={{ padding: '8px 14px', fontSize: '0.8rem', borderRadius: 'var(--radius-sm)' }}
    >
      Sign Out
    </button>
  );
}
