import React from 'react';
import { Stack } from 'expo-router';
import { useTheme } from '../../src/store/themeStore';

export default function AuthLayout() {
  const { colors } = useTheme();
  
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: 'fade',
      }}
    >
      <Stack.Screen name="language-select" />
      <Stack.Screen name="landing" />
      <Stack.Screen name="signup" />
      <Stack.Screen name="login" />
      <Stack.Screen name="verify" />
      <Stack.Screen name="agent-signup" />
      <Stack.Screen name="agent-login" />
      <Stack.Screen name="complete-profile" />
      <Stack.Screen name="forgot-password" />
    </Stack>
  );
}
