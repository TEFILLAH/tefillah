import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';

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
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

/**
 * Open the Google sign-in popup and return the Google ID token, which the
 * backend (`POST /auth/social`) verifies against the project's web client ID.
 */
export async function signInWithGoogle(): Promise<string> {
  const result = await signInWithPopup(auth, googleProvider);
  return await result.user.getIdToken();
}
