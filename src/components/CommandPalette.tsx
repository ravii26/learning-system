'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { MIN_QUERY, SEARCH_KIND_LABEL, type SearchResult } from '@/lib/search';

interface PaletteItem {
  id: string;
  title: string;
  subtitle?: string | null;
  icon: string;
  action: () => void;
}

const SEARCH_DELAY_MS = 200;

interface TopicItem {
  id: string;
  title: string;
  category?: string;
  status?: string;
}

export interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [topics, setTopics] = useState<TopicItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keyboard shortcut Ctrl+K listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key?.toLowerCase() === 'k') {
        e.preventDefault();
        if (isOpen) {
          onClose();
        } else {
          // Open signal handler handled at parent or props
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Fetch topics when command palette opens
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setLoading(true);
      fetch('/api/topics')
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) {
            setTopics(data);
          } else if (data && Array.isArray(data.topics)) {
            setTopics(data.topics);
          }
        })
        .catch((err) => console.error('Failed to load topics for palette:', err))
        .finally(() => setLoading(false));

      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Everything else is searched on the server as you type.
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const term = query.trim();
  const searchMode = term.length >= MIN_QUERY;
  useEffect(() => {
    if (!isOpen || !searchMode) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: controller.signal })
        .then((res) => (res.ok ? res.json() : { results: [] }))
        .then((data) => {
          setResults(Array.isArray(data.results) ? data.results : []);
          setSelectedIndex(0);
          setSearching(false);
        })
        .catch((err) => {
          if (err?.name !== 'AbortError') setSearching(false);
        });
    }, SEARCH_DELAY_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [isOpen, searchMode, term]);

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isOpen || !mounted) return null;

  const quickActions = [
    { id: 'act-home', title: 'Go to Today', icon: '', action: () => router.push('/') },
    { id: 'act-learn', title: 'Go to Learn', icon: '', action: () => router.push('/plan') },
    { id: 'act-review', title: 'Open Review', icon: '', action: () => router.push('/review') },
    { id: 'act-notes', title: 'Open Notes', icon: '', action: () => router.push('/notes') },
    { id: 'act-explore', title: 'Explore Topic Ideas', icon: '', action: () => router.push('/explore') },
  ];

  const filteredTopics = topics.filter((t) =>
    t.title.toLowerCase().includes(query.toLowerCase()) ||
    (t.category && t.category.toLowerCase().includes(query.toLowerCase()))
  );

  const allItems: PaletteItem[] = [
    ...quickActions.filter((a) => a.title.toLowerCase().includes(query.toLowerCase())),
    ...(searchMode
      ? results.map((r) => ({
          id: `${r.kind}-${r.id}`,
          title: r.title,
          subtitle: r.snippet ? `${SEARCH_KIND_LABEL[r.kind]} · ${r.snippet}` : SEARCH_KIND_LABEL[r.kind],
          icon: '',
          action: () => router.push(r.href),
        }))
      : filteredTopics.map((t) => ({
          id: `topic-${t.id}`,
          title: t.title,
          icon: '',
          action: () => router.push(`/topics/${t.id}`),
        }))),
  ];

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (allItems.length > 0 ? (prev + 1) % allItems.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (allItems.length > 0 ? (prev - 1 + allItems.length) % allItems.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (allItems[selectedIndex]) {
        allItems[selectedIndex].action();
        onClose();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 999999,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '12vh',
        background: 'var(--bg-overlay)',
        animation: 'fadeIn 0.15s ease-out',
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="glass-panel"
        style={{
          width: '90%',
          maxWidth: '620px',
          background: 'var(--bg-surface)',
          border: '1px solid var(--fill-4)',
          borderRadius: '16px',
          boxShadow: '0 25px 60px var(--bg-overlay), 0 0 30px var(--fill-4)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Search Header Input */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '16px 20px',
            borderBottom: '1px solid var(--fill-3)',
          }}
        >
          <span style={{ fontSize: '1.2rem', color: 'var(--color-text-primary)' }}></span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search lessons, notes, cards and goals"
            style={{
              flex: 1,
              background: 'none',
              border: 'none',
              outline: 'none',
              color: 'var(--color-text-primary)',
              fontSize: '1rem',
              fontWeight: 500,
            }}
          />
          <kbd
            style={{
              padding: '3px 8px',
              borderRadius: '6px',
              background: 'var(--fill-3)',
              border: '1px solid var(--fill-4)',
              fontSize: '0.75rem',
              color: 'var(--color-text-muted)',
            }}
          >
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div style={{ maxHeight: '380px', overflowY: 'auto', padding: '8px' }}>
          {(loading || searching) && (
            <div style={{ padding: '12px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
              Searching…
            </div>
          )}

          {!loading && !searching && allItems.length === 0 && (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
              Nothing found for "{query}"
            </div>
          )}

          {!loading &&
            allItems.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={item.id}
                  onClick={() => {
                    item.action();
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    background: isSelected ? 'var(--fill-4)' : 'transparent',
                    border: isSelected ? '1px solid var(--fill-4)' : '1px solid transparent',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                    <span style={{ fontSize: '0.92rem', color: 'var(--color-text-primary)', fontWeight: 500 }}>
                      {item.title}
                    </span>
                    {item.subtitle && (
                      <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.subtitle}
                      </span>
                    )}
                  </div>
                  {isSelected && (
                    <span style={{ fontSize: '0.78rem', color: 'var(--color-text-primary)', fontWeight: 600 }}>Press ↵</span>
                  )}
                </div>
              );
            })}
        </div>

        {/* Palette Footer */}
        <div
          style={{
            padding: '10px 20px',
            background: 'var(--bg-surface)',
            borderTop: '1px solid var(--fill-2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.78rem',
            color: 'var(--color-text-muted)',
          }}
        >
          <span>Use ↑ ↓ arrows to navigate</span>
          <span>↵ Select &nbsp; | &nbsp; Ctrl+K Toggle</span>
        </div>
      </div>
    </div>,
    document.body
  );
}
