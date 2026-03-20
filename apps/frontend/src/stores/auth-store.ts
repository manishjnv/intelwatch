/**
 * @module stores/auth-store
 * @description Zustand store for auth state.
 * Persists tokens to localStorage. Auto-clears on logout.
 */
import { create } from 'zustand';

interface User {
  id: string;
  email: string;
  displayName: string;
  role: string;
  tenantId: string;
  avatarUrl: string | null;
}

interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: string;
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: User | null;
  tenant: Tenant | null;
  isAuthenticated: boolean;

  setTokens: (access: string, refresh: string) => void;
  setAuth: (data: { accessToken: string; refreshToken: string; user: User; tenant?: Tenant }) => void;
  setUser: (user: User) => void;
  logout: () => void;
}

const STORAGE_KEY = 'etip_auth';

function loadPersistedState(): Partial<AuthState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as {
      accessToken?: string;
      refreshToken?: string;
      user?: User;
      tenant?: Tenant;
    };
    if (parsed.accessToken) {
      return {
        accessToken: parsed.accessToken,
        refreshToken: parsed.refreshToken ?? null,
        user: parsed.user ?? null,
        tenant: parsed.tenant ?? null,
        isAuthenticated: true,
      };
    }
  } catch {
    // Corrupted storage — clear it
    localStorage.removeItem(STORAGE_KEY);
  }
  return {};
}

function persistState(state: Partial<AuthState>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      accessToken: state.accessToken,
      refreshToken: state.refreshToken,
      user: state.user,
      tenant: state.tenant,
    }));
  } catch {
    // Storage full or unavailable — ignore
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  refreshToken: null,
  user: null,
  tenant: null,
  isAuthenticated: false,
  ...loadPersistedState(),

  setTokens: (access, refresh) => {
    set((state) => {
      const newState = { ...state, accessToken: access, refreshToken: refresh };
      persistState(newState);
      return newState;
    });
  },

  setAuth: (data) => {
    const newState = {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      user: data.user,
      tenant: data.tenant ?? null,
      isAuthenticated: true,
    };
    persistState(newState);
    set(newState);
  },

  setUser: (user) => {
    set((state) => {
      const newState = { ...state, user };
      persistState(newState);
      return newState;
    });
  },

  logout: () => {
    localStorage.removeItem(STORAGE_KEY);
    set({
      accessToken: null,
      refreshToken: null,
      user: null,
      tenant: null,
      isAuthenticated: false,
    });
  },
}));
