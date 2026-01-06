import axios from 'axios';

// Gunakan Environment Variable jika ada (Production), jika tidak pakai relative (Local Proxy)
const baseURL = import.meta.env.VITE_API_URL || '/';

const api = axios.create({
  baseURL: baseURL,
  withCredentials: true, // PENTING: Agar cookie session tersimpan (CORS)
  headers: {
    'Content-Type': 'application/json',
  },
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