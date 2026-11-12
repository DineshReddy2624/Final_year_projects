import apiClient from './api';

export const locationService = {
  /**
   * Search location suggestions via live debounced autocomplete
   * @param {string} query Search string
   * @param {number} limit Maximum suggestions
   * @param {AbortSignal} [signal] Axios abort signal
   * @returns {Promise<Array>} List of LocationItems
   */
  async autocomplete(query, limit = 6, signal = null) {
    if (!query || !query.trim()) {
      return [];
    }

    const response = await apiClient.get('/locations/autocomplete', {
      params: { q: query.trim(), limit },
      signal,
    });

    return response.data?.results || [];
  },

  /**
   * Reverse geocode map coordinates into human-readable address
   * @param {number} lat Latitude
   * @param {number} lon Longitude
   * @returns {Promise<Object>} LocationItem
   */
  async reverseGeocode(lat, lon) {
    const response = await apiClient.get('/locations/reverse', {
      params: { lat, lon },
    });

    return response.data?.location || null;
  },

  /**
   * Calculate road route preview metrics between two sets of coordinates
   * @param {Object} params
   * @param {number} params.sourceLat
   * @param {number} params.sourceLon
   * @param {number} params.destLat
   * @param {number} params.destLon
   * @param {string} [params.profile]
   * @returns {Promise<Object>} RoutePreviewResponse
   */
  async getRoutePreview({ sourceLat, sourceLon, destLat, destLon, profile = 'driving-car' }) {
    const response = await apiClient.post('/locations/route-preview', {
      source_latitude: sourceLat,
      source_longitude: sourceLon,
      dest_latitude: destLat,
      dest_longitude: destLon,
      profile,
    });

    return response.data;
  },

  /**
   * Fetch comprehensive vehicle-specific route assistance from Source to all Destinations
   * @param {Object} params
   * @param {Object} params.source
   * @param {Array<Object>} params.destinations
   * @param {string} [params.profile] 'driving-car' | 'cycling-regular' | 'foot-walking'
   * @returns {Promise<Object>} RouteAssistanceResponse
   */
  async getRouteAssistance({ source, destinations, profile = 'driving-car' }) {
    const response = await apiClient.post('/locations/route-assistance', {
      source,
      destinations,
      profile,
    });

    return response.data;
  },
};

export default locationService;

