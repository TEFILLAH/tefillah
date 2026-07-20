import axios, { AxiosError } from 'axios';
import { storage } from '../lib/storage';

/**
 * API client for tefillah.in (the public web app).
 *
 * Connects to the same FastAPI backend as the mobile app and the admin panel.
 * Base URL comes from VITE_API_URL (e.g. https://api.tefillah.in/api), falling
 * back to production. JWT is stored in localStorage under `tefillah:auth_token`.
 *
 * Mirrors the mobile app's `frontend/src/api/client.ts` so screens can be
 * ported with minimal API-call changes.
 */

const API_URL = import.meta.env.VITE_API_URL || 'https://api.tefillah.in/api';

export const apiClient = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 60000,
});

apiClient.interceptors.request.use((config) => {
  const token = storage.getToken();
  if (token) {
    config.headers = config.headers ?? {};
    (config.headers as Record<string, string>).Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      // Session expired/revoked: clear credentials and, if the user is on a
      // protected page, bounce to login so the UI can't get stuck in a zombie
      // half-logged-in state (Header still showing "Sign out", pages erroring).
      storage.clearAuth();
      const path = window.location.pathname;
      const onPublicOrAdmin =
        ['/', '/login', '/signup', '/verify', '/complete-profile', '/forgot-password', '/partner/login', '/partner/signup', '/about', '/privacy', '/terms', '/delete-account'].includes(path) ||
        path.startsWith('/admin');
      if (!onPublicOrAdmin) {
        window.location.assign(path.startsWith('/partner') ? '/partner/login' : '/login');
      }
    }
    return Promise.reject(error);
  },
);

// ----------------------------------------------------------------------------
// Public (no auth required)
// ----------------------------------------------------------------------------

export const publicAPI = {
  generateVerse: async (language: string = 'en') => {
    const res = await apiClient.get('/verse/generate', { params: { language } });
    return res.data as { verse: string; reference: string };
  },
};

// ----------------------------------------------------------------------------
// Auth (users)
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

export const authAPI = {
  login: async (email: string, password: string) => {
    const res = await apiClient.post('/auth/login', { email, password });
    return res.data;
  },

  register: async (data: RegisterPayload) => {
    const res = await apiClient.post('/auth/register', data);
    return res.data;
  },

  // Google sign-in: send the Firebase ID token; backend returns a session.
  // A brand-new user comes back with phone/location null → finish on /complete-profile.
  socialAuth: async (firebase_token: string) => {
    const res = await apiClient.post('/auth/social', { firebase_token });
    return res.data;
  },

  completeSocialAuth: async (data: {
    email: string;
    name: string;
    phone: string;
    location_city: string;
    location_country: string;
    address?: string;
    is_agent?: boolean;
  }) => {
    const res = await apiClient.post('/auth/social/complete', data);
    return res.data;
  },

  getMe: async () => {
    const res = await apiClient.get('/auth/me');
    return res.data;
  },

  verifyEmail: async (email: string, code: string) => {
    const res = await apiClient.post('/auth/verify-email', { email, code });
    return res.data;
  },

  resendVerification: async (email: string) => {
    const res = await apiClient.post('/auth/resend-verification', { email });
    return res.data;
  },

  forgotPassword: async (email: string) => {
    const res = await apiClient.post('/auth/forgot-password', { email });
    return res.data;
  },

  resetPassword: async (email: string, code: string, new_password: string) => {
    const res = await apiClient.post('/auth/reset-password', { email, code, new_password });
    return res.data;
  },

  changePassword: async (current_password: string, new_password: string) => {
    const res = await apiClient.put('/auth/change-password', { current_password, new_password });
    return res.data;
  },

  // Switch between a person's user and partner accounts (both must be verified).
  switchAvailability: async () => {
    const res = await apiClient.get('/auth/switch-availability');
    return res.data as { can_switch: boolean; target_type: 'user' | 'partner' | null };
  },

  switchAccount: async () => {
    const res = await apiClient.post('/auth/switch-account');
    return res.data as { access_token: string; user_type: 'user' | 'partner'; account: Record<string, unknown> };
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

  // Discard a staged email change so the confirmation prompt goes away.
  cancelEmailChange: async () => {
    const res = await apiClient.post('/user/cancel-email-change');
    return res.data as { message: string };
  },

  // Permanently delete the signed-in account + its data (in-app deletion required
  // by Google Play + Apple App Store). Works for users and partners.
  deleteAccount: async () => {
    const res = await apiClient.delete('/me');
    return res.data as { message: string };
  },

  // Upload/replace the signed-in user's profile photo (multipart). Uses fetch so the
  // browser sets the multipart boundary; axios' default JSON content-type would break it.
  uploadPhoto: async (file: Blob, filename = 'avatar.jpg') => {
    const token = storage.getToken();
    const form = new FormData();
    form.append('file', file, filename);
    const res = await fetch(`${API_URL}/user/profile/photo`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: form,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { detail?: string }).detail || 'Could not upload the photo.');
    }
    return (await res.json()) as { profile_photo_url: string };
  },
};

// ----------------------------------------------------------------------------
// Prayer (submit + history)
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

export interface PrayerSubmitResponse {
  message?: string;
  prayer_id: string;
  category: string;
  comfort_message: string;
  bible_verse: string;
  bible_reference: string;
}

export interface PrayerHistoryItem {
  id: string;
  content: string;
  category: string;
  status: string;
  submitted_at: string;
  comfort_message?: string;
  bible_verse?: string;
  bible_reference?: string;
}

export const prayerAPI = {
  submit: async (data: PrayerSubmitPayload) => {
    const res = await apiClient.post<PrayerSubmitResponse>('/prayer/submit', data);
    return res.data;
  },

  guestSubmit: async (data: PrayerSubmitPayload) => {
    const res = await apiClient.post<PrayerSubmitResponse>('/prayer/guest-submit', data);
    return res.data;
  },

  getHistory: async (): Promise<PrayerHistoryItem[]> => {
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
// Partner (prayer warriors)
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
    return res.data as PartnerStats;
  },

  // Fetch the partner's requests for a given bucket:
  //   new = assigned but unopened · assigned = opened <24h · pending = opened ≥24h, no response · prayed = completed
  // Omit `bucket` to get the partner's full history (the "Total Prayers" view).
  getRequests: async (bucket?: string, page: number = 1, limit: number = 20) => {
    const params: Record<string, unknown> = { page, limit };
    if (bucket) params.bucket = bucket;
    const res = await apiClient.get('/partner/requests', { params });
    return res.data;
  },

  // Mark a "New" request as opened — moves it to Assigned and starts its 24h + 60-min timers.
  markSeen: async (prayerId: string) => {
    const res = await apiClient.post(`/partner/requests/${prayerId}/seen`);
    return res.data;
  },

  markPrayed: async (prayerId: string, minutes: number = 5) => {
    const res = await apiClient.post(
      `/partner/requests/${prayerId}/mark-prayed`,
      null,
      { params: { prayer_duration_minutes: minutes } },
    );
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

export interface PartnerStats {
  total_prayers_received: number;
  prayers_completed: number;
  prayers_pending: number;
  prayers_new: number;
  prayers_assigned: number;
  prayers_overdue: number;
  average_response_time_hours: number;
  total_prayer_time_minutes: number;
  response_rate: number;
  weekly_activity: Array<{ date: string; count: number }>;
  monthly_trend: Array<{ date: string; count: number }>;
}

// ----------------------------------------------------------------------------
// Web push (FCM) — register the browser's FCM token so the backend can push.
// Works for both users and partners (the backend resolves the caller's type).
// ----------------------------------------------------------------------------

export const pushAPI = {
  registerDevice: async (token: string) => {
    const res = await apiClient.post('/user/register-device', null, { params: { token } });
    return res.data;
  },
};

// ----------------------------------------------------------------------------
// Notifications
// ----------------------------------------------------------------------------

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
}

export const notificationsAPI = {
  getAll: async (page: number = 1) => {
    const res = await apiClient.get('/user/notifications', { params: { page } });
    return res.data as { notifications: AppNotification[]; unread_count: number };
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

export default apiClient;
