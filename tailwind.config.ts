import type { Config } from 'tailwindcss';

/**
 * Tailwind is layered onto the existing design (globals.css), not
 * replacing it: colors/radii map to the same CSS custom properties, so a
 * Tailwind class and an old inline style render identically. Preflight is
 * off because globals.css already has its own reset — enabling it would
 * restyle every not-yet-migrated screen at once. Screens move onto the
 * primitives in src/components/ui/ one at a time.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  corePlugins: { preflight: false },
  theme: {
    extend: {
      colors: {
        // Not "base": `text-base` is Tailwind's font-size utility, and a
        // color of that name makes it paint text near-black as well.
        canvas: 'var(--bg-base)',
        surface: { DEFAULT: 'var(--bg-surface)', hover: 'var(--bg-surface-hover)' },
        card: { DEFAULT: 'var(--bg-card)', hover: 'var(--bg-card-hover)' },
        line: { DEFAULT: 'var(--border-color)', hover: 'var(--border-color-hover)' },
        fg: {
          DEFAULT: 'var(--color-text-primary)',
          secondary: 'var(--color-text-secondary)',
          muted: 'var(--color-text-muted)',
        },
        primary: { DEFAULT: 'var(--color-primary)', light: 'var(--color-primary-light)', glow: 'var(--color-primary-glow)' },
        secondary: { DEFAULT: 'var(--color-secondary)', light: 'var(--color-secondary-light)' },
        accent: 'var(--color-accent)',
        danger: 'var(--color-danger)',
        warning: 'var(--color-warning)',
        success: 'var(--color-success)',
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
      },
    },
  },
  plugins: [],
};

export default config;
