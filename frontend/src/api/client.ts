import axios, { AxiosError } from 'axios';
import { secureStorage } from '../lib/secureStorage';

/**
 * API client for Tefillah mobile app.
 *
 * Base URL resolution:
 *  1. EXPO_PUBLIC_BACKEND_URL env var (baked at build time) → `<url>/api`
 *  2. Fallback: production API `https://api.tefillah.in/api`
 *
 * Auth:
 *  - JWT stored in secureStorage under key `auth_token`
 *  - Auto-attached as `Authorization: Bearer <token>` on every request
 *  - On 401: we clear the token; the authStore's `initialize()` will route the user to login on next launch
 */

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'https://api.tefillah.in';
const API_URL = `${BACKEND_URL.replace(/\/$/, '')}/api`;

export const apiClient = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 60000,
});

// Request interceptor: attach JWT from secureStorage
apiClient.interceptors.request.use(async (config) => {
  try {
    const token = await secureStorage.getItem('auth_token');
    if (token) {
      config.headers = config.headers ?? {};
      (config.headers as any).Authorization = `Bearer ${token}`;
    }
  } catch {
    // Silent: if secureStorage fails we just send the request unauthenticated
  }
  return config;
});

// Response interceptor: clear token on 401 so authStore re-initializes to logged-out state
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    if (error.response?.status === 401) {
      try {
        await secureStorage.removeItem('auth_token');
        await secureStorage.removeItem('user_type');
        // Also reset the in-memory store, otherwise the session is a zombie: JWTs
        // expire after 24h with no refresh, and every screen keeps rendering stale
        // data (errors swallowed) while token is still set. logout() is a local
        // reset (no server call). Lazy require avoids the store<->client import cycle.
        const { useAuthStore } = require('../store/authStore');
        await useAuthStore.getState().logout();
      } catch {
        // ignore
      }
    }
    return Promise.reject(error);
  }
);

// ----------------------------------------------------------------------------
// publicAPI — unauthenticated endpoints
// ----------------------------------------------------------------------------

export const publicAPI = {
  generateVerse: async (language: string = 'en') => {
    const res = await apiClient.get(`/verse/generate`, { params: { language } });
    return res.data as { verse: string; reference: string };
  },
};

// ----------------------------------------------------------------------------
// authAPI — user authentication (email/password + social)
// ----------------------------------------------------------------------------

export interface RegisterPayload {
  name: string;
  email: string;
  phone?: string;
  address?: string;
  location_city?: string;
  location_country?: string;
  password: string;
}

export interface CompleteSocialAuthPayload {
  email: string;
  name: string;
  phone?: string;
  address?: string;
  is_agent?: boolean;
  location_city?: string;
  location_country?: string;
}

export const authAPI = {
  login: async ({ email, password }: { email: string; password: string }) => {
    const res = await apiClient.post('/auth/login', { email, password });
    return res.data;
  },

  register: async (data: RegisterPayload) => {
    const res = await apiClient.post('/auth/register', data);
    return res.data;
  },

  getMe: async () => {
    const res = await apiClient.get('/auth/me');
    return res.data;
  },

  verifyEmail: async ({ email, code }: { email: string; code: string }) => {
    const res = await apiClient.post('/auth/verify-email', { email, code });
    return res.data;
  },

  resendVerification: async (email: string) => {
    const res = await apiClient.post('/auth/resend-verification', { email });
    return res.data;
  },

  switchAvailability: async () => {
    const res = await apiClient.get('/auth/switch-availability');
    return res.data as { can_switch: boolean; target_type: 'user' | 'partner' | null };
  },

  switchAccount: async () => {
    const res = await apiClient.post('/auth/switch-account');
    return res.data as { access_token: string; user_type: 'user' | 'partner'; account: any };
  },

  socialAuth: async ({ firebase_token }: { firebase_token: string }) => {
    const res = await apiClient.post('/auth/social', { firebase_token });
    return res.data;
  },

  completeSocialAuth: async (data: CompleteSocialAuthPayload) => {
    const res = await apiClient.post('/auth/social/complete', data);
    return res.data;
  },

  forgotPassword: async (email: string) => {
    const res = await apiClient.post('/auth/forgot-password', { email });
    return res.data;
  },

  resetPassword: async ({ email, code, new_password }: { email: string; code: string; new_password: string }) => {
    const res = await apiClient.post('/auth/reset-password', { email, code, new_password });
    return res.data;
  },

  changePassword: async ({ current_password, new_password }: { current_password: string; new_password: string }) => {
    const res = await apiClient.put('/auth/change-password', { current_password, new_password });
    return res.data;
  },

  // Update the signed-in user's profile. Changing email is staged until confirmed
  // via verifyEmailChange — the live email stays until then.
  updateProfile: async (data: {
    name?: string;
    email?: string;
    phone?: string;
    location_city?: string;
    location_country?: string;
  }) => {
    const res = await apiClient.put('/user/profile', data);
    return res.data as {
      message: string;
      email_change_pending: boolean;
      pending_email: string | null;
      user: {
        id: string;
        name: string;
        email: string;
        phone?: string;
        location_city?: string;
        location_country?: string;
        is_verified: boolean;
        profile_photo_url?: string;
      };
    };
  },

  // Confirm a staged email change with the code emailed to the new address.
  verifyEmailChange: async (code: string) => {
    const res = await apiClient.post('/user/verify-email-change', { code });
    return res.data as { message: string; email: string };
  },

  // Permanently delete the signed-in account + its data. Required by Google Play
  // and Apple. Works for both users and partners (backend resolves the caller).
  deleteAccount: async () => {
    const res = await apiClient.delete('/me');
    return res.data as { message: string };
  },

  // Upload/replace the signed-in user's profile photo (multipart from a local file URI).
  uploadPhoto: async (file: { uri: string; name?: string; type?: string }) => {
    const form = new FormData();
    form.append('file', {
      uri: file.uri,
      name: file.name || 'avatar.jpg',
      type: file.type || 'image/jpeg',
    } as any);
    const res = await apiClient.post('/user/profile/photo', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data as { profile_photo_url: string };
  },
};

// ----------------------------------------------------------------------------
// prayerAPI — submit prayer, history
// ----------------------------------------------------------------------------

export interface PrayerSubmitPayload {
  content: string;
  is_anonymous?: boolean;
  location_city?: string;
  location_country?: string;
  location_lat?: number;
  location_lon?: number;
  language?: string;
}

export const prayerAPI = {
  submit: async (data: PrayerSubmitPayload) => {
    const res = await apiClient.post('/prayer/submit', data);
    return res.data;
  },

  guestSubmit: async (data: PrayerSubmitPayload) => {
    const res = await apiClient.post('/prayer/guest-submit', data);
    return res.data;
  },

  getHistory: async () => {
    const res = await apiClient.get('/prayer/history');
    return res.data;
  },

  // Flag the AI-generated comfort message / verse on one of your own prayers.
  flagAiContent: async (prayerId: string, reason?: string) => {
    const res = await apiClient.post(`/prayer/${prayerId}/flag`, { reason: reason ?? null });
    return res.data as { message: string };
  },
};

// ----------------------------------------------------------------------------
// communityAPI — aggregate "prayer pulse" for the home billboard
// ----------------------------------------------------------------------------

export interface CommunityPulse {
  prayers_this_week: number;
  prayers_total: number;
  prayers_answered: number;
  your_prayers_prayed: number;
  last_prayed_at: string | null;
}

export const communityAPI = {
  getPulse: async (): Promise<CommunityPulse> => {
    const res = await apiClient.get('/community/pulse');
    return res.data as CommunityPulse;
  },
};

// ----------------------------------------------------------------------------
// partnerAPI — prayer partner flows
// ----------------------------------------------------------------------------

export interface PartnerRegisterPayload {
  name: string;
  email: string;
  phone?: string;
  password: string;
  location_city: string;
  location_country: string;
  organization?: string;
  partner_type?: string;
}

export const partnerAPI = {
  login: async (email: string, password: string) => {
    const res = await apiClient.post('/partner/login', { email, password });
    return res.data;
  },

  register: async (data: PartnerRegisterPayload) => {
    const res = await apiClient.post('/partner/register', data);
    return res.data;
  },

  getStats: async () => {
    const res = await apiClient.get('/partner/stats');
    return res.data;
  },

  getRequests: async (status?: string, page: number = 1, limit: number = 20) => {
    const params: Record<string, any> = { page, limit };
    if (status) params.status = status;
    const res = await apiClient.get('/partner/requests', { params });
    return res.data;
  },

  markPrayed: async (prayerId: string, minutes: number = 5) => {
    const res = await apiClient.post(
      `/partner/requests/${prayerId}/mark-prayed`,
      null,
      { params: { prayer_duration_minutes: minutes } }
    );
    return res.data;
  },

  // Mark a "New" request as opened — starts its 24h response + 60-min prayer timers.
  markSeen: async (prayerId: string) => {
    const res = await apiClient.post(`/partner/requests/${prayerId}/seen`);
    return res.data;
  },

  // Report an objectionable request — flags it for review and removes it from the queue.
  report: async (prayerId: string, reason?: string) => {
    const res = await apiClient.post(`/partner/requests/${prayerId}/report`, { reason: reason ?? null });
    return res.data as { message: string };
  },

  // Block a requester — you won't be assigned their requests again.
  blockUser: async (userId: string) => {
    const res = await apiClient.post('/partner/block-user', { user_id: userId });
    return res.data as { message: string };
  },

  updateProfile: async (data: { name?: string; phone?: string; organization?: string }) => {
    const res = await apiClient.put('/partner/profile', data);
    return res.data;
  },
};

// ----------------------------------------------------------------------------
// agentAPI — alias for partnerAPI (kept for backward compatibility with older screens)
// ----------------------------------------------------------------------------

export const agentAPI = {
  getRequests: async () => partnerAPI.getRequests(),
  getStats: async () => partnerAPI.getStats(),
  markPrayed: async (prayerId: string) => partnerAPI.markPrayed(prayerId),
};

// ----------------------------------------------------------------------------
// notificationsAPI — in-app notification center
// ----------------------------------------------------------------------------

export const notificationsAPI = {
  getAll: async (page: number = 1) => {
    const res = await apiClient.get('/user/notifications', { params: { page } });
    return res.data;
  },

  markRead: async (notificationId: string) => {
    const res = await apiClient.post(`/user/notifications/${notificationId}/read`);
    return res.data;
  },

  markAllRead: async () => {
    const res = await apiClient.post('/user/notifications/read-all');
    return res.data;
  },
};

// ----------------------------------------------------------------------------
// deviceAPI — push notification token registration
// ----------------------------------------------------------------------------

export const deviceAPI = {
  registerToken: async (token: string) => {
    // Backend expects `token` as a query param (FCM device token)
    const res = await apiClient.post('/user/register-device', null, { params: { token } });
    return res.data;
  },
  unregisterToken: async () => {
    // Clears the FCM token server-side so the user stops receiving push.
    const res = await apiClient.post('/user/unregister-device');
    return res.data;
  },
};

export default apiClient;
