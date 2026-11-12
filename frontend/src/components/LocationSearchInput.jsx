import React, { useState, useEffect, useRef } from 'react';
import {
  MapPin,
  Navigation,
  Search,
  X,
  Map as MapIcon,
  Loader2,
  Plane,
  Train,
  Building2,
  Landmark,
  Compass,
  Check,
  LocateFixed,
} from 'lucide-react';
import locationService from '../services/locationService';

// Category icon helper
const getCategoryIcon = (category) => {
  switch (category) {
    case 'airport':
      return <Plane className="w-3.5 h-3.5 text-blue-500" />;
    case 'station':
      return <Train className="w-3.5 h-3.5 text-orange-500" />;
    case 'hotel':
      return <Building2 className="w-3.5 h-3.5 text-purple-500" />;
    case 'attraction':
      return <Landmark className="w-3.5 h-3.5 text-amber-500" />;
    case 'city':
      return <Compass className="w-3.5 h-3.5 text-[#18B8A6]" />;
    default:
      return <MapPin className="w-3.5 h-3.5 text-[#829196]" />;
  }
};

export default function LocationSearchInput({
  label,
  placeholder,
  value, // string query or display name
  selectedLocation, // { name, formatted_address, latitude, longitude, place_id, category }
  onChangeText,
  onSelectLocation,
  onOpenMapPicker,
  isDestination = false,
  quickPicks = [],
  required = false,
}) {
  const [query, setQuery] = useState(value || '');
  const [suggestions, setSuggestions] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [locatingCurrent, setLocatingCurrent] = useState(false);

  const containerRef = useRef(null);
  const latestRequestTime = useRef(0);

  // Sync external text value changes
  useEffect(() => {
    setQuery(value || '');
  }, [value]);

  // Debounced autocomplete search
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed || trimmed.length < 2) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    // If query matches the currently selected location's name, don't re-trigger dropdown
    if (selectedLocation && selectedLocation.name === trimmed) {
      return;
    }

    const requestTime = Date.now();
    latestRequestTime.current = requestTime;
    setLoading(true);

    const timer = setTimeout(async () => {
      try {
        const results = await locationService.autocomplete(trimmed, 6);
        // Prevent race condition: only accept if it's the latest search
        if (latestRequestTime.current === requestTime) {
          setSuggestions(results);
          setIsOpen(results.length > 0);
        }
      } catch (err) {
        console.warn('Autocomplete fetch failed:', err);
      } finally {
        if (latestRequestTime.current === requestTime) {
          setLoading(false);
        }
      }
    }, 280);

    return () => clearTimeout(timer);
  }, [query, selectedLocation]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInputChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    onChangeText(val);
  };

  const handleSelectSuggestion = (item) => {
    setQuery(item.name);
    setIsOpen(false);
    setSuggestions([]);
    onSelectLocation(item);
  };

  const handleClear = () => {
    setQuery('');
    setSuggestions([]);
    setIsOpen(false);
    onChangeText('');
    onSelectLocation(null);
  };

  const handleCurrentLocationClick = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }

    setLocatingCurrent(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        try {
          const loc = await locationService.reverseGeocode(lat, lon);
          if (loc) {
            setQuery(loc.name);
            onSelectLocation(loc);
          } else {
            const fallback = {
              name: 'My GPS Location',
              formatted_address: `Coordinates: ${lat.toFixed(5)}, ${lon.toFixed(5)}`,
              latitude: lat,
              longitude: lon,
              category: 'general',
              place_id: `${lat.toFixed(5)},${lon.toFixed(5)}`,
            };
            setQuery(fallback.name);
            onSelectLocation(fallback);
          }
        } catch (e) {
          console.warn('Reverse geocode for current position failed:', e);
        } finally {
          setLocatingCurrent(false);
        }
      },
      (err) => {
        console.warn('Geolocation error:', err);
        setLocatingCurrent(false);
        alert('Could not determine your GPS location. Please check location permissions.');
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  const hasCoordinates = selectedLocation?.latitude && selectedLocation?.longitude;

  return (
    <div ref={containerRef} className="space-y-2 relative">
      {/* Label & Header Actions */}
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold text-[#163B46] uppercase tracking-wider flex items-center">
          {isDestination ? (
            <MapPin className="w-3.5 h-3.5 mr-1.5 text-red-500" />
          ) : (
            <Navigation className="w-3.5 h-3.5 mr-1.5 text-[#10B981]" />
          )}
          <span>{label}</span>
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>

        {/* GPS location shortcut */}
        {!isDestination && (
          <button
            type="button"
            onClick={handleCurrentLocationClick}
            disabled={locatingCurrent}
            className="text-[11px] font-semibold text-[#129889] hover:text-[#163B46] flex items-center space-x-1 transition-colors"
          >
            {locatingCurrent ? (
              <Loader2 className="w-3 h-3 animate-spin text-[#18B8A6]" />
            ) : (
              <LocateFixed className="w-3 h-3 text-[#18B8A6]" />
            )}
            <span>Use Current Location</span>
          </button>
        )}
      </div>

      {/* Main Input Row */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          {/* Left search icon */}
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-[#829196]">
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin text-[#18B8A6]" />
            ) : (
              <Search className="w-4 h-4" />
            )}
          </div>

          <input
            type="text"
            required={required}
            value={query}
            onChange={handleInputChange}
            onFocus={() => {
              if (suggestions.length > 0) setIsOpen(true);
            }}
            placeholder={placeholder}
            className={`w-full pl-10 pr-9 py-2.5 rounded-xl bg-white border text-sm text-[#26383D] placeholder-[#829196] focus:outline-none transition-all shadow-xs ${
              hasCoordinates
                ? 'border-[#18B8A6] focus:ring-1 focus:ring-[#18B8A6]'
                : 'border-[#DCE6E3] focus:border-[#18B8A6]'
            }`}
          />

          {/* Clear button */}
          {query && (
            <button
              type="button"
              onClick={handleClear}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[#829196] hover:text-[#DC5555] rounded-full transition-colors"
              title="Clear location"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* "Select on Map" button */}
        <button
          type="button"
          onClick={onOpenMapPicker}
          className="px-3.5 py-2.5 rounded-xl bg-white hover:bg-[#EEF3F1] border border-[#DCE6E3] hover:border-[#18B8A6] text-xs font-bold text-[#163B46] flex items-center space-x-1.5 transition-all shadow-xs shrink-0"
        >
          <MapIcon className={`w-3.5 h-3.5 ${isDestination ? 'text-red-500' : 'text-[#10B981]'}`} />
          <span className="hidden sm:inline">Select on Map</span>
          <span className="sm:hidden">Map</span>
        </button>
      </div>

      {/* Selected Coordinates Status Badge */}
      {hasCoordinates && (
        <div className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-emerald-50/80 border border-emerald-200/80 text-[11px] text-emerald-800 animate-in fade-in duration-150">
          <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span className="truncate">
            <strong>{selectedLocation.name}</strong>
            {selectedLocation.formatted_address && selectedLocation.formatted_address !== selectedLocation.name && (
              <span className="text-emerald-700 font-normal ml-1">
                ({selectedLocation.formatted_address})
              </span>
            )}
          </span>
          <span className="ml-auto font-mono text-[10px] text-emerald-600 shrink-0">
            [{selectedLocation.latitude.toFixed(4)}, {selectedLocation.longitude.toFixed(4)}]
          </span>
        </div>
      )}

      {/* Autocomplete Dropdown */}
      {isOpen && suggestions.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-40 bg-white rounded-2xl shadow-xl border border-[#DCE6E3] max-h-72 overflow-y-auto divide-y divide-[#F4F7F6] animate-in fade-in slide-in-from-top-1 duration-150">
          {suggestions.map((item, idx) => {
            const isMatch =
              selectedLocation &&
              Math.abs(selectedLocation.latitude - item.latitude) < 0.0001 &&
              Math.abs(selectedLocation.longitude - item.longitude) < 0.0001;

            return (
              <div
                key={item.place_id || `${item.latitude}-${item.longitude}-${idx}`}
                onClick={() => handleSelectSuggestion(item)}
                className={`p-3 hover:bg-[#EEF3F1] cursor-pointer transition-colors flex items-start space-x-2.5 ${
                  isMatch ? 'bg-[#18B8A6]/10' : ''
                }`}
              >
                <div className="w-7 h-7 rounded-lg bg-[#F4F7F6] flex items-center justify-center shrink-0 mt-0.5 border border-[#DCE6E3]">
                  {getCategoryIcon(item.category)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-bold text-xs text-[#163B46] truncate">{item.name}</span>
                    {item.category && item.category !== 'general' && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase bg-[#EEF3F1] text-[#52636A] shrink-0">
                        {item.category}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[#52636A] truncate">
                    {item.formatted_address || `${item.city || ''}, ${item.state || ''}, ${item.country || ''}`}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Quick Picks Hubs */}
      {quickPicks && quickPicks.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          <span className="text-[11px] text-[#829196] mr-1 font-medium">Quick hubs:</span>
          {quickPicks.map((hub) => (
            <button
              key={hub}
              type="button"
              onClick={() => {
                setQuery(hub);
                onChangeText(hub);
              }}
              className={`text-xs px-2.5 py-1 rounded-lg border transition-all ${
                query.toLowerCase() === hub.toLowerCase()
                  ? 'bg-[#163B46] text-white border-[#163B46] font-bold shadow-xs'
                  : 'bg-white text-[#52636A] border-[#DCE6E3] hover:bg-[#EEF3F1] hover:text-[#163B46]'
              }`}
            >
              {hub}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

