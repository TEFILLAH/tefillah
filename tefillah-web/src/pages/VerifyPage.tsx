import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Loader2, MailCheck } from 'lucide-react';
import Logo from '../components/Logo';
import { useAuthStore } from '../store/authStore';

export default function VerifyPage() {
  const navigate = useNavigate();
  const { user, partner, userType, verifyEmail, resendVerification, isLoading, error, clearError } = useAuthStore();
  const email = user?.email ?? partner?.email ?? '';
  const verified = user?.is_verified ?? partner?.is_verified ?? false;

  const [code, setCode] = useState('');
  const [resent, setResent] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const tickRef = useRef<number | null>(null);

  const homeFor = (t: typeof userType) =>
    t === 'partner' ? '/partner/dashboard' : '/home';

  useEffect(() => {
    if (verified) navigate(homeFor(userType), { replace: true });
  }, [verified, userType, navigate]);

  useEffect(() => {
    if (cooldown <= 0) return;
    tickRef.current = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => {
      if (tickRef.current) window.clearTimeout(tickRef.current);
    };
  }, [cooldown]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    clearError();
    try {
      await verifyEmail(code.trim());
      navigate(homeFor(userType), { replace: true });
    } catch {
      // error in store
    }
  };

  const onResend = async () => {
    setResending(true);
    setResent(false);
    try {
      await resendVerification();
      setResent(true);
      setCooldown(60);
    } catch {
      /* nothing — error already shown */
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 sm:px-6 py-12 sm:py-20">
      <div className="text-center anim-fade-up">
        <Logo size="md" />
        <h1 className="font-serif text-3xl sm:text-4xl mt-6">Verify Your Email</h1>
        <p className="mt-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          We've sent a 6-digit code to{' '}
          <span style={{ color: 'var(--color-text)' }}>{email || 'your inbox'}</span>
        </p>
      </div>

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

        {resent && (
          <div
            className="flex items-start gap-2 rounded-lg p-3 text-sm"
            style={{
              background: 'rgba(4, 120, 87, 0.08)',
              border: '1px solid rgba(4, 120, 87, 0.20)',
              color: 'var(--color-success)',
            }}
          >
            <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
            <span>A new code is on its way.</span>
          </div>
        )}

        <div>
          <label htmlFor="code" className="block text-sm mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
            Verification code
          </label>
          <div className="relative">
            <MailCheck size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-muted)' }} />
            <input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              autoFocus
              maxLength={6}
              pattern="\d{6}"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className="input pl-10 tracking-[0.4em] text-center text-lg"
              placeholder="000000"
            />
          </div>
        </div>

        <button type="submit" disabled={isLoading || code.length !== 6} className="btn-primary w-full">
          {isLoading ? <Loader2 size={18} className="animate-spin" /> : 'Verify Email'}
        </button>

        <div className="text-center text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          Didn't receive the code?{' '}
          <button
            type="button"
            onClick={onResend}
            disabled={resending || cooldown > 0}
            className="font-medium"
            style={{
              color: cooldown > 0 ? 'var(--color-text-muted)' : 'var(--color-accent)',
            }}
          >
            {cooldown > 0 ? `Resend in ${cooldown}s` : resending ? 'Sending…' : 'Resend code'}
          </button>
        </div>
      </form>
    </div>
  );
}
