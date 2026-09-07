import { authAPI } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { storage } from './storage';

type Next = 'complete-profile' | 'verify' | 'home' | 'partner';

export type SocialProvider = 'google' | 'apple';

export interface SocialSignInResult {
  next: Next;
  provider: SocialProvider;
  email?: string;
  name?: string;
  isAgent?: boolean;
}

interface SessionUser {
  email?: string;
  name?: string;
  phone?: string;
  location_city?: string;
  location_country?: string;
  is_verified?: boolean;
}

// Persist the session returned by /auth/social or /auth/social/complete into
// storage + the auth store, mirroring loginAsUser.
function applySession(res: { access_token: string; user_type?: string; user: SessionUser }): 'user' | 'partner' {
  const type = (res.user_type as 'user' | 'partner') ?? 'user';
  storage.setToken(res.access_token);
  storage.setUserType(type);
  storage.setUser(res.user);
  useAuthStore.setState({
    user: type === 'user' ? (res.user as never) : null,
    partner: type === 'partner' ? (res.user as never) : null,
    token: res.access_token,
    userType: type,
    isLoading: false,
  });
  useAuthStore.getState().checkSwitch();
  return type;
}

function isIncomplete(u: SessionUser): boolean {
  return !String(u.phone ?? '').trim() || !String(u.location_city ?? '').trim() || !String(u.location_country ?? '').trim();
}

export async function socialSignIn(
  firebaseToken: string,
  provider: SocialProvider,
  // Apple hands the display name to the CLIENT on the first authorization only and
  // never puts it in the token, so it has to ride along with the request or the
  // account is created from the email prefix (a private-relay alias, for Apple).
  fullName?: string,
): Promise<SocialSignInResult> {
  const res = await authAPI.socialAuth(firebaseToken, fullName);
  const type = applySession(res);
  const u: SessionUser = res.user ?? {};
  if (isIncomplete(u)) {
    return { next: 'complete-profile', provider, email: u.email, name: u.name, isAgent: type === 'partner' };
  }
  if (!u.is_verified) return { next: 'verify', provider };
  return { next: type === 'partner' ? 'partner' : 'home', provider };
}

// Where a finished social sign-in lands. Shared by the Google + Apple buttons so
// both route identically.
export function socialRedirectPath(r: SocialSignInResult): string {
  switch (r.next) {
    case 'complete-profile': {
      const q = new URLSearchParams({
        email: r.email ?? '',
        name: r.name ?? '',
        agent: r.isAgent ? '1' : '0',
        provider: r.provider,
      });
      return `/complete-profile?${q.toString()}`;
    }
    case 'verify':
      return '/verify';
    case 'partner':
      return '/partner/dashboard';
    default:
      return '/home';
  }
}

export async function completeSocialProfile(data: {
  email: string;
  name: string;
  phone: string;
  location_city: string;
  location_country: string;
  address?: string;
  is_agent?: boolean;
}): Promise<{ next: Next }> {
  const res = await authAPI.completeSocialAuth(data);
  const type = applySession(res);
  if (!res.user?.is_verified) return { next: 'verify' };
  return { next: type === 'partner' ? 'partner' : 'home' };
}
