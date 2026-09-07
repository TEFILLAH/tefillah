import { initializeApp } from 'firebase/app';
import { getAuth, OAuthProvider, signInWithPopup } from 'firebase/auth';

// Firebase WEB config for project tefillah-2283c. These are public client-side
// identifiers (not secrets) — the same values the mobile app ships with.
export const firebaseConfig = {
  apiKey: 'AIzaSyBbPEpfgLtCMk07KzXNy9Y_S_0124rLRVU',
  authDomain: 'tefillah-2283c.firebaseapp.com',
  projectId: 'tefillah-2283c',
  storageBucket: 'tefillah-2283c.firebasestorage.app',
  messagingSenderId: '240620097116',
  appId: '1:240620097116:web:b205d0acfbfdf5a8daa099',
};

export const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Google sign-in does NOT go through Firebase — GoogleSignInButton uses Google
// Identity Services directly (see the comment at the top of that file).
//
// Sign in with Apple rides Firebase's generic OAuth provider — the scopes below
// are what Apple lists on its consent sheet.
const appleProvider = new OAuthProvider('apple.com');
appleProvider.addScope('email');
appleProvider.addScope('name');

// Popup codes that mean "the user backed out", not "something broke".
const CANCEL_CODES = ['auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/user-cancelled'];

/**
 * The `auth/…` code off a thrown Firebase error, or '' for anything else
 * (a network failure, an axios error from our own API, …).
 */
export function authErrorCode(err: unknown): string {
  return typeof err === 'object' && err !== null && 'code' in err
    ? String((err as { code: unknown }).code)
    : '';
}

/**
 * Open the Sign in with Apple popup.
 *
 * Returns a FIREBASE ID token (not Apple's own identity token): the backend's
 * `POST /auth/social` verifies it with Firebase's accounts:lookup, which is
 * provider-agnostic, so nothing server-side had to change for Apple on the web.
 *
 * `displayName` only arrives on the user's FIRST authorization — Apple releases
 * the name once and never puts it in the token, so later sign-ins return null
 * here and the backend keeps the name it already stored.
 *
 * null means the user closed the popup. Anything else throws, and callers map
 * the error code to a message — notably `auth/operation-not-allowed`, which is
 * what Firebase says while the Apple provider is still disabled in the console.
 */
export async function signInWithApple(): Promise<{ idToken: string; displayName: string | null } | null> {
  try {
    const result = await signInWithPopup(auth, appleProvider);
    return { idToken: await result.user.getIdToken(), displayName: result.user.displayName };
  } catch (err) {
    if (CANCEL_CODES.includes(authErrorCode(err))) return null;
    throw err;
  }
}
