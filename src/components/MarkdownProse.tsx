'use client';

import React from 'react';
import { renderMarkdown } from '@/lib/markdown';

/**
 * Rendered markdown that only touches the page when its text changes. Pages
 * with a running timer re-render every second, and an unmemoized
 * dangerouslySetInnerHTML rebuilds its DOM each time, wiping any text the
 * reader has selected.
 */
export const MarkdownProse = React.memo(function MarkdownProse({ markdown, className }: { markdown: string; className?: string }) {
  return <div className={className} dangerouslySetInnerHTML={{ __html: renderMarkdown(markdown) }} />;
});
