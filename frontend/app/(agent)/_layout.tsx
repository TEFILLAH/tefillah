import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { useRouter } from 'expo-router';
import { useTheme } from '../../src/store/themeStore';
import { useAuthStore } from '../../src/store/authStore';

export default function AgentLayout() {
  const { colors } = useTheme();
  const { token, userType, isInitialized } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (isInitialized && (!token || userType !== 'partner')) {
      router.replace('/(auth)/agent-login');
    }
  }, [isInitialized, token, userType]);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: 'fade',
      }}
    >
      <Stack.Screen name="dashboard" />
    </Stack>
  );
}
