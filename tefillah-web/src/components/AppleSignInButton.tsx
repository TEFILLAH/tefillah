import { useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { authErrorCode, signInWithApple } from '../lib/firebase';
import { socialRedirectPath, socialSignIn, apiErrorMessage } from '../lib/socialAuth';
import { useThemeStore } from '../store/themeStore';
import type { GsiText } from './GoogleSignInButton';

/**
 * Sign in with Apple, via Firebase's Apple provider (see lib/firebase.ts).
 *
 * The popup returns a Firebase ID token, which goes to the same POST /auth/social
 * as Google — the backend verifies it provider-agnostically, so nothing changed
 * server-side.
 *
 * Sizing deliberately matches the Google (GIS) button rendered beside it: 40px
 * tall, pill shaped, same 240–400px width clamp. Apple requires its button to be
 * no less prominent than the other sign-in options. Colours follow Apple's HIG —
 * black on light backgrounds, white on dark.
 *
 * The typeface does NOT match and can't: GIS renders in an iframe-injected font
 * of Google's choosing, while this button inherits the app's Inter. Only the box
 * is matched.
 */

const LABEL: Record<GsiText, string> = {
  continue_with: 'Continue with Apple',
  signin_with: 'Sign in with Apple',
  signup_with: 'Sign up with Apple',
};

export default function AppleSignInButton({ text = 'continue_with' }: { text?: GsiText }) {
  const navigate = useNavigate();
  const { theme } = useThemeStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set once Firebase says the provider isn't enabled: clicking again can only
  // fail the same way, so the button stops inviting the attempt.
  const [unavailable, setUnavailable] = useState(false);

  const onClick = async () => {
    setBusy(true);
    setError(null);
    try {
      const apple = await signInWithApple();
      if (!apple) return; // popup closed by the user — a cancel is never an error
      const r = await socialSignIn(apple.idToken, 'apple', apple.displayName ?? undefined);
      navigate(socialRedirectPath(r), { replace: true });
    } catch (err) {
      const code = authErrorCode(err);
      if (code === 'auth/operation-not-allowed') {
        // The Apple provider still needs an Apple Service ID + .p8 key in the
        // Firebase console. Until that lands every attempt lands here, so say
        // "not yet" instead of surfacing a raw auth error.
        setUnavailable(true);
        setError('Apple sign-in is coming soon. Please use Google or email sign-in for now.');
      } else if (code === 'auth/popup-blocked') {
        setError('Your browser blocked the Apple sign-in window. Allow pop-ups and try again.');
      } else if (code === 'auth/account-exists-with-different-credential') {
        // Firebase's default "one account per email address" setting: this email
        // was first seen through Google, so Apple can't claim it.
        setError('This email already signs in with Google. Please continue with Google.');
      } else if (code === 'auth/unauthorized-domain') {
        // This exact error already bit the Google web flow once: the site's
        // domain must be listed under Firebase Auth > Settings > Authorized
        // domains. Without this branch it fell into the generic message below
        // and looked like a random flake, with nothing for the owner to act on.
        setUnavailable(true);
        setError('Apple sign-in is not available on this site yet. Please use Google or email sign-in.');
        console.error(
          '[AppleSignIn] auth/unauthorized-domain — add this origin to Firebase Auth > Settings > Authorized domains:',
          window.location.origin,
        );
      } else if (code === 'auth/network-request-failed') {
        // Transient: must NOT be reported as a permanent "use email instead".
        setError('Network problem reaching Apple. Please check your connection and try again.');
      } else {
        setError(apiErrorMessage(err, 'Apple sign-in failed. Please use email sign-in.'));
      }
    } finally {
      setBusy(false);
    }
  };

  const isDark = theme === 'dark';
  const idle = !busy && !unavailable;

  // Match the Google button's width EXACTLY by running the same formula on the
  // same container. GIS is handed a fixed pixel width computed once at mount
  // (GoogleSignInButton: Math.min(400, Math.max(240, clientWidth || 320))), so
  // a hardcoded width here only lines up at one viewport — at 900px wide the
  // Google pill came out visibly longer than a fixed-240 Apple pill. Measuring
  // the same way means both land on the same number from the same card, and
  // both go equally stale on a resize-without-reload.
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number>(240);
  useLayoutEffect(() => {
    if (boxRef.current) {
      setWidth(Math.min(400, Math.max(240, boxRef.current.clientWidth || 320)));
    }
  }, []);

  return (
    <div>
      {/* The 40px button sits in a 44px row because GoogleSignInButton's GIS
          container reserves minHeight:44 while the GIS button itself renders at
          40 (size:'large'). Matching only the button left the two stacked rows
          4px apart. Centring here keeps the buttons the same size AND the rows
          the same height.

          Known remaining difference: GIS is handed a FIXED pixel width measured
          once at mount, while this button is w-full within the same 240-400
          clamp. They agree at any given viewport, and diverge only if the window
          is resized without a reload — which corrects itself on the next load. */}
      <div ref={boxRef} className="flex justify-center" style={{ minHeight: 44 }}>
      <button
        type="button"
        onClick={onClick}
        disabled={busy || unavailable}
        aria-busy={busy}
        className="mx-auto flex items-center justify-center gap-2 hover:opacity-90 self-center"
        style={{
          // MEASURED against the real GIS button rendered beside this one, not
          // taken from its docs: size:'large' comes out 44 tall, not 40.
          // Re-check on /login with both buttons enabled:
          //   [...document.querySelectorAll('div')]
          //     .filter(d => getComputedStyle(d).minHeight === '44px')
          //     .map(d => d.firstElementChild.getBoundingClientRect())
          height: 44,
          width,
          maxWidth: '100%', // never overflow a narrow card
          borderRadius: 9999, // GIS shape: 'pill'
          background: isDark ? '#ffffff' : '#000000',
          color: isDark ? '#000000' : '#ffffff',
          fontSize: 14,
          fontWeight: 500,
          cursor: idle ? 'pointer' : 'default',
          // Left unset while idle so hover:opacity-90 isn't out-specified by an
          // inline value. Same 0.9 / 0.55 pair .btn-primary uses.
          opacity: idle ? undefined : 0.55,
          transition: 'opacity 0.15s ease',
        }}
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : <AppleLogo />}
        {LABEL[text]}
      </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs text-center" style={{ color: 'var(--color-error)' }}>
          {error}
        </p>
      )}
    </div>
  );
}

// Apple's mark, drawn in currentColor so it flips with the button's theme.
function AppleLogo() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16.365 1.43c0 1.14-.417 2.2-1.25 3.02-.87.86-1.9 1.36-3.02 1.27-.02-1.1.42-2.2 1.24-3.02.87-.87 2.03-1.35 3.03-1.27zM20.9 17.1c-.5 1.16-.74 1.68-1.38 2.7-.9 1.43-2.16 3.2-3.73 3.22-1.4.01-1.75-.9-3.64-.9-1.9 0-2.29.88-3.68.9-1.57.03-2.77-1.57-3.67-3-2.52-4-2.78-8.7-1.23-11.2 1.1-1.77 2.85-2.8 4.5-2.8 1.67 0 2.72.9 4.1.9 1.34 0 2.16-.9 4.1-.9 1.46 0 3.02.8 4.13 2.17-3.63 1.99-3.04 7.17.5 8.91z" />
    </svg>
  );
}
