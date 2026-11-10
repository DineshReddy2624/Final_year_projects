import apiClient from './api';

export const authService = {
  async register({ fullName, email, password }) {
    const response = await apiClient.post('/auth/register', {
      full_name: fullName,
      username: fullName,
      email,
      password,
    });
    return response.data;
  },

  async login({ email, password }) {
    const response = await apiClient.post('/auth/login', {
      email,
      password,
    });
    return response.data;
  },

  async logout() {
    try {
      const response = await apiClient.post('/auth/logout');
      return response.data;
    } catch (e) {
      // Even if token was invalid on server, clear local state
      return { status: 'success', message: 'Logged out locally' };
    }
  },

  async getProfile() {
    const response = await apiClient.get('/users/profile');
    return response.data;
  },

  async updateProfile({ fullName, preferences }) {
    const response = await apiClient.put('/users/profile', {
      full_name: fullName,
      preferences,
    });
    return response.data;
  },
};

export default authService;

