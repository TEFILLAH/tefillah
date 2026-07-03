import { create } from 'zustand';
import { authAPI, partnerAPI, type RegisterPayload, type PartnerRegisterPayload } from '../api/client';
import { storage } from '../lib/storage';

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  address?: string;
  location_city?: string;
  location_country?: string;
  is_verified: boolean;
  profile_photo_url?: string;
  pending_email?: string;
  created_at: string;
}

export interface Partner {
  id: string;
  name: string;
  email: string;
  phone?: string;
  location_city: string;
  location_country: string;
  organization?: string;
  partner_type: string;
  is_verified: boolean;
  is_active: boolean;
  prayers_handled: number;
  total_prayer_time_minutes: number;
  response_rate: number;
  created_at: string;
}

export type UserType = 'user' | 'partner' | null;

interface AuthState {
  user: User | null;
  partner: Partner | null;
  token: string | null;
  userType: UserType;
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;
  canSwitch: boolean;
  switchTarget: UserType;

  initialize: () => Promise<void>;
  loginAsUser: (email: string, password: string) => Promise<UserType>;
  loginAsPartner: (email: string, password: string) => Promise<void>;
  registerAsUser: (data: RegisterPayload) => Promise<void>;
  registerAsPartner: (data: PartnerRegisterPayload) => Promise<void>;
  verifyEmail: (code: string) => Promise<void>;
  resendVerification: () => Promise<void>;
  refreshUser: () => Promise<void>;
  logout: () => void;
  clearError: () => void;
  checkSwitch: () => Promise<void>;
  switchAccount: () => Promise<UserType>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  partner: null,
  token: null,
  userType: null,
  isLoading: false,
  isInitialized: false,
  error: null,
  canSwitch: false,
  switchTarget: null,

  initialize: async () => {
    const token = storage.getToken();
    const storedType = storage.getUserType();
    const storedUser = storage.getUser<User | Partner>();

    if (!token) {
      set({ isInitialized: true });
      return;
    }

    // Optimistic restore — instant UI, validate in background.
    if (storedUser && storedType) {
      set({
        token,
        userType: storedType,
        user: storedType === 'user' ? (storedUser as User) : null,
        partner: storedType === 'partner' ? (storedUser as Partner) : null,
        isInitialized: true,
      });
    }

    // Validate against server. The /auth/me endpoint accepts both user and
    // partner JWTs because they share the same token format.
    try {
      const fresh = await authAPI.getMe();
      const type: UserType = (fresh.user_type as UserType) ?? storedType ?? 'user';
      storage.setUser(fresh);
      if (type) storage.setUserType(type);
      set({
        token,
        userType: type,
        user: type === 'user' ? fresh : null,
        partner: type === 'partner' ? fresh : null,
        isInitialized: true,
      });
      get().checkSwitch();
    } catch {
      storage.clearAuth();
      set({
        user: null,
        partner: null,
        token: null,
        userType: null,
        isInitialized: true,
      });
    }
  },

  loginAsUser: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const res = await authAPI.login(email, password);
      // Admin accounts must use the admin panel, not the public app (otherwise
      // they land in a hollow no-user session on user-only screens).
      if ((res.user_type as string) === 'admin') {
        throw new Error('This is an admin account. Please sign in at the admin panel (/admin).');
      }
      const type: UserType = (res.user_type as UserType) ?? 'user';
      storage.setToken(res.access_token);
      storage.setUserType(type ?? 'user');
      storage.setUser(res.user);
      set({
        user: type === 'user' ? res.user : null,
        partner: type === 'partner' ? res.user : null,
        token: res.access_token,
        userType: type,
        isLoading: false,
      });
      get().checkSwitch();
      return type;
    } catch (err) {
      const message = extractError(err, 'Login failed');
      set({ isLoading: false, error: message });
      throw new Error(message);
    }
  },

  loginAsPartner: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const res = await partnerAPI.login(email, password);
      storage.setToken(res.access_token);
      storage.setUserType('partner');
      storage.setUser(res.partner);
      set({
        user: null,
        partner: res.partner,
        token: res.access_token,
        userType: 'partner',
        isLoading: false,
      });
      get().checkSwitch();
    } catch (err) {
      const message = extractError(err, 'Login failed');
      set({ isLoading: false, error: message });
      throw new Error(message);
    }
  },

  registerAsUser: async (data) => {
    set({ isLoading: true, error: null });
    try {
      const res = await authAPI.register(data);
      storage.setToken(res.access_token);
      storage.setUserType('user');
      storage.setUser(res.user);
      set({
        user: res.user,
        partner: null,
        token: res.access_token,
        userType: 'user',
        isLoading: false,
      });
    } catch (err) {
      const message = extractError(err, 'Registration failed');
      set({ isLoading: false, error: message });
      throw new Error(message);
    }
  },

  registerAsPartner: async (data) => {
    set({ isLoading: true, error: null });
    try {
      const res = await partnerAPI.register({
        partner_type: 'prayer_warrior',
        ...data,
      });
      storage.setToken(res.access_token);
      storage.setUserType('partner');
      storage.setUser(res.partner);
      set({
        user: null,
        partner: res.partner,
        token: res.access_token,
        userType: 'partner',
        isLoading: false,
      });
    } catch (err) {
      const message = extractError(err, 'Registration failed');
      set({ isLoading: false, error: message });
      throw new Error(message);
    }
  },

  verifyEmail: async (code) => {
    set({ isLoading: true, error: null });
    const { user, partner } = get();
    const email = user?.email ?? partner?.email;
    if (!email) {
      set({ isLoading: false, error: 'No account in progress' });
      throw new Error('No account in progress');
    }
    try {
      await authAPI.verifyEmail(email, code);
      await get().refreshUser();
      set({ isLoading: false });
    } catch (err) {
      const message = extractError(err, 'Verification failed');
      set({ isLoading: false, error: message });
      throw new Error(message);
    }
  },

  resendVerification: async () => {
    const { user, partner } = get();
    const email = user?.email ?? partner?.email;
    if (!email) throw new Error('No account in progress');
    await authAPI.resendVerification(email);
  },

  refreshUser: async () => {
    try {
      const fresh = await authAPI.getMe();
      const { userType } = get();
      storage.setUser(fresh);
      set({
        user: userType === 'user' ? fresh : null,
        partner: userType === 'partner' ? fresh : null,
      });
    } catch {
      // ignore — auth interceptor will have cleared tokens on 401
    }
  },

  logout: () => {
    storage.clearAuth();
    set({ user: null, partner: null, token: null, userType: null, error: null, canSwitch: false, switchTarget: null });
  },

  checkSwitch: async () => {
    try {
      const r = await authAPI.switchAvailability();
      set({ canSwitch: r.can_switch, switchTarget: (r.target_type as UserType) ?? null });
    } catch {
      set({ canSwitch: false, switchTarget: null });
    }
  },

  switchAccount: async () => {
    const res = await authAPI.switchAccount();
    const type = (res.user_type as UserType) ?? 'user';
    storage.setToken(res.access_token);
    if (type) storage.setUserType(type);
    storage.setUser(res.account as unknown as User | Partner);
    set({
      token: res.access_token,
      userType: type,
      user: type === 'user' ? (res.account as unknown as User) : null,
      partner: type === 'partner' ? (res.account as unknown as Partner) : null,
      error: null,
    });
    get().checkSwitch();
    return type;
  },

  clearError: () => set({ error: null }),
}));

function extractError(err: unknown, fallback: string): string {
  if (typeof err === 'object' && err !== null && 'response' in err) {
    const r = (err as { response?: { data?: { detail?: string } } }).response;
    if (r?.data?.detail) return r.data.detail;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}
