'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type Mode = 'login' | 'signup' | 'claim' | 'legacy';

const TITLES: Record<Mode, string> = {
  login: 'Sign in',
  signup: 'Create your account',
  claim: 'Set up your owner account',
  legacy: 'Sign in with the app password',
};

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [appPassword, setAppPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [signupOpen, setSignupOpen] = useState(false);
  const [ownerUnclaimed, setOwnerUnclaimed] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetch('/api/auth')
      .then((r) => r.json())
      .then((d) => {
        setSignupOpen(!!d.signupOpen);
        setOwnerUnclaimed(!!d.ownerUnclaimed);
      })
      .catch(() => {});
  }, []);

  const switchTo = (m: Mode) => {
    setMode(m);
    setError(null);
    setPassword('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const body =
      mode === 'legacy' ? { password }
      : mode === 'login' ? { email, password }
      : mode === 'signup' ? { action: 'signup', email, password, name }
      : { action: 'claim', email, password, name, appPassword };

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        router.push('/');
        router.refresh();
      } else {
        setError(data.error || 'That didn’t work.');
      }
    } catch {
      setError('Couldn’t reach the server. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const creating = mode === 'signup' || mode === 'claim';
  const link = 'text-[0.9rem] font-medium text-fg-secondary underline underline-offset-2 hover:text-fg';

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="flex w-full max-w-[380px] flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h1 className="m-0 font-serif text-[2.6rem] font-normal leading-none tracking-[-0.02em] text-fg">Learning OS</h1>
          <p className="m-0 text-[1rem] text-fg-secondary">Learn many things. Know where you stand. Keep what you learn.</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <h2 className="m-0 text-[1.1rem] font-semibold text-fg">{TITLES[mode]}</h2>
          {mode === 'claim' && (
            <p className="m-0 text-[0.9rem] text-fg-secondary">
              Your existing topics and notes move to this account. After this, the shared app password stops working.
            </p>
          )}

          {creating && (
            <div className="flex flex-col gap-2">
              <label className="text-[0.9rem] font-semibold text-fg" htmlFor="name">Name <span className="font-normal text-fg-muted">(optional)</span></label>
              <input id="name" className="form-input h-12" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </div>
          )}

          {mode !== 'legacy' && (
            <div className="flex flex-col gap-2">
              <label className="text-[0.9rem] font-semibold text-fg" htmlFor="email">Email</label>
              <input id="email" type="email" className="form-input h-12" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required autoFocus />
            </div>
          )}

          <div className="flex flex-col gap-2">
            <label className="text-[0.9rem] font-semibold text-fg" htmlFor="password">
              {mode === 'legacy' ? 'App password' : creating ? 'New password' : 'Password'}
            </label>
            <input
              id="password"
              type="password"
              className="form-input h-12"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={creating ? 'new-password' : 'current-password'}
              minLength={creating ? 8 : undefined}
              required
              autoFocus={mode === 'legacy'}
            />
            {creating && <span className="text-[0.8rem] text-fg-muted">At least 8 characters.</span>}
          </div>

          {mode === 'claim' && (
            <div className="flex flex-col gap-2">
              <label className="text-[0.9rem] font-semibold text-fg" htmlFor="app-password">Current app password</label>
              <input id="app-password" type="password" className="form-input h-12" value={appPassword} onChange={(e) => setAppPassword(e.target.value)} autoComplete="off" required />
            </div>
          )}

          {error && <p role="alert" className="m-0 text-[0.875rem] font-medium text-danger">{error}</p>}

          <button type="submit" className="btn btn-primary h-12 w-full text-[1rem]" disabled={loading}>
            {loading ? 'Working…' : creating ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <div className="flex flex-col items-start gap-2">
          {mode !== 'login' && <button type="button" className={link} onClick={() => switchTo('login')}>Sign in with email</button>}
          {mode !== 'signup' && signupOpen && <button type="button" className={link} onClick={() => switchTo('signup')}>Create an account</button>}
          {ownerUnclaimed && mode !== 'claim' && <button type="button" className={link} onClick={() => switchTo('claim')}>Owner: set up your email login</button>}
          {ownerUnclaimed && mode !== 'legacy' && <button type="button" className={link} onClick={() => switchTo('legacy')}>Use the app password</button>}
        </div>
      </div>
    </main>
  );
}
