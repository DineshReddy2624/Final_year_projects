/**
 * General utility helper functions for TravelSenseAI
 */

export const formatLatency = (ms) => {
  if (ms === null || ms === undefined) return 'N/A';
  return `${ms} ms`;
};

export const formatTimestamp = (date) => {
  if (!date) return '';
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: true,
  }).format(date);
};

export const formatCurrency = (val) => {
  if (val === null || val === undefined || isNaN(val)) return '₹0';
  return `₹${Number(val).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
};

export const formatDurationMins = (mins) => {
  if (!mins || mins <= 0) return '0 min';
  const hours = Math.floor(mins / 60);
  const remainingMins = Math.round(mins % 60);
  if (hours === 0) return `${remainingMins}m`;
  if (remainingMins === 0) return `${hours}h`;
  return `${hours}h ${remainingMins}m`;
};

export const formatDistanceKm = (km) => {
  if (km === null || km === undefined || isNaN(km)) return '0 km';
  return `${Number(km).toFixed(1)} km`;
};

export const formatDateDisplay = (dateStr) => {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
};

export const getCategoryBadgeColor = (category = '') => {
  const cat = category.toLowerCase();
  if (cat.includes('heritage') || cat.includes('history') || cat.includes('monument') || cat.includes('fort') || cat.includes('palace')) {
    return 'bg-amber-50 text-amber-800 border-amber-200';
  }
  if (cat.includes('food') || cat.includes('cuisine') || cat.includes('restaurant') || cat.includes('dining')) {
    return 'bg-emerald-50 text-emerald-800 border-emerald-200';
  }
  if (cat.includes('museum') || cat.includes('art') || cat.includes('culture')) {
    return 'bg-indigo-50 text-indigo-800 border-indigo-200';
  }
  if (cat.includes('nature') || cat.includes('park') || cat.includes('garden') || cat.includes('lake')) {
    return 'bg-teal-50 text-teal-800 border-teal-200';
  }
  if (cat.includes('shopping') || cat.includes('bazaar') || cat.includes('market')) {
    return 'bg-purple-50 text-purple-800 border-purple-200';
  }
  return 'bg-sky-50 text-sky-800 border-sky-200';
};

export const formatFeasibilityStatus = (status = '') => {
  if (!status) return 'Feasible';
  const clean = status.toLowerCase().replace(/_/g, ' ');
  return clean
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

export const capitalizeWords = (str = '') => {
  if (!str) return '';
  return str.replace(/\b[a-z]/g, (char) => char.toUpperCase());
};

