import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Loader2, Lock, Mail } from 'lucide-react';
import { useAdminAuth } from './adminAuth';
import AdminLogo from './AdminLogo';

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const { login, isLoading, error, clearError, token, isInitialized, initialize } = useAdminAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (!isInitialized) initialize();
  }, [isInitialized, initialize]);

  // Already signed in → go straight to the dashboard.
  useEffect(() => {
    if (isInitialized && token) navigate('/admin', { replace: true });
  }, [isInitialized, token, navigate]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    clearError();
    try {
      await login(email, password);
      navigate('/admin', { replace: true });
    } catch {
      /* error shown from store */
    }
  };

  return (
    <div className="admin-root min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Ambient floating orbs */}
      <span
        aria-hidden
        className="absolute rounded-full pointer-events-none"
        style={{ width: 340, height: 340, top: '-6rem', left: '-6rem', background: 'radial-gradient(circle, rgba(229,185,61,0.16), transparent 70%)', filter: 'blur(8px)' }}
      />
      <span
        aria-hidden
        className="absolute rounded-full pointer-events-none"
        style={{ width: 300, height: 300, bottom: '-5rem', right: '-4rem', background: 'radial-gradient(circle, rgba(122,90,248,0.14), transparent 70%)', filter: 'blur(8px)' }}
      />

      <div className="w-full max-w-md relative admin-fade-up">
        {/* Brand */}
        <div className="flex flex-col items-center text-center mb-8">
          <AdminLogo size={78} />
          <h1 className="text-3xl font-light tracking-[0.3em] text-white font-serif mt-5">Tefillah</h1>
          <p className="text-[11px] tracking-[0.32em] uppercase mt-2 admin-grad-gold font-semibold">Admin Console</p>
        </div>

        {/* Card */}
        <div className="admin-hero p-8">
          <div className="relative">
            <h2 className="text-lg font-semibold text-white mb-1">Sign in</h2>
            <p className="text-[13px] text-[color:var(--t3)] mb-6">Enter your administrator credentials to continue.</p>

            {error && (
              <div
                className="flex items-center gap-2 rounded-lg p-3 mb-4"
                style={{ background: 'rgba(251,113,133,0.08)', border: '1px solid rgba(251,113,133,0.24)' }}
              >
                <AlertCircle className="w-4 h-4 shrink-0" style={{ color: 'var(--rose)' }} />
                <p className="text-sm" style={{ color: 'var(--rose)' }}>{error}</p>
              </div>
            )}

            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label htmlFor="admin-email" className="block text-xs uppercase tracking-wider text-[color:var(--t3)] mb-1.5">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--t3)' }} />
                  <input
                    id="admin-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="admin-input"
                    placeholder="admin@tefillah.in"
                    required
                    autoComplete="email"
                    autoFocus
                  />
                </div>
              </div>

              <div>
                <label htmlFor="admin-password" className="block text-xs uppercase tracking-wider text-[color:var(--t3)] mb-1.5">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--t3)' }} />
                  <input
                    id="admin-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="admin-input"
                    placeholder="Enter your password"
                    required
                    autoComplete="current-password"
                  />
                </div>
              </div>

              <button type="submit" disabled={isLoading} className="admin-btn admin-btn-primary w-full py-2.5">
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Sign In'}
              </button>
            </form>
          </div>
        </div>

        <p className="flex items-center justify-center gap-2 text-center text-xs text-[color:var(--t3)] mt-6">
          <span className="admin-dot" style={{ color: 'var(--emerald)', background: 'var(--emerald)' }} />
          Authorized personnel only · all actions are logged
        </p>
      </div>
    </div>
  );
}
