import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { socialSignIn } from '../lib/socialAuth';

/**
 * Web Google sign-in via Google Identity Services (GIS).
 *
 * GIS returns a Google ID token directly in the browser — no OAuth client
 * secret and no Firebase auth handler involved (which is what was failing).
 * The token goes to POST /auth/social, where the backend verifies it against
 * GOOGLE_WEB_CLIENT_ID. The only console requirement is that the OAuth Web
 * client lists this site under "Authorized JavaScript origins".
 */

const CLIENT_ID = (import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID as string | undefined)?.trim() || '';
const GSI_SRC = 'https://accounts.google.com/gsi/client';

type GsiText = 'continue_with' | 'signin_with' | 'signup_with';

interface GsiWindow {
  google?: {
    accounts: {
      id: {
        initialize: (cfg: {
          client_id: string;
          callback: (resp: { credential?: string }) => void;
          ux_mode?: 'popup' | 'redirect';
        }) => void;
        renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void;
      };
    };
  };
}

function loadGsi(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as unknown as GsiWindow).google?.accounts?.id) return resolve();
    const existing = document.querySelector(`script[src="${GSI_SRC}"]`) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('GSI failed to load')));
      return;
    }
    const s = document.createElement('script');
    s.src = GSI_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('GSI failed to load'));
    document.head.appendChild(s);
  });
}

export default function GoogleSignInButton({ text = 'continue_with' }: { text?: GsiText }) {
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const handleCredential = async (resp: { credential?: string }) => {
      if (!resp?.credential) return;
      setBusy(true);
      setError(null);
      try {
        const r = await socialSignIn(resp.credential);
        if (cancelled) return;
        if (r.next === 'complete-profile') {
          const q = new URLSearchParams({ email: r.email ?? '', name: r.name ?? '', agent: r.isAgent ? '1' : '0' });
          navigate(`/complete-profile?${q.toString()}`, { replace: true });
        } else if (r.next === 'verify') {
          navigate('/verify', { replace: true });
        } else if (r.next === 'partner') {
          navigate('/partner/dashboard', { replace: true });
        } else {
          navigate('/home', { replace: true });
        }
      } catch (err) {
        const e = err as { response?: { data?: { detail?: string } } };
        setError(e?.response?.data?.detail ?? 'Google sign-in failed. Please use email sign-in.');
      } finally {
        if (!cancelled) setBusy(false);
      }
    };

    if (!CLIENT_ID) {
      setError('Google sign-in is not configured.');
      return;
    }

    loadGsi()
      .then(() => {
        const gsi = (window as unknown as GsiWindow).google?.accounts?.id;
        if (cancelled || !ref.current || !gsi) return;
        gsi.initialize({ client_id: CLIENT_ID, callback: handleCredential, ux_mode: 'popup' });
        ref.current.innerHTML = '';
        const width = Math.min(400, Math.max(240, ref.current.clientWidth || 320));
        gsi.renderButton(ref.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text,
          shape: 'pill',
          logo_alignment: 'center',
          width,
        });
      })
      .catch(() => {
        if (!cancelled) setError('Could not load Google sign-in. Please use email sign-in.');
      });

    return () => {
      cancelled = true;
    };
  }, [navigate, text]);

  return (
    <div>
      <div ref={ref} className="flex justify-center" style={{ minHeight: 44 }} aria-busy={busy} />
      {busy && (
        <p className="mt-2 text-xs text-center inline-flex items-center justify-center gap-1.5 w-full" style={{ color: 'var(--color-text-muted)' }}>
          <Loader2 size={12} className="animate-spin" /> Signing you in…
        </p>
      )}
      {error && (
        <p className="mt-2 text-xs text-center" style={{ color: 'var(--color-error)' }}>
          {error}
        </p>
      )}
    </div>
  );
}
