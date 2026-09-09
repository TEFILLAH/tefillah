import { Platform } from 'react-native';
import { secureStorage } from './secureStorage';

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

// ==================== Sign in with Apple ====================
// iOS ONLY. expo-apple-authentication wraps ASAuthorization, which does not
// exist on Android or web, so the button must not even render there.
//
// Unlike Google, this token is NOT exchanged through Firebase: the backend
// verifies Apple's identity token directly against Apple's JWKS. That avoids
// bootstrapping Firebase Auth on native (it is initialised for web only above).
//
// Required by App Store Review Guideline 4.8 because we offer Google sign-in.
let AppleAuthRef: any = null;
if (isNative && Platform.OS === 'ios') {
  try {
    AppleAuthRef = require('expo-apple-authentication');
  } catch (e) {
    if (__DEV__) console.error('expo-apple-authentication init error:', e);
  }
}

/**
 * Apple's OWN button component, re-exported through this module's lazy require
 * so Android/web never touch the native module.
 *
 * Use this rather than a hand-rolled button: Apple's HIG requires the official
 * logo asset and one of their approved, Apple-localized titles ("Sign in with
 * Apple" / "Sign up with Apple" / "Continue with Apple"). A custom button with
 * an icon-font glyph and the bare word "Apple" — transliterated in hi/te — is a
 * trademark and guideline-4.8 risk on the exact button that exists to satisfy
 * guideline 4.8. The native control is compliant by construction.
 *
 * Null off iOS; always render behind isAppleSignInAvailable().
 */
export const AppleAuthButton = AppleAuthRef?.AppleAuthenticationButton ?? null;
export const AppleAuthButtonType = AppleAuthRef?.AppleAuthenticationButtonType ?? null;
export const AppleAuthButtonStyle = AppleAuthRef?.AppleAuthenticationButtonStyle ?? null;

export type AppleSignInResult = {
  /** Apple's identity token (an RS256 JWT). Sent to the backend verbatim. */
  identityToken: string;
  /**
   * Apple returns the user's name ONLY on the very first authorization and
   * NEVER inside the token. If we drop it here it is gone forever, and the
   * account ends up named after a private-relay email prefix. Null on every
   * subsequent sign-in, which is expected, not an error.
   */
  fullName: string | null;
  /**
   * Apple's one-time authorization code. The backend trades it for a refresh
   * token so the account can be REVOKED at deletion (App Store 5.1.1(v)) —
   * there is no second chance to get one. Unlike `fullName` a fresh code comes
   * back on EVERY sign-in, so forward it every time and never cache it: it is
   * single-use, expires in ~5 minutes, and must never be logged or stored.
   */
  authorizationCode: string | null;
};

/**
 * Apple hands over the user's name on the FIRST authorization only — every
 * retry returns null forever. If that first sign-in dies anywhere downstream
 * (network blip, 401, 429) the name is gone and the account ends up named
 * after a private-relay alias like `x7k2m9qp4t`. So stash it, keyed by Apple's
 * stable `user` id, and replay it on the retry. Best-effort throughout:
 * storage must never be able to break sign-in.
 */
const APPLE_NAME_KEY = 'apple_pending_full_name';

/** Call once /auth/social has accepted the name — see socialAuth.ts. */
export const clearAppleNameCache = async (): Promise<void> => {
  try {
    await secureStorage.removeItem(APPLE_NAME_KEY);
  } catch {
    // ignore — a stale entry is harmless, it is only replayed on an id match
  }
};

/** True only where Sign in with Apple can actually run (iOS, module present). */
export const isAppleSignInAvailable = async (): Promise<boolean> => {
  if (!AppleAuthRef) return false;
  try {
    return await AppleAuthRef.isAvailableAsync();
  } catch {
    return false;
  }
};

/**
 * Sign in with Apple. Returns the identity token plus the one-time full name,
 * or null if the user cancelled (which is not an error worth alerting on).
 */
export const signInWithApple = async (): Promise<AppleSignInResult | null> => {
  if (!AppleAuthRef) {
    throw new Error('Sign in with Apple is only available on iOS.');
  }

  try {
    const credential = await AppleAuthRef.signInAsync({
      requestedScopes: [
        AppleAuthRef.AppleAuthenticationScope.FULL_NAME,
        AppleAuthRef.AppleAuthenticationScope.EMAIL,
      ],
    });

    if (!credential?.identityToken) {
      throw new Error('Apple sign-in did not return an identity token.');
    }

    const given = credential.fullName?.givenName?.trim() || '';
    const family = credential.fullName?.familyName?.trim() || '';
    let fullName: string | null = `${given} ${family}`.trim() || null;

    const appleUserId: string | null = credential.user || null;
    try {
      if (fullName) {
        await secureStorage.setItem(
          APPLE_NAME_KEY,
          JSON.stringify({ user: appleUserId, fullName }),
        );
      } else if (appleUserId) {
        const saved = await secureStorage.getItem(APPLE_NAME_KEY);
        const parsed = saved ? JSON.parse(saved) : null;
        // Only replay for the SAME Apple account — never graft one user's
        // name onto another's on a shared device.
        if (parsed?.user === appleUserId) fullName = parsed.fullName || null;
      }
    } catch {
      // Persistence is a nicety; sign-in proceeds without it.
    }

    return {
      identityToken: credential.identityToken,
      fullName,
      authorizationCode: credential.authorizationCode ?? null,
    };
  } catch (error: any) {
    // Apple signals a user-initiated cancel with this code; treat it like the
    // Google path does — silently, with no alert.
    if (error?.code === 'ERR_REQUEST_CANCELED' || error?.code === 'ERR_CANCELED') {
      return null;
    }
    const msg = (error?.message || '').toLowerCase();
    if (msg.includes('cancel')) return null;
    throw new Error(error?.message || 'Apple sign-in failed.');
  }
};

export { app, auth };
