import { create } from 'zustand';
import api from '../lib/api';
import { toast } from 'sonner';

export type UserRole = 'super_admin' | 'admin_agent' | 'user_agent' | 'agent' | null;

export interface User {
  id: string;
  name: string;
  role: any; // Use any temporarily for flexibility in demo
  email: string;
  tenantName?: string;
  isDemo?: boolean; // Flag to identify demo mode
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  token: string | null;
  
  // Real Backend Login
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,
  token: null,

  login: async (email, password) => {
    set({ isLoading: true });
    try {
      const response = await api.post('/admin/login', { email, password });
      
      if (response.data.success) {
        const userData: User = {
            id: response.data.email,
            name: response.data.email.split('@')[0],
            role: response.data.role === 'admin' ? 'super_admin' : 'admin_agent',
            email: response.data.email
        };

        set({ user: userData, isAuthenticated: true, isLoading: false, token: 'server-token' });
        toast.success('Login Berhasil');
        return true;
      } else {
        toast.error('Login Gagal');
        set({ isLoading: false });
        return false;
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Gagal menghubungi server');
      set({ isLoading: false });
      return false;
    }
  },

  logout: async () => {
    try {
        await api.post('/admin/logout');
    } catch { /* ignore */ }
    set({ user: null, isAuthenticated: false, token: null });
  },
}));
