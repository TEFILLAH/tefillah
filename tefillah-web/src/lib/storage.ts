/**
 * Thin localStorage wrapper for the public web app.
 *
 * Keys are namespaced under `tefillah:` so they don't clash with the
 * admin panel (which uses `admin_*`) or any other apps on the same domain.
 */

const TOKEN_KEY = 'tefillah:auth_token';
const USER_KEY = 'tefillah:auth_user';
const USER_TYPE_KEY = 'tefillah:auth_type';
const THEME_KEY = 'tefillah:theme';
const LANGUAGE_KEY = 'tefillah:language';

export type StoredUserType = 'user' | 'partner' | null;

export const storage = {
  getToken: () => localStorage.getItem(TOKEN_KEY),
  setToken: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  removeToken: () => localStorage.removeItem(TOKEN_KEY),

  getUser: <T = unknown>(): T | null => {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },
  setUser: (user: object) => localStorage.setItem(USER_KEY, JSON.stringify(user)),
  removeUser: () => localStorage.removeItem(USER_KEY),

  getUserType: (): StoredUserType =>
    (localStorage.getItem(USER_TYPE_KEY) as StoredUserType) ?? null,
  setUserType: (type: Exclude<StoredUserType, null>) =>
    localStorage.setItem(USER_TYPE_KEY, type),
  removeUserType: () => localStorage.removeItem(USER_TYPE_KEY),

  getTheme: (): 'light' | 'dark' | null =>
    (localStorage.getItem(THEME_KEY) as 'light' | 'dark' | null) ?? null,
  setTheme: (t: 'light' | 'dark') => localStorage.setItem(THEME_KEY, t),

  getLanguage: () => localStorage.getItem(LANGUAGE_KEY) ?? 'en',
  setLanguage: (lang: string) => localStorage.setItem(LANGUAGE_KEY, lang),

  clearAuth: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(USER_TYPE_KEY);
  },
};
