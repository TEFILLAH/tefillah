import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Local preference for whether the user wants push notifications.
 * Defaults to ON (true) until the user explicitly turns it off.
 *
 * This gates push-token registration: when off, the app removes the device
 * token from the backend so no notifications are delivered.
 */
const NOTIF_ENABLED_KEY = 'tefillah:notifications_enabled';

export async function getNotificationsEnabled(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(NOTIF_ENABLED_KEY);
    return v === null ? true : v === 'true';
  } catch {
    return true;
  }
}

export async function setNotificationsEnabled(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(NOTIF_ENABLED_KEY, enabled ? 'true' : 'false');
  } catch {
    // best-effort; ignore storage failures
  }
}
