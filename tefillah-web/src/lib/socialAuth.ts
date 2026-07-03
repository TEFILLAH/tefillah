import { authAPI } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { storage } from './storage';

type Next = 'complete-profile' | 'verify' | 'home' | 'partner';

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

export async function socialSignIn(firebaseToken: string): Promise<{ next: Next; email?: string; name?: string; isAgent?: boolean }> {
  const res = await authAPI.socialAuth(firebaseToken);
  const type = applySession(res);
  const u: SessionUser = res.user ?? {};
  if (isIncomplete(u)) {
    return { next: 'complete-profile', email: u.email, name: u.name, isAgent: type === 'partner' };
  }
  if (!u.is_verified) return { next: 'verify' };
  return { next: type === 'partner' ? 'partner' : 'home' };
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
