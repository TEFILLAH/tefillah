import { authAPI } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { secureStorage } from './secureStorage';

export type SocialAuthRouter = {
  replace: (path: any) => void;
};

/**
 * Returns true if the social-auth user is missing any mandatory profile data
 * (phone, city, country). Both regular users AND prayer partners MUST have
 * these before they can use the app.
 */
function isProfileIncomplete(user: any): boolean {
  if (!user) return true;
  const phone = (user.phone || '').trim();
  const city = (user.location_city || '').trim();
  const country = (user.location_country || '').trim();
  return !phone || !city || !country;
}

/**
 * Shared social auth flow — handles the backend call, token storage,
 * Zustand store update, and routing after a successful Firebase sign-in.
 *
 * Used by landing.tsx, login.tsx, and signup.tsx.
 *
 * Routing rules:
 *   1. If profile is incomplete (missing phone/city/country) →
 *      route to /(auth)/complete-profile to collect them. This applies to
 *      BOTH new social sign-ups and returning users whose profile was never
 *      completed.
 *   2. Else if user is not email-verified → /(auth)/verify
 *   3. Else → home (user) or dashboard (partner)
 */
export async function handleSocialAuthFlow(
  firebaseToken: string,
  router: SocialAuthRouter,
): Promise<void> {
  const response = await authAPI.socialAuth({
    firebase_token: firebaseToken,
  });

  // Persist auth token & user type (encrypted on native)
  await secureStorage.setItem('auth_token', response.access_token);
  await secureStorage.setItem('user_type', response.user_type);

  // Update Zustand auth store so the app knows user is logged in
  useAuthStore.setState({
    user: response.user,
    token: response.access_token,
    userType: response.user_type,
    agent: response.user_type === 'partner' ? response.user : null,
    isInitialized: true,
  });

  // MANDATORY profile check — phone + location must be filled before
  // the user can proceed. Route them to complete-profile if anything is missing.
  if (isProfileIncomplete(response.user)) {
    router.replace({
      pathname: '/(auth)/complete-profile',
      params: {
        email: response.user?.email || '',
        name: response.user?.name || '',
        provider: 'google',
        isAgent: response.user_type === 'partner' ? '1' : '0',
      },
    });
    return;
  }

  // Route based on verification & user type
  if (response.user?.is_verified) {
    if (response.user_type === 'partner') {
      router.replace('/(partner)/dashboard');
    } else {
      router.replace('/(main)/home');
    }
  } else {
    router.replace('/(auth)/verify');
  }
}
