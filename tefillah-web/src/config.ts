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
