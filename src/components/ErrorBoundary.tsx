'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in component:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div
          className="glass-panel"
          style={{
            padding: '24px',
            textAlign: 'center',
            border: '1px solid var(--danger-line)',
            background: 'var(--danger-tint)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--color-danger)', marginTop: '6px' }}>
            {this.props.fallbackTitle || 'Something went wrong rendering this section'}
          </h4>
          <p style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
            {this.state.error?.message || 'An unexpected rendering error occurred.'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="btn btn-secondary"
            style={{ marginTop: '12px', fontSize: '0.75rem', padding: '6px 12px' }}
          >
            ↺ Try Reloading Component
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
