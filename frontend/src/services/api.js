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
    const rawErrors = error.response?.data?.detail || error.response?.data?.details;
    let message = 'An unexpected server error occurred';

    if (typeof rawErrors === 'string') {
      message = rawErrors;
    } else if (Array.isArray(rawErrors) && rawErrors.length > 0) {
      message = rawErrors
        .map((d) => {
          const loc = Array.isArray(d.loc)
            ? d.loc.filter((x) => x !== 'body').join('.')
            : typeof d.loc === 'string' ? d.loc : '';
          const msg = d.msg || d.message || JSON.stringify(d);
          const fieldName = loc ? loc.replace(/_/g, ' ') : '';
          return fieldName ? `${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)}: ${msg}` : msg;
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
