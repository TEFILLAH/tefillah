import axios, { AxiosError } from 'axios';

/**
 * Admin API client for the /admin/* section of tefillah.in.
 *
 * Entirely separate from the public `src/api/client.ts`:
 *  - its own axios instance
 *  - its own token key in localStorage (`tefillah:admin_token`) so an admin
 *    session never collides with a regular user/partner session
 *  - on 401 it clears the admin token only; the AdminProtectedRoute then
 *    bounces to /admin/login
 *
 * Talks to the same FastAPI backend (api.tefillah.in) under /api/admin/*.
 */

const API_URL = import.meta.env.VITE_API_URL || 'https://api.tefillah.in/api';
const ADMIN_TOKEN_KEY = 'tefillah:admin_token';
const ADMIN_USER_KEY = 'tefillah:admin_user';

export const adminStorage = {
  getToken: () => localStorage.getItem(ADMIN_TOKEN_KEY),
  setToken: (t: string) => localStorage.setItem(ADMIN_TOKEN_KEY, t),
  removeToken: () => localStorage.removeItem(ADMIN_TOKEN_KEY),
  getUser: <T = unknown>(): T | null => {
    const raw = localStorage.getItem(ADMIN_USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },
  setUser: (u: object) => localStorage.setItem(ADMIN_USER_KEY, JSON.stringify(u)),
  clear: () => {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    localStorage.removeItem(ADMIN_USER_KEY);
  },
};

export const adminClient = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 60000,
});

adminClient.interceptors.request.use((config) => {
  const token = adminStorage.getToken();
  if (token) {
    config.headers = config.headers ?? {};
    (config.headers as Record<string, string>).Authorization = `Bearer ${token}`;
  }
  return config;
});

adminClient.interceptors.response.use(
  (res) => res,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      adminStorage.clear();
      // Bounce an expired/revoked admin session to login instead of leaving a
      // broken dashboard where every call 401s with no re-auth path.
      if (!window.location.pathname.startsWith('/admin/login')) {
        window.location.assign('/admin/login');
      }
    }
    return Promise.reject(error);
  },
);

// ---------------------------------------------------------------------------
// Types — mirror the backend response shapes verbatim
// ---------------------------------------------------------------------------

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  is_super_admin: boolean;
  is_admin: boolean;
  permissions: string[];
}

export interface AdminStats {
  total_users: number;
  total_partners: number;
  total_prayers: number;
  prayers_pending: number;
  prayers_assigned: number;
  prayers_completed: number;
  total_llm_requests: number;
  llm_tokens_used: number;
  active_users_today: number;
  active_partners_today: number;
  new_users_this_week: number;
  new_partners_this_week: number;
  users_active: number;
  users_suspended: number;
  partners_active: number;
  partners_inactive: number;
  partners_pending_approval: number;
}

export interface UserRow {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  location_city?: string | null;
  location_country?: string | null;
  is_verified: boolean;
  status: string;
  profile_photo_url?: string | null;
  created_at: string;
  last_login?: string | null;
}

export interface PartnerRow {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  organization?: string | null;
  partner_type: string;
  location_city: string;
  location_country: string;
  cell_name?: string | null;
  is_verified: boolean;
  is_active: boolean;
  status: string;
  profile_photo_url?: string | null;
  prayers_handled: number;
  prayer_capacity: number;
  assigned_prayers_count: number;
  response_rate: number;
  created_at: string;
  last_active?: string | null;
}

export interface PrayerRow {
  id: string;
  user_id?: string | null;
  user_name?: string | null;
  user_email?: string | null;
  user_phone?: string | null;
  content: string;
  category?: string | null;
  status: string;
  is_anonymous: boolean;
  assigned_partner_id?: string | null;
  partner_name?: string | null;
  partner_email?: string | null;
  partner_phone?: string | null;
  location_city?: string | null;
  location_country?: string | null;
  submitted_at: string;
  assigned_at?: string | null;
  prayed_at?: string | null;
}

export interface AdminRow {
  id: string;
  name: string;
  email: string;
  is_super_admin: boolean;
  permissions: string[];
  created_at: string;
  last_login?: string | null;
}

export interface ActivityLog {
  id: string;
  action: string;
  actor_type: string;
  actor_name: string;
  target_type?: string | null;
  target_id?: string | null;
  details?: Record<string, unknown> | null;
  ip_address?: string | null;
  timestamp: string;
}

export interface AnalyticsData {
  user_registrations: { date: string; count: number }[];
  prayer_submissions: { date: string; count: number }[];
  partner_registrations?: { date: string; count: number }[];
  prayer_completions?: { date: string; count: number }[];
  prayer_categories: { category: string; count: number }[];
  llm_usage: { date: string; requests: number; tokens: number }[];
}

export interface PartnerForAssignment {
  id: string;
  name: string;
  email: string;
  location_city: string;
  location_country: string;
  cell_name?: string | null;
  prayer_capacity: number;
  assigned_prayers_count: number;
  available_slots: number;
}

interface Paged {
  total: number;
  page: number;
  limit: number;
}

// ---------------------------------------------------------------------------
// API surface
// ---------------------------------------------------------------------------

export const adminApi = {
  login: async (email: string, password: string) => {
    const res = await adminClient.post('/admin/login', { email, password });
    return res.data as {
      access_token: string;
      admin: AdminUser;
      user_type: string;
    };
  },

  getStats: async () => {
    const res = await adminClient.get('/admin/stats');
    return res.data as AdminStats;
  },

  getAnalytics: async (period: 'day' | 'week' | 'month' = 'week') => {
    const res = await adminClient.get('/admin/analytics', { params: { period } });
    return res.data as AnalyticsData;
  },

  getUsers: async (params: { search?: string; status?: string; page?: number; limit?: number } = {}) => {
    const res = await adminClient.get('/admin/users', { params });
    return res.data as Paged & { users: UserRow[] };
  },

  updateUser: async (id: string, params: { status?: string; is_verified?: boolean; name?: string; email?: string }) => {
    const res = await adminClient.put(`/admin/users/${id}`, null, { params });
    return res.data;
  },

  deleteUser: async (id: string) => {
    const res = await adminClient.delete(`/admin/users/${id}`);
    return res.data;
  },

  getPartners: async (params: { search?: string; status?: string; page?: number; limit?: number } = {}) => {
    const res = await adminClient.get('/admin/partners', { params });
    return res.data as Paged & { partners: PartnerRow[] };
  },

  updatePartner: async (
    id: string,
    params: { is_active?: boolean; is_verified?: boolean; status?: string; prayer_capacity?: number; name?: string; email?: string },
  ) => {
    const res = await adminClient.put(`/admin/partners/${id}`, null, { params });
    return res.data;
  },

  approvePartner: async (id: string) => {
    const res = await adminClient.post(`/admin/partners/${id}/approve`);
    return res.data;
  },

  deletePartner: async (id: string) => {
    const res = await adminClient.delete(`/admin/partners/${id}`);
    return res.data;
  },

  getPrayers: async (params: { search?: string; status?: string; category?: string; page?: number; limit?: number } = {}) => {
    const res = await adminClient.get('/admin/prayers', { params });
    return res.data as Paged & { prayers: PrayerRow[] };
  },

  // Lightweight list of active, verified partners (with capacity) for the
  // assignment dropdown.
  getPartnersForAssignment: async () => {
    const res = await adminClient.get('/admin/partners-for-assignment');
    return res.data as { partners: PartnerForAssignment[] };
  },

  // Assign a prayer to a partner. partner_id is a query param on the backend.
  assignPrayer: async (prayerId: string, partnerId: string) => {
    const res = await adminClient.post(`/admin/prayers/${prayerId}/assign`, null, {
      params: { partner_id: partnerId },
    });
    return res.data;
  },

  // Release a prayer back to the pending pool.
  unassignPrayer: async (prayerId: string) => {
    const res = await adminClient.post(`/admin/prayers/${prayerId}/unassign`);
    return res.data;
  },

  // Delete a prayer. There is no single-delete endpoint, so we use the bulk
  // endpoint with one id (super-admin only on the backend).
  deletePrayer: async (prayerId: string) => {
    const res = await adminClient.post('/admin/bulk/prayers', {
      action: 'delete',
      prayer_ids: [prayerId],
    });
    return res.data as { success: number; failed: number; action: string };
  },

  getAdmins: async () => {
    const res = await adminClient.get('/admin/admins');
    return res.data as { admins: AdminRow[] };
  },

  getActivityLogs: async (params: { action?: string; actor_type?: string; page?: number; limit?: number } = {}) => {
    const res = await adminClient.get('/admin/activity-logs', { params });
    return res.data as Paged & { logs: ActivityLog[] };
  },
};

export function adminErr(err: unknown, fallback: string): string {
  if (typeof err === 'object' && err !== null && 'response' in err) {
    const r = (err as { response?: { data?: { detail?: string } } }).response;
    if (r?.data?.detail) return r.data.detail;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}
