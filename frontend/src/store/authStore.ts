import { create } from 'zustand';
import { secureStorage } from '../lib/secureStorage';
import { authAPI, agentAPI, partnerAPI } from '../api/client';

interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  address?: string;
  location_city?: string;
  location_country?: string;
  is_verified: boolean;
  profile_photo_url?: string;
  created_at: string;
}

interface Partner {
  id: string;
  name: string;
  email: string;
  phone?: string;
  location_city: string;
  location_country: string;
  organization?: string;
  partner_type: string;
  cell_id?: string;
  cell_name?: string;
  is_verified: boolean;
  is_active: boolean;
  prayers_handled: number;
  total_prayer_time_minutes: number;
  response_rate: number;
  created_at: string;
}

type UserType = 'user' | 'partner' | null;

interface AuthState {
  user: User | Partner | null;
  agent: Partner | null; // Keep for backward compatibility
  token: string | null;
  userType: UserType;
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;
  canSwitch: boolean;
  switchTarget: UserType;

  // Actions
  initialize: () => Promise<void>;
  login: (email: string, password: string) => Promise<{ userType: UserType }>;
  loginAsPartner: (email: string, password: string) => Promise<void>;
  loginAsAgent: (email: string, password: string) => Promise<void>; // Alias for partner
  register: (data: {
    name: string;
    email: string;
    phone?: string;
    address?: string;
    location_city?: string;
    location_country?: string;
    password: string;
  }) => Promise<void>;
  registerAsPartner: (data: {
    name: string;
    email: string;
    phone?: string;
    password: string;
    location_city: string;
    location_country: string;
    organization?: string;
    partner_type?: string;
  }) => Promise<void>;
  registerAsAgent: (data: {
    name: string;
    email: string;
    phone?: string;
    password: string;
    location_city: string;
    location_country: string;
  }) => Promise<void>; // Alias for partner
  verifyEmail: (code: string) => Promise<void>;
  resendVerification: () => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  clearError: () => void;
  checkSwitch: () => Promise<void>;
  switchAccount: () => Promise<UserType>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  agent: null,
  token: null,
  userType: null,
  isLoading: false,
  isInitialized: false,
  error: null,
  canSwitch: false,
  switchTarget: null,

  initialize: async () => {
    try {
      set({ isLoading: true });
      const token = await secureStorage.getItem('auth_token');
      const storedUserType = await secureStorage.getItem('user_type') as UserType;
      
      if (token) {
        try {
          const response = await authAPI.getMe();
          const userType = storedUserType || 'user';
          
          set({ 
            user: response, 
            agent: userType === 'partner' ? response : null,
            token, 
            userType,
            isInitialized: true, 
            isLoading: false 
          });
          get().checkSwitch();
        } catch (error) {
          await secureStorage.removeItem('auth_token');
          await secureStorage.removeItem('user_type');
          set({ user: null, agent: null, token: null, userType: null, isInitialized: true, isLoading: false });
        }
      } else {
        set({ isInitialized: true, isLoading: false });
      }
    } catch (error) {
      set({ isInitialized: true, isLoading: false });
    }
  },

  login: async (email: string, password: string) => {
    try {
      set({ isLoading: true, error: null });
      const response = await authAPI.login({ email, password });
      
      await secureStorage.setItem('auth_token', response.access_token);
      await secureStorage.setItem('user_type', response.user_type || 'user');
      
      set({ 
        user: response.user, 
        agent: null,
        token: response.access_token, 
        userType: response.user_type || 'user',
        isLoading: false 
      });
      
      get().checkSwitch();
      return { userType: response.user_type || 'user' };
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Login failed';
      set({ isLoading: false, error: message });
      throw new Error(message);
    }
  },

  loginAsPartner: async (email: string, password: string) => {
    try {
      set({ isLoading: true, error: null });
      const response = await partnerAPI.login(email, password);
      
      await secureStorage.setItem('auth_token', response.access_token);
      await secureStorage.setItem('user_type', 'partner');
      
      set({ 
        user: response.partner, 
        agent: response.partner,
        token: response.access_token, 
        userType: 'partner',
        isLoading: false 
      });
      get().checkSwitch();
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Login failed';
      set({ isLoading: false, error: message });
      throw new Error(message);
    }
  },

  // Alias for backward compatibility
  loginAsAgent: async (email: string, password: string) => {
    return get().loginAsPartner(email, password);
  },

  register: async (data) => {
    try {
      set({ isLoading: true, error: null });
      const response = await authAPI.register(data);
      
      await secureStorage.setItem('auth_token', response.access_token);
      await secureStorage.setItem('user_type', 'user');
      
      set({ 
        user: response.user, 
        agent: null,
        token: response.access_token, 
        userType: 'user',
        isLoading: false 
      });
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Registration failed';
      set({ isLoading: false, error: message });
      throw new Error(message);
    }
  },

  registerAsPartner: async (data) => {
    try {
      set({ isLoading: true, error: null });
      const response = await partnerAPI.register(data);
      
      await secureStorage.setItem('auth_token', response.access_token);
      await secureStorage.setItem('user_type', 'partner');
      
      set({ 
        user: response.partner, 
        agent: response.partner,
        token: response.access_token, 
        userType: 'partner',
        isLoading: false 
      });
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Registration failed';
      set({ isLoading: false, error: message });
      throw new Error(message);
    }
  },

  // Alias for backward compatibility
  registerAsAgent: async (data) => {
    return get().registerAsPartner({
      ...data,
      partner_type: 'prayer_warrior'
    });
  },

  verifyEmail: async (code: string) => {
    try {
      set({ isLoading: true, error: null });
      const { user } = get();
      const email = (user as any)?.email;
      if (!email) throw new Error('No user found');
      
      await authAPI.verifyEmail({ email, code });
      
      // Refresh user data
      await get().refreshUser();
      set({ isLoading: false });
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Verification failed';
      set({ isLoading: false, error: message });
      throw new Error(message);
    }
  },

  resendVerification: async () => {
    try {
      set({ isLoading: true, error: null });
      const { user } = get();
      const email = (user as any)?.email;
      if (!email) throw new Error('No user found');
      
      await authAPI.resendVerification(email);
      set({ isLoading: false });
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Failed to resend code';
      set({ isLoading: false, error: message });
      throw new Error(message);
    }
  },

  logout: async () => {
    await secureStorage.removeItem('auth_token');
    await secureStorage.removeItem('user_type');
    set({ user: null, agent: null, token: null, userType: null, canSwitch: false, switchTarget: null });
  },

  refreshUser: async () => {
    try {
      const response = await authAPI.getMe();
      const { userType } = get();
      set({ 
        user: response, 
        agent: userType === 'partner' ? response : null 
      });
    } catch (error) {
      if (__DEV__) console.error('Failed to refresh user:', error);
    }
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
    await secureStorage.setItem('auth_token', res.access_token);
    await secureStorage.setItem('user_type', type || 'user');
    set({
      user: res.account,
      agent: type === 'partner' ? res.account : null,
      token: res.access_token,
      userType: type,
    });
    get().checkSwitch();
    return type;
  },

  clearError: () => set({ error: null }),
}));
