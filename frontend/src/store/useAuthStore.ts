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
  tenant_session_id?: string | null;
  isDemo?: boolean;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  // Real Backend Login
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;

  // Check session on app load
  checkSession: () => Promise<void>;

  // Demo login (for presentation)
  loginDemo: (user: User) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
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
              tenant_session_id: response.data.user.tenant_session_id,
              isDemo: false
            };

            set({ user: userData, isAuthenticated: true, isLoading: false });
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

        set({ user: null, isAuthenticated: false });
        toast.success('Logout berhasil');
      },

      /**
       * Check if session is still valid on app load
       */
      checkSession: async () => {
        const { user } = get();

        // Skip check for demo users
        if (user?.isDemo) return;

        // Skip if not authenticated
        if (!user) return;

        try {
          const response = await api.get('/admin/check');
          if (!response.data.authenticated) {
            // Session expired
            set({ user: null, isAuthenticated: false });
          }
        } catch {
          // Network error - keep local state for now
        }
      },

      /**
       * Demo login - bypasses backend
       */
      loginDemo: (demoUser: User) => {
        set({
          user: { ...demoUser, isDemo: true },
          isAuthenticated: true
        });
        toast.success(`Demo login sebagai ${demoUser.name}`);
      }
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated
      }),
    }
  )
);
