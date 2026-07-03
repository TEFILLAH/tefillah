import { Component } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * Catches render-phase errors anywhere in the tree and shows a recovery UI.
 * Mirrors the admin-panel ErrorBoundary so a single bad component never
 * unmounts the whole app for visitors.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error('[ErrorBoundary] Render error:', error);
    if (info?.componentStack) console.error(info.componentStack);
  }

  handleReset = () => this.setState({ hasError: false, error: undefined });
  handleReload = () => window.location.reload();

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-[70vh] flex items-center justify-center p-6">
        <div
          className="surface-card max-w-lg w-full p-6"
          style={{ borderColor: 'var(--color-error)' }}
        >
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
              style={{ background: 'rgba(185, 28, 28, 0.10)' }}
            >
              <AlertTriangle className="w-5 h-5" style={{ color: 'var(--color-error)' }} />
            </div>
            <div>
              <h2 className="text-lg font-serif">Something went wrong</h2>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                This page hit a render error. The rest of Tefillah is still available.
              </p>
            </div>
          </div>
          {this.state.error?.message && (
            <pre
              className="mt-3 text-[11px] rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-words"
              style={{
                background: 'var(--color-surface)',
                color: 'var(--color-error)',
              }}
            >
              {this.state.error.message}
            </pre>
          )}
          <div className="flex flex-wrap gap-2 mt-4">
            <button onClick={this.handleReset} className="btn-primary">
              <RefreshCw className="w-4 h-4" /> Try again
            </button>
            <button onClick={this.handleReload} className="btn-ghost">
              Reload page
            </button>
          </div>
        </div>
      </div>
    );
  }
}
