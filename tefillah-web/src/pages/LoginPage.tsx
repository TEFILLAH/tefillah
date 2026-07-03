import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, Loader2, Lock, Mail } from 'lucide-react';
import Logo from '../components/Logo';
import GoogleSignInButton from '../components/GoogleSignInButton';
import PasswordInput from '../components/PasswordInput';
import { GOOGLE_SIGNIN_ENABLED } from '../config';
import { useAuthStore } from '../store/authStore';

export default function LoginPage() {
  const navigate = useNavigate();
  const { loginAsUser, isLoading, error, clearError } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    clearError();
    try {
      const type = await loginAsUser(email.trim().toLowerCase(), password);
      if (type === 'partner') {
        navigate('/partner/dashboard', { replace: true });
      } else {
        navigate('/home', { replace: true });
      }
    } catch {
      // error is set on the store
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 sm:px-6 py-12 sm:py-20">
      <div className="text-center anim-fade-up">
        <Logo size="md" />
        <h1 className="font-serif text-3xl sm:text-4xl mt-6">Welcome Back</h1>
        <p className="mt-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          Sign in to continue your prayer journey
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

        <div>
          <label htmlFor="email" className="block text-sm mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
            Email Address
          </label>
          <div className="relative">
            <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-muted)' }} />
            <input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input pl-10"
              placeholder="your@email.com"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor="password" className="block text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              Password
            </label>
            <Link to="/forgot-password" className="text-xs" style={{ color: 'var(--color-accent)' }}>
              Forgot Password?
            </Link>
          </div>
          <div className="relative">
            <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 z-10" style={{ color: 'var(--color-text-muted)' }} />
            <PasswordInput
              id="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input pl-10"
              placeholder="Enter your password"
            />
          </div>
        </div>

        <button type="submit" disabled={isLoading} className="btn-primary w-full">
          {isLoading ? <Loader2 size={18} className="animate-spin" /> : 'Sign In'}
        </button>

        {GOOGLE_SIGNIN_ENABLED && (
          <>
            <div className="text-center">
              <span className="divider-rule text-xs" style={{ color: 'var(--color-text-muted)' }}>or</span>
            </div>
            <GoogleSignInButton />
          </>
        )}

        <p className="text-center text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          Don't have an account?{' '}
          <Link to="/signup" className="font-medium" style={{ color: 'var(--color-accent)' }}>
            Create Account
          </Link>
        </p>
      </form>

      <div className="mt-8 text-center">
        <span className="divider-rule">Are you a partner?</span>
        <div className="mt-3">
          <Link to="/partner/login" className="btn-ghost text-sm">Sign In as a partner</Link>
        </div>
      </div>
    </div>
  );
}
