import { create } from 'zustand';

export type UserRole = 'super_admin' | 'admin_agent' | 'agent' | null;

export interface User {
  id: string;
  name: string;
  role: UserRole;
  email: string;
  tenantName?: string; // Tambahan untuk tahu dia kerja di toko mana
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  login: (userData: User) => void; // Login sekarang terima object User lengkap
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  login: (userData) => {
    set({ user: userData, isAuthenticated: true });
  },
  logout: () => set({ user: null, isAuthenticated: false }),
}));