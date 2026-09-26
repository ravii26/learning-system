import './globals.css';
import { Metadata, Viewport } from 'next';
import { Newsreader, Schibsted_Grotesk, JetBrains_Mono } from 'next/font/google';

// Serif for headings and anything you read at length; a quiet grotesk for
// the interface; mono for code. Exposed as CSS variables that globals.css
// builds its --font-* stacks from.
const display = Newsreader({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  axes: ['opsz'],
  variable: '--font-display',
  display: 'swap',
  // next/font has no fallback metrics for Newsreader and logs an error
  // trying; Georgia in the --font-serif stack is the fallback instead.
  adjustFontFallback: false,
});
const ui = Schibsted_Grotesk({ subsets: ['latin'], variable: '--font-ui', display: 'swap' });
const code = JetBrains_Mono({ subsets: ['latin'], variable: '--font-code', display: 'swap' });

export const metadata: Metadata = {
  title: 'Learning OS',
  description: 'Learn many things, know where you stand, and keep what you learn.',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F6F4EF' },
    { media: '(prefers-color-scheme: dark)', color: '#141311' },
  ],
};

// Runs before first paint: applies a theme you picked explicitly, so the
// page never flashes the system theme first. No choice = follow the system.
const themeScript = `try{var t=localStorage.getItem('theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${display.variable} ${ui.variable} ${code.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
