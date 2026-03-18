import { create } from 'zustand';

interface User { id: string; email: string; displayName: string; role: string; tenantId: string; avatarUrl: string | null; }
interface Tenant { id: string; name: string; slug: string; plan: string; }
interface AuthState { accessToken: string | null; refreshToken: string | null; user: User | null; tenant: Tenant | null; isAuthenticated: boolean; setTokens: (a: string, r: string) => void; setAuth: (d: { accessToken: string; refreshToken: string; user: User; tenant?: Tenant }) => void; logout: () => void; }

const KEY = 'etip_auth';
function load(): Partial<AuthState> { try { const r = localStorage.getItem(KEY); if (!r) return {}; const p = JSON.parse(r); if (p.accessToken) return { accessToken: p.accessToken, refreshToken: p.refreshToken, user: p.user, tenant: p.tenant, isAuthenticated: true }; } catch { localStorage.removeItem(KEY); } return {}; }
function save(s: Partial<AuthState>) { try { localStorage.setItem(KEY, JSON.stringify({ accessToken: s.accessToken, refreshToken: s.refreshToken, user: s.user, tenant: s.tenant })); } catch { /* storage full or unavailable — non-critical */ } }

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null, refreshToken: null, user: null, tenant: null, isAuthenticated: false, ...load(),
  setTokens: (a, r) => set((s) => { const n = { ...s, accessToken: a, refreshToken: r }; save(n); return n; }),
  setAuth: (d) => { const n = { accessToken: d.accessToken, refreshToken: d.refreshToken, user: d.user, tenant: d.tenant ?? null, isAuthenticated: true }; save(n); set(n); },
  logout: () => { localStorage.removeItem(KEY); set({ accessToken: null, refreshToken: null, user: null, tenant: null, isAuthenticated: false }); },
}));
