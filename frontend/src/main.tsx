import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';

// Apply saved theme before React renders to avoid flicker and ensure dark class is set
try {
  const raw = localStorage.getItem('theme-storage');
  if (raw) {
    const parsed = JSON.parse(raw);
    const isDark = Boolean(parsed?.state?.isDarkMode);
    document.documentElement.classList.toggle('dark', isDark);
    document.body.classList.toggle('dark', isDark);
  }
} catch (err) {
  // ignore parse errors, fallback to light
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
