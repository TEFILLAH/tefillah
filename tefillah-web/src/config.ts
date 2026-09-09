/**
 * Web feature flags.
 *
 * GOOGLE_SIGNIN_ENABLED — gates the Google sign-in button on the web. Now ON:
 * the web uses Google Identity Services (see GoogleSignInButton.tsx), which
 * returns a Google ID token client-side — no Firebase OAuth client secret
 * involved (that was the broken piece). The only remaining requirement is a
 * console setting: the OAuth Web client (VITE_GOOGLE_WEB_CLIENT_ID) must list
 * this site under "Authorized JavaScript origins" in Google Cloud Console.
 */
export const GOOGLE_SIGNIN_ENABLED = true;

/**
 * APPLE_SIGNIN_ENABLED — gates the Apple sign-in button on the web.
 *
 * Shipping this button before the whole chain works would put a prominent,
 * brand-marked control on the login page that CANNOT work — users click it,
 * get told to go away, and some bounce instead of signing up.
 *
 * As of 2026-09-08 the prerequisites are DONE and verified:
 *   - Apple App ID + Service ID (com.tefilah.app.web) configured
 *   - .p8 key D72A2BMF4H created, bound to KY52RZ3ZFK.com.tefilah.app
 *   - Firebase Apple provider ENABLED
 *   - tefillah.in + www.tefillah.in in Firebase authorised domains
 *   - live CloudFront CSP allows identitytoolkit / securetoken and
 *     frame-src tefillah-2283c.firebaseapp.com
 *
 * ENABLED 2026-09-09. ONE THING REMAINS UNPROVEN — watch it on the first real
 * sign-in. The backend REFUSES any social token whose email the provider did
 * not verify (that gap was an account-takeover hole: see the guard in
 * social_auth). The web Apple flow reaches that guard as a *Firebase* ID
 * token, so it only works if Firebase reports emailVerified=true for an Apple
 * sign-in. That is the documented behaviour and Apple does verify its
 * addresses, but it has not been exercised end to end with a real Apple ID.
 *
 * If a real sign-in returns 401, the backend log says exactly which provider
 * was refused ("Social auth REFUSED: provider ... did not verify the email
 * address") — that is THIS case, not a broken key or a bad .p8. Fix it at that
 * provider path; do NOT weaken the guard for everyone, which would reopen the
 * takeover. Setting this back to false is the safe instant rollback.
 *
 * Mobile is unaffected either way: it verifies Apple tokens directly against
 * Apple's JWKS and never goes through Firebase.
 */
export const APPLE_SIGNIN_ENABLED = true;
