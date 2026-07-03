import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowLeft, CheckCircle2, Loader2, Lock } from 'lucide-react';
import PasswordInput from '../components/PasswordInput';
import { authAPI } from '../api/client';

export default function ChangePasswordPage() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    if (next.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (next !== confirm) {
      setError('New passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      await authAPI.changePassword(current, next);
      setSuccess(true);
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (err) {
      setError(extractMessage(err, 'Could not update your password.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 sm:px-6 py-12 sm:py-16">
      <Link to="/menu" className="inline-flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
        <ArrowLeft size={14} /> Back to menu
      </Link>

      <header className="mt-6 anim-fade-up">
        <p className="eyebrow">Security</p>
        <h1 className="font-serif text-3xl sm:text-4xl mt-2">Change password</h1>
      </header>

      <form onSubmit={onSubmit} className="mt-8 surface-card p-6 sm:p-8 space-y-4 anim-fade-up delay-100">
        {error && (
          <div
            className="flex items-start gap-2 rounded-lg p-3 text-sm"
            style={{
              background: 'rgba(185, 28, 28, 0.08)',
              border: '1px solid rgba(185, 28, 28, 0.20)',
              color: 'var(--color-error)',
            }}
          >
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div
            className="flex items-start gap-2 rounded-lg p-3 text-sm"
            style={{
              background: 'rgba(4, 120, 87, 0.08)',
              border: '1px solid rgba(4, 120, 87, 0.20)',
              color: 'var(--color-success)',
            }}
          >
            <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
            <span>Password updated successfully.</span>
          </div>
        )}

        <PasswordField id="current" label="Current password" value={current} onChange={setCurrent} autoComplete="current-password" />
        <PasswordField id="next" label="New password" value={next} onChange={setNext} autoComplete="new-password" />
        <PasswordField id="confirm" label="Confirm new password" value={confirm} onChange={setConfirm} autoComplete="new-password" />

        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? <Loader2 size={18} className="animate-spin" /> : 'Update password'}
        </button>
      </form>
    </div>
  );
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
        {label}
      </label>
      <div className="relative">
        <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 z-10" style={{ color: 'var(--color-text-muted)' }} />
        <PasswordInput
          id={id}
          required
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="input pl-10"
        />
      </div>
    </div>
  );
}

function extractMessage(err: unknown, fallback: string): string {
  if (typeof err === 'object' && err !== null && 'response' in err) {
    const r = (err as { response?: { data?: { detail?: string } } }).response;
    if (r?.data?.detail) return r.data.detail;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}
