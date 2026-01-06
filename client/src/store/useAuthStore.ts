import { create } from 'zustand';
import api from '../lib/api';
import { toast } from 'sonner';

export type UserRole = 'super_admin' | 'admin_agent' | 'agent' | null;

export interface User {
  id: string;
  name: string;
  role: UserRole;
  email: string;
  tenantName?: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  
  // Manual session set (untuk Demo)
  setSession: (userData: User) => void;
  
  // Real Backend Login
  loginReal: (email: string, password: string) => Promise<boolean>;
  
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,

  setSession: (userData) => {
    set({ user: userData, isAuthenticated: true });
  },

  loginReal: async (email, password) => {
    set({ isLoading: true });
    try {
      const response = await api.post('/admin/login', { email, password });
      
      if (response.data.success) {
        // Mapping response backend ke format User frontend
        const userData: User = {
            id: response.data.email, // Backend belum kirim ID, pakai email dulu
            name: response.data.email.split('@')[0], // Fallback name
            role: response.data.role === 'admin' ? 'super_admin' : 'agent', // Mapping role simpel
            email: response.data.email
        };

        set({ user: userData, isAuthenticated: true, isLoading: false });
        toast.success('Login Berhasil (Terhubung ke Server)');
        return true;
      } else {
        toast.error('Login Gagal: Kredensial salah');
        set({ isLoading: false });
        return false;
      }
    } catch (error: any) {
      console.error('Login error:', error);
      toast.error(error.response?.data?.message || 'Gagal menghubungi server backend');
      set({ isLoading: false });
      return false;
    }
  },

  logout: async () => {
    try {
        await api.post('/admin/logout'); // Tell backend to destroy session
    } catch (e) {
        // Ignore logout error
    }
    set({ user: null, isAuthenticated: false });
  },
}));

// Backward compatibility alias (biar code lama ga error)
export const useAuthStoreLegacy = useAuthStore;