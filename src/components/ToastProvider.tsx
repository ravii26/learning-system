'use client';

import { Icon } from '@/components/ui/Icon';
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title?: string;
  message: string;
}

interface ToastContextType {
  toast: {
    success: (message: string, title?: string) => void;
    error: (message: string, title?: string) => void;
    info: (message: string, title?: string) => void;
    warning: (message: string, title?: string) => void;
  };
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    // Fallback if rendered outside ToastProvider
    return {
      success: (msg: string) => console.log('Toast success:', msg),
      error: (msg: string) => console.error('Toast error:', msg),
      info: (msg: string) => console.log('Toast info:', msg),
      warning: (msg: string) => console.warn('Toast warning:', msg),
    };
  }
  return context.toast;
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const addToast = useCallback((type: ToastMessage['type'], message: string, title?: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, type, message, title }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = {
    success: (message: string, title?: string) => addToast('success', message, title),
    error: (message: string, title?: string) => addToast('error', message, title),
    info: (message: string, title?: string) => addToast('info', message, title),
    warning: (message: string, title?: string) => addToast('warning', message, title),
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {mounted &&
        createPortal(
          <div
            style={{
              position: 'fixed',
              bottom: '24px',
              right: '24px',
              zIndex: 999999,
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              maxWidth: '380px',
              width: 'calc(100vw - 48px)',
              pointerEvents: 'none',
            }}
          >
            {toasts.map((t) => (
              <div
                key={t.id}
                style={{
                  pointerEvents: 'auto',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                  padding: '14px 18px',
                  borderRadius: '12px',
                  background: 'var(--bg-surface)',
                  boxShadow: 'var(--shadow-pop)',
                  border: t.type === 'error' ? '1px solid var(--danger-line)' : '1px solid var(--border-color)',
                  color: 'var(--color-text-primary)',
                  animation: 'fadeIn 0.2s ease-out',
                }}
              >
                {(t.type === 'success' || t.type === 'error') && (
                  <span style={{ marginTop: '1px', color: t.type === 'success' ? 'var(--color-success)' : 'var(--color-danger)' }}>
                    <Icon name={t.type === 'success' ? 'check' : 'close'} size={18} strokeWidth={2.2} />
                  </span>
                )}
                <div style={{ flex: 1 }}>
                  {t.title && <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '2px' }}>{t.title}</div>}
                  <div style={{ fontSize: '0.83rem', color: 'var(--color-text-primary)', lineHeight: 1.4 }}>{t.message}</div>
                </div>
                <button
                  onClick={() => removeToast(t.id)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--color-text-muted)',
                    cursor: 'pointer',
                    fontSize: '1rem',
                    lineHeight: 1,
                    padding: '2px',
                  }}
                  title="Close"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>,
          document.body
        )}
    </ToastContext.Provider>
  );
}
