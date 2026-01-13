import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ThemeState {
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  setDarkMode: (value: boolean) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      isDarkMode: false,
      toggleDarkMode: () => set((state) => {
        const newValue = !state.isDarkMode;
        // Apply to document + body to ensure all selectors react
        document.documentElement.classList.toggle('dark', newValue);
        document.body.classList.toggle('dark', newValue);
        return { isDarkMode: newValue };
      }),
      setDarkMode: (value) => set(() => {
        document.documentElement.classList.toggle('dark', value);
        document.body.classList.toggle('dark', value);
        return { isDarkMode: value };
      }),
    }),
    {
      name: 'theme-storage',
      onRehydrateStorage: () => (state) => {
        // Apply theme on page load
        if (state?.isDarkMode) {
          document.documentElement.classList.add('dark');
        }
      },
    }
  )
);
