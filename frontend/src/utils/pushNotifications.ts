import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { deviceAPI } from '../api/client';

// Configure notification handler — show alerts even when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Request push notification permissions and get the device token.
 * Registers the token with the backend for FCM delivery.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  // Push notifications don't work on simulators
  if (!Device.isDevice) {
    if (__DEV__) console.log('Push notifications require a physical device');
    return null;
  }

  // Check/request permission
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    if (__DEV__) console.log('Push notification permission not granted');
    return null;
  }

  // Android notification channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#d4af37',
    });

    await Notifications.setNotificationChannelAsync('prayers', {
      name: 'Prayer Updates',
      description: 'Updates about your prayer requests',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }

  try {
    // The backend delivers via the Firebase Admin SDK (firebase_messaging.send),
    // which requires a NATIVE FCM registration token — NOT an Expo push token.
    // getDevicePushTokenAsync() returns the FCM token on Android (google-services.json
    // is bundled). getExpoPushTokenAsync() would hand back an "ExponentPushToken[...]"
    // that FCM rejects, so push silently never arrived.
    const tokenData = await Notifications.getDevicePushTokenAsync();
    const token = typeof tokenData.data === 'string' ? tokenData.data : String(tokenData.data);

    if (__DEV__) console.log(`Device push token (${tokenData.type}):`, token);

    // iOS hands back an APNs token here, which the FCM Admin SDK cannot target
    // directly — iOS push needs the Firebase messaging SDK and is wired up
    // separately. Registering on Android is what makes prayer-partner push work.
    if (Platform.OS === 'ios' && tokenData.type !== 'fcm') {
      if (__DEV__) console.log('iOS APNs token not registered for FCM delivery (handled separately).');
      return token;
    }

    // Register token with backend. Surface failures (no longer fully swallowed)
    // so a misconfigured device is visible in logs instead of pretending success.
    try {
      await deviceAPI.registerToken(token);
      if (__DEV__) console.log('FCM device token registered with backend');
    } catch (err: any) {
      console.warn('Failed to register device token with backend:', err?.response?.data?.detail || err?.message || err);
    }

    return token;
  } catch (err: any) {
    console.warn('Failed to get device push token:', err?.message || err);
    return null;
  }
}

/**
 * Add listener for notification received while app is in foreground.
 */
export function addNotificationReceivedListener(
  callback: (notification: Notifications.Notification) => void
) {
  return Notifications.addNotificationReceivedListener(callback);
}

/**
 * Add listener for when user taps on a notification.
 */
export function addNotificationResponseListener(
  callback: (response: Notifications.NotificationResponse) => void
) {
  return Notifications.addNotificationResponseReceivedListener(callback);
}
