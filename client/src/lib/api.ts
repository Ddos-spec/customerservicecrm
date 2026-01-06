import axios from 'axios';

// Create Axios instance
const api = axios.create({
  baseURL: '/', // Use relative path to leverage Vite Proxy
  headers: {
    'Content-Type': 'application/json',
  },
});

// Response interceptor for global error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Handle 401 Unauthorized (Session Expired)
    if (error.response && error.response.status === 401) {
      console.warn('Session expired or unauthorized. Redirecting to login...');
      // Optional: Trigger logout action here if store is accessible
      // window.location.href = '/login'; 
    }
    return Promise.reject(error);
  }
);

export default api;