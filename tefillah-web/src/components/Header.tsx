import { Link, NavLink, useNavigate } from 'react-router-dom';
import { ArrowLeftRight, Loader2, LogOut, Menu as MenuIcon, X } from 'lucide-react';
import { useState } from 'react';
import Logo from './Logo';
import ThemeToggle from './ThemeToggle';
import { useAuthStore } from '../store/authStore';

interface HeaderProps {
  variant?: 'public' | 'app';
  hideNav?: boolean;
}

const APP_NAV: { label: string; to: string }[] = [
  { label: 'Menu', to: '/menu' },
  { label: 'Home', to: '/home' },
  { label: 'Pray', to: '/prayer' },
];

const PARTNER_NAV: { label: string; to: string }[] = [
  { label: 'Dashboard', to: '/partner/dashboard' },
];

const PUBLIC_NAV: { label: string; to: string }[] = [
  { label: 'About', to: '/about' },
  { label: 'For Partners', to: '/partner/login' },
  { label: 'Privacy Policy', to: '/privacy' },
  { label: 'Terms and Conditions', to: '/terms' },
];

export default function Header({ variant = 'public', hideNav = false }: HeaderProps) {
  const navigate = useNavigate();
  const { token, userType, canSwitch, switchTarget, switchAccount, logout } = useAuthStore();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);

  const handleSignOut = () => {
    setOpen(false);
    logout();
    navigate('/', { replace: true });
  };

  const handleSwitch = async () => {
    if (switching) return;
    setSwitching(true);
    try {
      const type = await switchAccount();
      setOpen(false);
      navigate(type === 'partner' ? '/partner/dashboard' : '/home', { replace: true });
    } catch {
      /* surfaced via store error */
    } finally {
      setSwitching(false);
    }
  };

  const switchLabel = switchTarget === 'partner' ? 'Switch to Partner' : 'Switch to User';

  const nav =
    variant === 'app'
      ? userType === 'partner'
        ? PARTNER_NAV
        : APP_NAV
      : PUBLIC_NAV;

  return (
    <header
      className="sticky top-0 z-40 backdrop-blur-md border-b"
      style={{
        background: 'color-mix(in srgb, var(--color-bg) 80%, transparent)',
        borderColor: 'var(--color-border)',
      }}
    >
      <div className="mx-auto max-w-6xl flex items-center justify-between gap-4 px-4 sm:px-6 lg:px-8 h-16">
        <Link to={token ? (userType === 'partner' ? '/partner/dashboard' : '/home') : '/'} className="flex items-center gap-3">
          <Logo size="sm" />
          <span className="font-serif text-xl tracking-[0.18em] hidden sm:inline">Tefillah</span>
        </Link>

        {!hideNav && (
          <nav className="hidden md:flex items-center gap-1">
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive ? 'text-[color:var(--color-accent)]' : ''
                  }`
                }
                style={({ isActive }) => ({
                  color: isActive ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                })}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        )}

        <div className="hidden md:flex items-center gap-2">
          {token && canSwitch && (
            <button onClick={handleSwitch} disabled={switching} className="btn-ghost text-xs" title={switchLabel} style={{ padding: '0.4rem 0.7rem' }}>
              {switching ? <Loader2 size={14} className="animate-spin" /> : <ArrowLeftRight size={14} />}
              {switchLabel}
            </button>
          )}
          <ThemeToggle size="sm" />
          {!token && (
            <>
              <Link to="/login" className="btn-ghost text-sm">Sign in</Link>
              <Link to="/signup" className="btn-primary text-sm">Begin</Link>
            </>
          )}
          {token && (
            <button
              onClick={handleSignOut}
              className="btn-ghost text-xs"
              title="Sign out"
              style={{ color: 'var(--color-error)', padding: '0.4rem 0.7rem' }}
            >
              <LogOut size={14} /> Sign out
            </button>
          )}
        </div>

        {/* Mobile burger */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? 'Close menu' : 'Open menu'}
          className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-full"
          style={{ background: 'var(--color-bg-elev)', border: '1px solid var(--color-border-strong)' }}
        >
          {open ? <X size={18} /> : <MenuIcon size={18} />}
        </button>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div
          className="md:hidden border-t"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-elev)' }}
        >
          <div className="px-4 py-3 flex flex-col gap-1">
            {!hideNav &&
              nav.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setOpen(false)}
                  className="px-3 py-2 rounded-md text-base font-medium"
                  style={({ isActive }) => ({
                    color: isActive ? 'var(--color-accent)' : 'var(--color-text)',
                    background: isActive ? 'var(--color-surface)' : 'transparent',
                  })}
                >
                  {item.label}
                </NavLink>
              ))}
            {token && canSwitch && (
              <button
                onClick={handleSwitch}
                disabled={switching}
                className="px-3 py-2 rounded-md text-base font-medium flex items-center gap-2"
                style={{ color: 'var(--color-accent)' }}
              >
                {switching ? <Loader2 size={16} className="animate-spin" /> : <ArrowLeftRight size={16} />}
                {switchLabel}
              </button>
            )}
            <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
              <ThemeToggle size="sm" />
              {!token ? (
                <div className="flex gap-2 flex-1">
                  <Link to="/login" className="btn-ghost text-sm flex-1" onClick={() => setOpen(false)}>Sign in</Link>
                  <Link to="/signup" className="btn-primary text-sm flex-1" onClick={() => setOpen(false)}>Begin</Link>
                </div>
              ) : (
                <button
                  onClick={handleSignOut}
                  className="btn-ghost text-sm inline-flex items-center gap-2"
                  style={{ color: 'var(--color-error)' }}
                >
                  <LogOut size={16} /> Sign out
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
