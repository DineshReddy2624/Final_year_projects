import axios from 'axios';

// Resolve backend base URL from environment variable
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8005/api';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

// Request Interceptor: Attach JWT Bearer Token if present
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('travelsense_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    console.error('[API Request Error]:', error);
    return Promise.reject(error);
  }
);

// Response Interceptor: Normalize error payloads
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const detail = error.response?.data?.detail;
    let message = 'An unexpected server error occurred';

    if (typeof detail === 'string') {
      message = detail;
    } else if (Array.isArray(detail)) {
      message = detail
        .map((d) => {
          const loc = Array.isArray(d.loc) ? d.loc.filter((x) => x !== 'body').join('.') : '';
          const msg = d.msg || d.message || JSON.stringify(d);
          return loc ? `${loc}: ${msg}` : msg;
        })
        .join(', ');
    } else if (error.response?.data?.message) {
      message = error.response.data.message;
    } else if (error.message) {
      message = error.message;
    }

    const errorDetails = {
      message,
      status: error.response?.status,
      data: error.response?.data,
    };

    console.error('[API Response Error]:', errorDetails);
    return Promise.reject(errorDetails);
  }
);

export default apiClient;
export { API_BASE_URL };
