import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Trash2 } from 'lucide-react';
import Logo from '../components/Logo';
import { authAPI } from '../api/client';
import { storage } from '../lib/storage';
import { useAuthStore } from '../store/authStore';

/**
 * Public account + data deletion page (tefillah.in/delete-account).
 *
 * Required by Google Play: a web URL where users can request deletion of their
 * account and data, reachable WITHOUT the app. Signed-in users can delete
 * directly here; everyone else gets the steps + a sign-in link.
 */
export default function DeleteAccountPage() {
  const navigate = useNavigate();
  const loggedIn = !!storage.getToken();
  const logout = useAuthStore((s) => s.logout);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      await authAPI.deleteAccount();
      logout();
      navigate('/', { replace: true });
    } catch {
      setError('Could not delete your account. Please try again, or email admin@tefillah.in.');
      setDeleting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-5 sm:px-6 lg:px-8 py-10 sm:py-16">
      <Link to="/" className="inline-flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
        <ArrowLeft size={14} /> Back to home
      </Link>

      <header className="mt-8 text-center anim-fade-up">
        <Logo size="md" />
        <h1 className="font-serif text-4xl sm:text-5xl mt-6">Delete your account</h1>
      </header>

      <div className="mt-8 surface-card p-6 sm:p-8 anim-fade-up delay-100">
        <p className="text-base leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
          Deleting your Tefillah account is permanent. We remove your profile (name, email, phone,
          location and photo), your device push tokens, and your notifications. Prayer requests you
          submitted are stripped of your identity. <strong style={{ color: 'var(--color-text)' }}>This cannot be undone.</strong>
        </p>

        <h2 className="font-serif text-xl mt-6">How to delete</h2>
        <ul className="mt-3 space-y-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          <li>• In the app or website: open <strong>Menu → Profile Settings → Delete account</strong>.</li>
          <li>• Or use the button below after signing in.</li>
          <li>• Need help? Email <a href="mailto:admin@tefillah.in" style={{ color: 'var(--color-accent)' }}>admin@tefillah.in</a>.</li>
        </ul>

        {error && <p className="mt-4 text-sm" style={{ color: 'var(--color-error)' }}>{error}</p>}

        <div className="mt-6 pt-6 border-t" style={{ borderColor: 'var(--color-border)' }}>
          {loggedIn ? (
            <>
              <p className="text-sm mb-3">Type <strong>DELETE</strong> to permanently delete the account you're signed in to:</p>
              <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} className="input" placeholder="DELETE" />
              <button
                type="button"
                onClick={onDelete}
                disabled={confirmText.trim().toUpperCase() !== 'DELETE' || deleting}
                className="mt-3 w-full inline-flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-semibold"
                style={{ background: 'var(--color-error)', color: '#fff', opacity: confirmText.trim().toUpperCase() !== 'DELETE' || deleting ? 0.5 : 1 }}
              >
                {deleting ? <Loader2 size={16} className="animate-spin" /> : <><Trash2 size={16} /> Permanently delete my account</>}
              </button>
            </>
          ) : (
            <Link to="/login" className="btn-primary w-full">Sign in to delete your account</Link>
          )}
        </div>
      </div>
    </div>
  );
}
