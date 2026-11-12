import api from './api';

export const liveTripService = {
  /**
   * Dynamically recalculate remaining itinerary stops based on live traveler GPS, clock time, and delays.
   */
  async recalculateSchedule(payload) {
    const response = await api.post('/live-trip/recalculate', payload);
    return response.data;
  },

  /**
   * Find nearby points-of-interest (fuel, food, cafe, rest stop, medical) around current GPS.
   */
  async getNearbyPlaces(latitude, longitude, category = 'fuel', radiusMeters = 5000, limit = 8) {
    const response = await api.get('/live-trip/nearby', {
      params: {
        latitude,
        longitude,
        category,
        radius_meters: radiusMeters,
        limit,
      },
    });
    return response.data;
  },
};

export default liveTripService;

