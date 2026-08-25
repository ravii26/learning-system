import './globals.css';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Learning OS',
  description: 'Your Personal Learning Operating System — track status, limits, progress, and next actions.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
