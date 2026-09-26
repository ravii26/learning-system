'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();

      if (res.ok) {
        router.push('/');
        router.refresh();
      } else {
        setError(data.error || 'That password didn’t work.');
      }
    } catch {
      setError('Couldn’t reach the server. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="flex w-full max-w-[380px] flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h1 className="m-0 font-serif text-[2.6rem] font-normal leading-none tracking-[-0.02em] text-fg">Learning OS</h1>
          <p className="m-0 text-[1rem] text-fg-secondary">Learn many things. Know where you stand. Keep what you learn.</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-[0.9rem] font-semibold text-fg" htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              className="form-input h-12"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              autoFocus
            />
          </div>

          {error && (
            <p role="alert" className="m-0 text-[0.875rem] font-medium text-danger">{error}</p>
          )}

          <button type="submit" className="btn btn-primary h-12 w-full text-[1rem]" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </main>
  );
}
