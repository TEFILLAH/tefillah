import React, { useEffect, useRef } from 'react';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet } from 'react-native';
import { useAuthStore } from '../src/store/authStore';
import { useThemeStore } from '../src/store/themeStore';
import { useLanguageStore } from '../src/store/languageStore';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import {
  registerForPushNotifications,
  addNotificationReceivedListener,
  addNotificationResponseListener,
} from '../src/utils/pushNotifications';
import { getNotificationsEnabled } from '../src/utils/notificationPrefs';
import '../src/i18n';

export default function RootLayout() {
  const { initialize: initAuth, token } = useAuthStore();
  const { initialize: initTheme, colors, mode } = useThemeStore();
  const { initialize: initLanguage } = useLanguageStore();
  const notifListenerRef = useRef<any>(null);
  const responseListenerRef = useRef<any>(null);

  useEffect(() => {
    initAuth();
    initTheme();
    initLanguage();
  }, []);

  // Register push notifications when user is logged in
  useEffect(() => {
    if (!token) return;

    // Only register the push token if the user hasn't turned notifications off.
    getNotificationsEnabled().then((enabled) => {
      if (!enabled) return;
      registerForPushNotifications().catch((err) => {
        if (__DEV__) console.warn('Push notification registration failed:', err);
      });
    });

    // Listen for incoming notifications (foreground)
    notifListenerRef.current = addNotificationReceivedListener((notification) => {
      if (__DEV__) console.log('Notification received:', notification.request.content.title);
    });

    // Listen for notification taps — navigate to deep link screen if specified
    responseListenerRef.current = addNotificationResponseListener((response) => {
      const data = response.notification.request.content.data;
      if (__DEV__) console.log('Notification tapped:', data);
      if (data?.screen) {
        try {
          // Map of screen keys used in push-notification payloads to the
          // actual Expo Router paths that exist in the app. Keep this in
          // sync with the file structure under app/(main)/.
          const screenMap: Record<string, string> = {
            home: '/(main)/home',
            history: '/(main)/history',
            prayers: '/(main)/history',
            prayer: '/(main)/prayer',
            'submit-prayer': '/(main)/prayer',
            notifications: '/(main)/notifications',
            profile: '/(main)/menu',
            menu: '/(main)/menu',
          };
          const route = screenMap[data.screen as string];
          if (route) router.push(route as any);
        } catch (e) {
          if (__DEV__) console.warn('Deep link navigation failed:', e);
        }
      }
    });

    return () => {
      if (notifListenerRef.current) notifListenerRef.current.remove();
      if (responseListenerRef.current) responseListenerRef.current.remove();
    };
  }, [token]);

  return (
    <ErrorBoundary>
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: 'fade',
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(main)" />
        <Stack.Screen name="(partner)" />
      </Stack>
    </View>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
