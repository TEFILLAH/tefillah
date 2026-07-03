import { create } from 'zustand';
import { adminApi, adminStorage, adminErr, type AdminUser } from './adminApi';

interface AdminAuthState {
  admin: AdminUser | null;
  token: string | null;
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;

  initialize: () => void;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  clearError: () => void;
}

export const useAdminAuth = create<AdminAuthState>((set) => ({
  admin: null,
  token: null,
  isLoading: false,
  isInitialized: false,
  error: null,

  initialize: () => {
    const token = adminStorage.getToken();
    const admin = adminStorage.getUser<AdminUser>();
    set({
      token: token ?? null,
      admin: admin ?? null,
      isInitialized: true,
    });
  },

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const res = await adminApi.login(email.trim().toLowerCase(), password);
      adminStorage.setToken(res.access_token);
      adminStorage.setUser(res.admin);
      set({ admin: res.admin, token: res.access_token, isLoading: false });
    } catch (err) {
      const message = adminErr(err, 'Login failed');
      set({ isLoading: false, error: message });
      throw new Error(message);
    }
  },

  logout: () => {
    adminStorage.clear();
    set({ admin: null, token: null, error: null });
  },

  clearError: () => set({ error: null }),
}));
