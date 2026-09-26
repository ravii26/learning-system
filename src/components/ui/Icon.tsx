import React from 'react';

/**
 * Line icons, drawn inline so they take the text colour. Replaces emoji
 * in the interface: emoji render differently on every platform and read
 * as decoration rather than meaning.
 */
const PATHS = {
  today: 'M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8',
  learn: 'M4 19V5a2 2 0 0 1 2-2h13v14H6a2 2 0 0 0-2 2a2 2 0 0 0 2 2h13',
  review: 'M20 12a8 8 0 1 1-2.3-5.7M20 4v4h-4',
  notebook: 'M4 20h4L19 9l-4-4L4 16v4M13.5 6.5l4 4',
  you: 'M12 12a4 4 0 1 0 0-8a4 4 0 1 0 0 8M4 21a8 8 0 0 1 16 0',
  search: 'M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14M20 20l-3.5-3.5',
  plus: 'M12 5v14M5 12h14',
  sun: 'M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5',
  system: 'M4 5h16v11H4zM9 20h6M12 16v4',
  logout: 'M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H4',
  clock: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M12 7v5l3 2',
  close: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12l5 5L20 7',
  arrowRight: 'M5 12h14M13 6l6 6-6 6',
  arrowLeft: 'M19 12H5M11 18l-6-6 6-6',
  chevronRight: 'M9 6l6 6-6 6',
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3M5 11a7 7 0 0 0 14 0M12 18v3',
  inbox: 'M4 13l2.5-7h11L20 13v6H4v-6M4 13h5l1 2h4l1-2h5',
  target: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8M12 11.5a.5.5 0 1 0 0 1a.5.5 0 1 0 0-1',
  compass: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M15.5 8.5l-2 5-5 2 2-5z',
  board: 'M4 4h5v16H4zM10 4h5v10h-5zM16 4h4v7h-4z',
  edit: 'M4 20h4L19 9l-4-4L4 16v4',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  play: 'M7 4l12 8-12 8z',
  archive: 'M3 5h18v4H3zM5 9v10h14V9M10 13h4',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, strokeWidth = 1.8, className, label }: {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
  /** Give a label only when the icon stands alone and means something; otherwise it's hidden from screen readers. */
  label?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
