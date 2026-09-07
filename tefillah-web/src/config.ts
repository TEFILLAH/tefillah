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
 * APPLE_SIGNIN_ENABLED — gates the Apple sign-in button on the web. Currently
 * OFF, because the Firebase console does NOT yet have the Apple provider
 * enabled: that needs an Apple Service ID (com.tefilah.app.web) plus a .p8
 * signing key, and until both exist every click fails with
 * auth/operation-not-allowed.
 *
 * Shipping the button before then would put a prominent, brand-marked control
 * on the login page that CANNOT work — users click it, get told to go away,
 * and some of them bounce instead of signing up. Flip this to true in the same
 * change that enables the provider. Before flipping, also confirm the live
 * CloudFront CSP allows identitytoolkit.googleapis.com and
 * securetoken.googleapis.com, or the popup will fail for a different reason.
 */
export const APPLE_SIGNIN_ENABLED = false;
