import Link from 'next/link';

export default function NotFound() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '16px',
      padding: '24px',
      textAlign: 'center',
      background: 'var(--color-bg-primary, var(--bg-sunk))',
      color: 'var(--color-text-primary, var(--color-text-primary))',
      fontFamily: 'system-ui, sans-serif',
    }}>
      <span style={{ fontSize: '3rem' }}>🔍</span>
      <h1 style={{ fontSize: '2rem', fontWeight: 700, margin: 0 }}>Page Not Found</h1>
      <p style={{ fontSize: '0.95rem', color: 'var(--color-text-secondary, var(--color-text-muted))', maxWidth: '400px', margin: 0 }}>
        The topic, note, or view you are looking for does not exist or may have been moved.
      </p>
      <Link
        href="/"
        style={{
          marginTop: '12px',
          padding: '10px 20px',
          borderRadius: '8px',
          background: 'var(--color-primary, var(--ink))',
          color: 'var(--color-text-primary)',
          textDecoration: 'none',
          fontSize: '0.9rem',
          fontWeight: 600,
        }}
      >
        ← Return Home
      </Link>
    </div>
  );
}
