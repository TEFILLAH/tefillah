import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, HeartHandshake, Loader2, Lock, Mail } from 'lucide-react';
import PasswordInput from '../components/PasswordInput';
import Logo from '../components/Logo';
import { useAuthStore } from '../store/authStore';

export default function PartnerLoginPage() {
  const navigate = useNavigate();
  const { loginAsPartner, isLoading, error, clearError } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    clearError();
    try {
      await loginAsPartner(email.trim().toLowerCase(), password);
      navigate('/partner/dashboard', { replace: true });
    } catch {
      // error in store
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 sm:px-6 py-12 sm:py-20">
      <div className="text-center anim-fade-up">
        <Logo size="md" />
        <p className="eyebrow mt-6 inline-flex items-center gap-2"><HeartHandshake size={14} /> Prayer Partner</p>
        <h1 className="font-serif text-3xl sm:text-4xl mt-3">Welcome Back</h1>
        <p className="mt-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          Sign in to view and pray for assigned requests
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
          <label className="block text-sm mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>Email Address</label>
          <div className="relative">
            <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-muted)' }} />
            <input
              type="email"
              required
              autoFocus
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input pl-10"
              placeholder="your@email.com"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>Password</label>
          <div className="relative">
            <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 z-10" style={{ color: 'var(--color-text-muted)' }} />
            <PasswordInput
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input pl-10"
              placeholder="Enter your password"
            />
          </div>
        </div>

        <button type="submit" disabled={isLoading} className="btn-primary w-full">
          {isLoading ? <Loader2 size={18} className="animate-spin" /> : 'Sign In as Partner'}
        </button>

        <p className="text-center text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          Not a partner yet?{' '}
          <Link to="/partner/signup" className="font-medium" style={{ color: 'var(--color-accent)' }}>
            Become One
          </Link>
        </p>
      </form>

      <div className="mt-8 text-center">
        <span className="divider-rule">or</span>
        <div className="mt-3">
          <Link to="/login" className="btn-ghost text-sm">Sign In as a user</Link>
        </div>
      </div>
    </div>
  );
}
