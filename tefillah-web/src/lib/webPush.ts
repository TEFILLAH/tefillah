import { getMessaging, getToken, isSupported } from 'firebase/messaging';
import { app } from './firebase';
import { pushAPI } from '../api/client';

/**
 * Web-push (FCM) helper for tefillah.in. Wraps the Firebase Cloud Messaging web
 * SDK so the shared <NotificationsToggle /> can ask the browser for permission,
 * grab this browser's FCM token, and register it with the backend
 * (`POST /user/register-device?token=`) for both users and partners.
 *
 * Everything here is guarded for SSR / unsupported browsers and never throws out
 * of an exported function — failures come back as `ok:false` / a falsy result so
 * the UI can show a friendly message instead of crashing.
 */

export type PushStatus = 'unsupported' | 'default' | 'granted' | 'denied';

// Public VAPID key for the FCM web push certificate (safe to ship client-side).
const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY as string;

// The FCM service worker lives in public/ and is served from the site root.
const SW_URL = '/firebase-messaging-sw.js';

/**
 * True only when this browser can actually do web push: the Notifications API,
 * service workers, and the FCM SDK are all present. Guards against SSR (no
 * `window`) and older/locked-down browsers.
 */
export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    typeof PushManager !== 'undefined'
  );
}

/**
 * The browser's current notification permission, or 'unsupported' when web push
 * isn't available at all. The toggle compares this against 'granted'/'denied'.
 */
export function pushStatus(): PushStatus {
  if (!pushSupported()) return 'unsupported';
  return Notification.permission as PushStatus;
}

/**
 * Register the FCM service worker and return its registration, which getToken
 * needs so the token is bound to our messaging service worker (not whatever the
 * browser would pick by default).
 */
async function getSwRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration(SW_URL);
  if (existing) return existing;
  return navigator.serviceWorker.register(SW_URL);
}

/**
 * Get this browser's FCM token and hand it to the backend. Shared by
 * enablePush() and refreshPushIfEnabled(); assumes permission is already
 * 'granted'. Returns the token on success, or null on any failure.
 */
async function fetchAndRegisterToken(): Promise<string | null> {
  // Bail if the FCM SDK doesn't support this browser (e.g. no push support).
  if (!(await isSupported())) return null;

  const messaging = getMessaging(app);
  const serviceWorkerRegistration = await getSwRegistration();
  const token = await getToken(messaging, {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration,
  });
  if (!token) return null;

  await pushAPI.registerDevice(token);
  return token;
}

/**
 * Ask the browser for notification permission, then (if granted) fetch and
 * register this browser's FCM token with the backend. Returns `ok:true` on
 * success, or `ok:false` with a human-readable `reason` on any failure.
 */
export async function enablePush(): Promise<{ ok: boolean; reason?: string }> {
  if (!pushSupported()) {
    return { ok: false, reason: 'Notifications are not supported in this browser.' };
  }

  try {
    const permission =
      Notification.permission === 'granted'
        ? 'granted'
        : await Notification.requestPermission();

    if (permission === 'denied') {
      return { ok: false, reason: 'Notifications are blocked in your browser settings.' };
    }
    if (permission !== 'granted') {
      return { ok: false, reason: 'Notification permission was not granted.' };
    }

    const token = await fetchAndRegisterToken();
    if (!token) {
      return { ok: false, reason: 'Could not get a notification token for this browser.' };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: 'Something went wrong enabling notifications.' };
  }
}

/**
 * If permission is already granted, silently (re)fetch and register this
 * browser's FCM token — self-heals a granted-but-unregistered state and keeps
 * the token fresh. Returns whether it succeeded; false (never throws) otherwise.
 */
export async function refreshPushIfEnabled(): Promise<boolean> {
  if (!pushSupported() || Notification.permission !== 'granted') return false;
  try {
    const token = await fetchAndRegisterToken();
    return token != null;
  } catch {
    return false;
  }
}
