import api from './api';

const reportService = {
  /**
   * Request backend ReportLab PDF generation and analytics computation.
   * @param {Object} payload - { itinerary_id, itinerary_data, title, planning_notes }
   * @returns {Promise<Object>} ReportMetadataResponse
   */
  async generateReport(payload) {
    const response = await api.post('/reports/generate', payload);
    return response.data;
  },

  /**
   * Retrieve metadata and visual analytics for a previously generated report.
   * @param {string} reportId
   * @returns {Promise<Object>} ReportMetadataResponse
   */
  async getReport(reportId) {
    const response = await api.get(`/reports/${reportId}`);
    return response.data;
  },

  /**
   * Download the generated PDF directly as a binary blob.
   * @param {string} reportId
   * @param {string} destination
   */
  async downloadReportPdf(reportId, destination = 'trip') {
    const response = await api.get(`/reports/${reportId}/download`, {
      responseType: 'blob',
    });

    // Create a blob link and trigger download in browser
    const blob = new Blob([response.data], { type: 'application/pdf' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const cleanDest = destination.toLowerCase().replace(/\s+/g, '_');
    link.setAttribute('download', `TravelSenseAI_${cleanDest}_dossier_${reportId}.pdf`);
    document.body.appendChild(link);
    link.click();
    link.parentNode.removeChild(link);
    window.URL.revokeObjectURL(url);
  },

  /**
   * Get direct download URL for the report.
   * @param {string} reportId
   * @returns {string}
   */
  getDownloadUrl(reportId) {
    const baseURL = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || 'http://127.0.0.1:8005/api';
    return `${baseURL}/reports/${reportId}/download`;
  },
};

export default reportService;

