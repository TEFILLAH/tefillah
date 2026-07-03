import { Platform } from 'react-native';

// Firebase web-only configuration (used only for the web popup flow)
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || '',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || '',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || '',
};

// Google OAuth Web Client ID — required by the native SDK so the returned
// ID token is signed for our backend audience. The same ID also lives in
// the Firebase Console > Authentication > Sign-in method > Google.
//
// HARDCODED FALLBACK: the same value that lives in .env. Web Client IDs are
// inherently public (they're visible in every OAuth URL), so baking the
// Firebase project's Web Client ID into the bundle here is not a secret leak.
// This guarantees Google Sign-In works even if EAS Build fails to load .env.
const GOOGLE_WEB_CLIENT_ID_FALLBACK =
  '240620097116-cmjhfmtkkg14gpjv3919imj9l24hm7a1.apps.googleusercontent.com';
const GOOGLE_WEB_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || GOOGLE_WEB_CLIENT_ID_FALLBACK;

const isConfigured = !!firebaseConfig.apiKey && !!firebaseConfig.projectId;
const isNative = Platform.OS !== 'web';

let app: any = null;
let auth: any = null;
let googleProvider: any = null;

// Initialize Firebase web SDK on web only
if (isConfigured && !isNative) {
  try {
    const { initializeApp } = require('firebase/app');
    const { getAuth, GoogleAuthProvider } = require('firebase/auth');
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    googleProvider = new GoogleAuthProvider();
  } catch (e) {
    if (__DEV__) console.error('Firebase web init error:', e);
  }
}

// Native Google Sign-In SDK configuration — runs once on module load.
// This is the SAME flow used previously; the previous session's switch to a
// browser-based expo-auth-session flow was reverted in favour of this
// native, in-app experience.
let nativeGoogleConfigured = false;
let GoogleSigninRef: any = null;
let statusCodesRef: any = null;

if (isNative) {
  try {
    const mod = require('@react-native-google-signin/google-signin');
    GoogleSigninRef = mod.GoogleSignin;
    statusCodesRef = mod.statusCodes;
    GoogleSigninRef.configure({
      webClientId: GOOGLE_WEB_CLIENT_ID,
      offlineAccess: false,
      forceCodeForRefreshToken: false,
    });
    nativeGoogleConfigured = true;
  } catch (e) {
    if (__DEV__) console.error('Native Google Sign-In init error:', e);
  }
}

export const isFirebaseConfigured = () => {
  if (isNative) {
    // Native flow needs the Web Client ID and the SDK module loaded
    return !!GOOGLE_WEB_CLIENT_ID && nativeGoogleConfigured;
  }
  return isConfigured;
};

/**
 * Sign in with Google.
 * - Web: Firebase popup (unchanged)
 * - Native: In-app Google account picker via
 *   @react-native-google-signin/google-signin. The SDK handles the Google
 *   account picker, returns a Google ID token, and the backend
 *   (`verify_firebase_token` -> Google tokeninfo endpoint) validates it.
 *
 * Returns a Google ID token, or null if the user cancelled.
 */
export const signInWithGoogle = async (): Promise<string | null> => {
  if (!GOOGLE_WEB_CLIENT_ID) {
    throw new Error(
      'Google Sign-In is not configured. Please contact support.'
    );
  }

  if (!isNative) {
    // Web flow — Firebase popup
    if (!auth || !googleProvider) {
      throw new Error('Firebase web SDK is not initialized.');
    }
    const { signInWithPopup } = require('firebase/auth');
    const result = await signInWithPopup(auth, googleProvider);
    return await result.user.getIdToken();
  }

  // Native flow — in-app account picker
  if (!nativeGoogleConfigured || !GoogleSigninRef) {
    throw new Error(
      'Google Sign-In is not available. Please reinstall the app.'
    );
  }

  try {
    await GoogleSigninRef.hasPlayServices({ showPlayServicesUpdateDialog: true });

    // Ensure a clean state — fixes "developer error" edge cases where a prior
    // aborted sign-in leaves the SDK in a half-authenticated state.
    try {
      await GoogleSigninRef.signOut();
    } catch {
      // ignore — no prior session
    }

    const result = await GoogleSigninRef.signIn();

    // The SDK's return shape changed between v13 and v16 — handle both.
    // v16+: { type: 'success', data: { idToken, user, ... } }
    // v13:  { idToken, user, ... }
    let idToken: string | null = null;
    if (result && typeof result === 'object') {
      if ((result as any).type === 'cancelled') return null;
      idToken =
        (result as any).idToken ||
        (result as any).data?.idToken ||
        null;
    }

    if (!idToken) {
      throw new Error('Google sign-in did not return an ID token.');
    }
    return idToken;
  } catch (error: any) {
    const code = error?.code;
    if (statusCodesRef) {
      if (code === statusCodesRef.SIGN_IN_CANCELLED) return null;
      if (code === statusCodesRef.IN_PROGRESS) {
        throw new Error('A sign-in is already in progress.');
      }
      if (code === statusCodesRef.PLAY_SERVICES_NOT_AVAILABLE) {
        throw new Error('Google Play Services are not available on this device.');
      }
    }
    // Generic cancellation strings that some devices use
    const msg = (error?.message || '').toLowerCase();
    if (msg.includes('cancel')) return null;
    throw new Error(error?.message || 'Google sign-in failed.');
  }
};

export { app, auth };
