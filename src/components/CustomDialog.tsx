'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

export interface CustomDialogConfig {
  isOpen: boolean;
  type?: 'info' | 'warning' | 'error' | 'success' | 'confirm' | 'prompt';
  title?: string;
  message: string;
  promptValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: (value?: string) => void;
  onCancel?: () => void;
}

export default function CustomDialog({
  isOpen,
  type = 'warning',
  title,
  message,
  promptValue = '',
  confirmLabel = 'OK',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}: CustomDialogConfig) {
  const [inputValue, setInputValue] = React.useState(promptValue);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    setInputValue(promptValue);
  }, [promptValue, isOpen]);

  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onCancel) {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen || !mounted) return null;

  const getIcon = () => {
    switch (type) {
      case 'error': return '';
      case 'warning': return '';
      case 'success': return '';
      case 'confirm': return '';
      case 'prompt': return '';
      default: return '';
    }
  };

  const getTitle = () => {
    if (title) return title;
    switch (type) {
      case 'error': return 'Action Required';
      case 'warning': return 'Attention';
      case 'success': return 'Success';
      case 'confirm': return 'Please Confirm';
      case 'prompt': return 'Input Required';
      default: return 'Information';
    }
  };

  const handleConfirm = () => {
    if (onConfirm) {
      if (type === 'prompt') {
        onConfirm(inputValue);
      } else {
        onConfirm();
      }
    }
  };

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-overlay)',
        WebkitBackdropFilter: 'blur(8px)',
        padding: '20px',
        animation: 'fadeIn 0.2s ease-out',
      }}
      onClick={(e) => e.target === e.currentTarget && onCancel && onCancel()}
    >
      <div
        className="glass-panel"
        style={{
          width: '100%',
          maxWidth: '440px',
          padding: '24px',
          background: 'var(--bg-surface)',
          border: '1px solid var(--fill-4)',
          boxShadow: '0 20px 50px var(--bg-overlay), 0 0 20px var(--fill-4)',
          borderRadius: 'var(--radius-lg)',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
          <div style={{ fontSize: '1.8rem', lineHeight: 1 }}>{getIcon()}</div>
          <div style={{ flexGrow: 1 }}>
            <h4 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
              {getTitle()}
            </h4>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginTop: '4px', lineHeight: 1.5 }}>
              {message}
            </p>
          </div>
        </div>

        {type === 'prompt' && (
          <input
            type="text"
            className="form-input"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Type your response..."
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
            style={{ fontSize: '0.9rem', padding: '10px 12px' }}
          />
        )}

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '8px' }}>
          {(type === 'confirm' || type === 'prompt' || onCancel) && (
            <button
              type="button"
              onClick={onCancel}
              className="btn btn-secondary"
              style={{ padding: '8px 16px', fontSize: '0.82rem' }}
            >
              {cancelLabel}
            </button>
          )}
          <button
            type="button"
            onClick={handleConfirm}
            className="btn btn-primary"
            style={{
              padding: '8px 20px',
              fontSize: '0.82rem',
              borderRadius: '9999px',
              background: type === 'error' ? 'var(--color-danger)' : 'var(--ink)',
              color: type === 'error' ? 'var(--on-danger)' : 'var(--on-ink)',
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
