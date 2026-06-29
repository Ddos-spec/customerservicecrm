import axios from 'axios';

// Gunakan Environment Variable jika ada (Production), jika tidak pakai relative (Local Proxy)
// VITE_API_URL should be the backend URL, e.g., https://backend.example.com/api/v1
const baseURL = import.meta.env.VITE_API_URL || '/api/v1';

const api = axios.create({
  baseURL: baseURL,
  withCredentials: true, // PENTING: Agar cookie session tersimpan (CORS)
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 60000, // 10 second timeout
});

const getStoredAuthToken = () => {
  try {
    const raw = localStorage.getItem('auth-storage');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const token = parsed?.state?.authToken;
    return typeof token === 'string' && token.trim() ? token.trim() : null;
  } catch {
    return null;
  }
};

api.interceptors.request.use((config: any) => {
  const token = getStoredAuthToken();
  if (token && !config.headers?.Authorization) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response: any) => response,
  (error: any) => {
    if (error.response?.status === 401) {
      console.warn('Session expired or unauthorized.');
    }
    return Promise.reject(error);
  }
);

export default api;
