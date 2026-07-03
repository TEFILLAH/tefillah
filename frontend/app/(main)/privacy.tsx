import React from 'react';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';

// Redirect old route to new one
export default function PrivacyRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/(main)/privacy-policy');
  }, []);
  return null;
}
