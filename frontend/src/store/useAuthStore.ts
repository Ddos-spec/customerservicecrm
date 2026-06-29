import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '../lib/api';
import { toast } from 'sonner';

export type UserRole = 'super_admin' | 'admin_agent' | 'agent' | null;

export interface User {
  id: string | number;
  name: string;
  role: UserRole;
  email: string;
  tenant_id?: number | null;
  tenant_name?: string;
  session_id?: string | null; // Tenant's WhatsApp Session ID
  isDemo?: boolean;
  isImpersonating?: boolean;
  originalUser?: {
    id: string | number;
    name: string;
    role: string;
  };
}

interface AuthState {
  user: User | null;
  authToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  // Real Backend Login
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  stopImpersonate: () => Promise<void>;

  // Check session on app load
  checkSession: () => Promise<void>;

  // Demo login (for presentation)
  loginDemo: (user: User) => void;
}

const isDemoLoginEnabled = () => import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO_LOGIN === 'true';

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      authToken: null,
      isAuthenticated: false,
      isLoading: false,

      /**
       * Real backend login
       */
      login: async (email, password) => {
        set({ isLoading: true });
        try {
          const response = await api.post('/admin/login', { email, password });

          if (response.data.success) {
            const userData: User = {
              id: response.data.user.id,
              name: response.data.user.name,
              role: response.data.user.role as UserRole,
              email: response.data.user.email,
              tenant_id: response.data.user.tenant_id,
              tenant_name: response.data.user.tenant_name,
              session_id: response.data.user.session_id,
              isDemo: false,
              isImpersonating: response.data.user.isImpersonating,
              originalUser: response.data.user.originalUser
            };

            const token = typeof response.data.token === 'string' ? response.data.token : null;
            if (token) {
              api.defaults.headers.common.Authorization = `Bearer ${token}`;
            }
            set({ user: userData, authToken: token, isAuthenticated: true, isLoading: false });
            toast.success('Login berhasil!');
            return true;
          } else {
            toast.error(response.data.error || 'Login gagal');
            set({ isLoading: false });
            return false;
          }
        } catch (error: any) {
          const message = error.response?.data?.error || 'Gagal menghubungi server';
          toast.error(message);
          set({ isLoading: false });
          return false;
        }
      },

      stopImpersonate: async () => {
        try {
          const res = await api.post('/admin/stop-impersonate');
          if (res.data.success) {
            const token = typeof res.data.token === 'string' ? res.data.token : get().authToken;
            if (token) {
              api.defaults.headers.common.Authorization = `Bearer ${token}`;
            }
            set({
              user: res.data.user,
              authToken: token,
            });
            toast.success('Kembali ke Super Admin');
            // Force reload to clear any cached tenant data
            window.location.href = '/super-admin'; 
          }
        } catch (error) {
          console.error('Failed to stop impersonate:', error);
          toast.error('Gagal kembali ke akun asli');
        }
      },

      /**
       * Logout - calls backend then clears state
       */
      logout: async () => {
        const { user } = get();

        // Only call backend logout if not demo mode
        if (user && !user.isDemo) {
          try {
            await api.post('/admin/logout');
          } catch {
            // Ignore errors - clear local state anyway
          }
        }

        delete api.defaults.headers.common.Authorization;
        set({ user: null, authToken: null, isAuthenticated: false });
        toast.success('Logout berhasil');
      },

      /**
       * Check if session is still valid on app load
       */
      checkSession: async () => {
        const { user } = get();

        // Demo users never call backend, but production must not keep old demo state.
        if (user?.isDemo) {
          if (isDemoLoginEnabled()) return;
          delete api.defaults.headers.common.Authorization;
          set({ user: null, authToken: null, isAuthenticated: false, isLoading: false });
          return;
        }

        set({ isLoading: true });
        try {
          // Backend session is the single source of truth. This prevents a hard
          // refresh from trusting stale localStorage while impersonating a tenant.
          const response = await api.get('/admin/me');
          if (response.data?.success && response.data?.user) {
            const token = typeof response.data.token === 'string' ? response.data.token : get().authToken;
            if (token) {
              api.defaults.headers.common.Authorization = `Bearer ${token}`;
            }
            set({
              user: { ...response.data.user, isDemo: false },
              authToken: token,
              isAuthenticated: true,
              isLoading: false,
            });
            return;
          }

          delete api.defaults.headers.common.Authorization;
          set({ user: null, authToken: null, isAuthenticated: false, isLoading: false });
        } catch (error: any) {
          const status = error?.response?.status;
          if (status === 401 || status === 403) {
            delete api.defaults.headers.common.Authorization;
            set({ user: null, authToken: null, isAuthenticated: false, isLoading: false });
            return;
          }

          // Network hiccup: keep current local state, but stop blocking UI.
          set({ isLoading: false });
        }
      },

      /**
       * Demo login - bypasses backend
       */
      loginDemo: (demoUser: User) => {
        if (!isDemoLoginEnabled()) {
          toast.error('Demo login dinonaktifkan di production');
          return;
        }
        delete api.defaults.headers.common.Authorization;
        set({
          user: { ...demoUser, isDemo: true },
          authToken: null,
          isAuthenticated: true
        });
        toast.success(`Demo login sebagai ${demoUser.name}`);
      }
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        authToken: state.authToken,
        isAuthenticated: state.isAuthenticated
      }),
    }
  )
);
