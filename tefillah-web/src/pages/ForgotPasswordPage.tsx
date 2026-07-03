import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowRight, CheckCircle2, Loader2, Lock, Mail, MailCheck } from 'lucide-react';
import PasswordInput from '../components/PasswordInput';
import Logo from '../components/Logo';
import { authAPI } from '../api/client';

type Stage = 'request' | 'reset';

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>('request');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const requestCode = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      await authAPI.forgotPassword(email.trim().toLowerCase());
      setSuccess('Check your inbox for a 6-digit reset code.');
      setStage('reset');
    } catch (err) {
      setError(extractMessage(err, 'Could not send reset code'));
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      await authAPI.resetPassword(email.trim().toLowerCase(), code.trim(), password);
      setSuccess('Password updated. Redirecting to sign-in…');
      setTimeout(() => navigate('/login', { replace: true }), 1500);
    } catch (err) {
      setError(extractMessage(err, 'Could not reset password'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 sm:px-6 py-12 sm:py-20">
      <div className="text-center anim-fade-up">
        <Logo size="md" />
        <h1 className="font-serif text-3xl sm:text-4xl mt-6">
          {stage === 'request' ? 'Reset your password' : 'Choose a new password'}
        </h1>
        <p className="mt-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          {stage === 'request'
            ? 'Enter your email and we will send you a 6-digit code.'
            : 'Enter the code from your email along with your new password.'}
        </p>
      </div>

      {error && (
        <div
          className="mt-6 flex items-start gap-2 rounded-lg p-3 text-sm"
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
          className="mt-6 flex items-start gap-2 rounded-lg p-3 text-sm"
          style={{
            background: 'rgba(4, 120, 87, 0.08)',
            border: '1px solid rgba(4, 120, 87, 0.20)',
            color: 'var(--color-success)',
          }}
        >
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {stage === 'request' ? (
        <form onSubmit={requestCode} className="mt-6 surface-card p-6 sm:p-8 space-y-4 anim-fade-up delay-100">
          <div>
            <label className="block text-sm mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>Email</label>
            <div className="relative">
              <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-muted)' }} />
              <input
                type="email"
                autoFocus
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input pl-10"
                placeholder="your@email.com"
              />
            </div>
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? <Loader2 size={18} className="animate-spin" /> : (<>Send code <ArrowRight size={16} /></>)}
          </button>
        </form>
      ) : (
        <form onSubmit={resetPassword} className="mt-6 surface-card p-6 sm:p-8 space-y-4 anim-fade-up delay-100">
          <div>
            <label className="block text-sm mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>Reset code</label>
            <div className="relative">
              <MailCheck size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-muted)' }} />
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                pattern="\d{6}"
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                className="input pl-10 tracking-[0.4em] text-center text-lg"
                placeholder="000000"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>New password</label>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 z-10" style={{ color: 'var(--color-text-muted)' }} />
              <PasswordInput
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input pl-10"
                placeholder="At least 8 characters"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>Confirm password</label>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 z-10" style={{ color: 'var(--color-text-muted)' }} />
              <PasswordInput
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="input pl-10"
                placeholder="Re-enter password"
              />
            </div>
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? <Loader2 size={18} className="animate-spin" /> : 'Update password'}
          </button>
          <button
            type="button"
            onClick={() => setStage('request')}
            className="text-sm w-full text-center"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            Use a different email
          </button>
        </form>
      )}

      <p className="mt-6 text-center text-sm" style={{ color: 'var(--color-text-secondary)' }}>
        Remembered it?{' '}
        <Link to="/login" className="font-medium" style={{ color: 'var(--color-accent)' }}>
          Back to sign-in
        </Link>
      </p>
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
