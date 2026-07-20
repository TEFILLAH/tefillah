import React, { useEffect } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../src/store/themeStore';
import { useAuthStore } from '../../src/store/authStore';

// Detail screens that should NOT appear as tabs and should hide the tab bar.
const HIDDEN_SCREENS = [
  'profile-settings',
  'change-password',
  'notifications',
  'confirmation',
  'privacy',
  'privacy-policy',
  'terms',
  'community-guidelines',
];

export default function MainTabsLayout() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { token, isInitialized } = useAuthStore();
  const router = useRouter();

  // Mirror the partner/agent layouts: if the session dies mid-run (24h JWT expiry, or a
  // 401 that the api client cleared), bounce to landing rather than leaving the user stuck
  // in tabs that all error into empty state. No guest path enters (main), so this is safe.
  useEffect(() => {
    if (isInitialized && !token) {
      router.replace('/(auth)/landing');
    }
  }, [isInitialized, token]);

  const tap = () => Haptics.selectionAsync().catch(() => {});

  return (
    <Tabs
      screenListeners={{ tabPress: tap }}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          // Reserve room for the device's system navigation bar (gesture/3-button)
          // so the tabs never sit under or collide with it.
          height: 60 + insets.bottom,
          paddingTop: 8,
          paddingBottom: insets.bottom + 8,
          elevation: 10,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginTop: 1,
          fontFamily: Platform.OS === 'ios' ? 'Avenir-Medium' : 'sans-serif',
        },
        tabBarItemStyle: { paddingVertical: 0 },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="prayer"
        options={{
          title: 'Pray',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'flame' : 'flame-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="bible"
        options={{
          title: 'Bible',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'book' : 'book-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'History',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'time' : 'time-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="menu"
        options={{
          title: 'Menu',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'grid' : 'grid-outline'} size={22} color={color} />
          ),
        }}
      />

      {HIDDEN_SCREENS.map((name) => (
        <Tabs.Screen key={name} name={name} options={{ href: null, tabBarStyle: { display: 'none' } }} />
      ))}
    </Tabs>
  );
}
