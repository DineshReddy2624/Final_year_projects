import React, { useState, useEffect, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import {
  MapPin,
  X,
  Check,
  Search,
  Navigation,
  Compass,
  Loader2,
  AlertCircle,
  LocateFixed,
} from 'lucide-react';
import locationService from '../services/locationService';

// Custom Marker Icon for Location Picker
const createPickerIcon = (isDestination = false) => {
  return L.divIcon({
    className: 'custom-picker-pin',
    html: `
      <div style="
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        transform: translate(-50%, -100%);
      ">
        <div style="
          width: 38px;
          height: 38px;
          border-radius: 50% 50% 50% 0;
          background: ${isDestination ? 'linear-gradient(135deg, #EF4444, #B91C1C)' : 'linear-gradient(135deg, #10B981, #059669)'};
          transform: rotate(-45deg);
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 14px rgba(0,0,0,0.35);
          border: 2.5px solid #ffffff;
        ">
          <span style="transform: rotate(45deg); color: #ffffff; font-size: 16px; font-weight: bold;">
            ${isDestination ? '📍' : '🚩'}
          </span>
        </div>
        <div style="
          width: 8px;
          height: 8px;
          background: rgba(0,0,0,0.25);
          border-radius: 50%;
          margin-top: 2px;
        "></div>
      </div>
    `,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
};

// Map Click Listener Component
function MapEvents({ onMapClick }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

// Controller to smoothly pan to coordinates
function MapPanController({ targetCenter }) {
  const map = useMap();
  useEffect(() => {
    if (targetCenter && targetCenter[0] && targetCenter[1]) {
      try {
        map.flyTo(targetCenter, Math.max(map.getZoom(), 13), { duration: 1.2 });
      } catch (e) {
        // Fallback setView if flyTo is interrupted
        map.setView(targetCenter, 13);
      }
    }
  }, [targetCenter, map]);
  return null;
}

export default function MapLocationPickerModal({
  isOpen,
  onClose,
  targetField = 'source', // 'source' or 'destination'
  initialLocation = null,
  onConfirmLocation,
}) {
  const isDest = targetField === 'destination';
  const title = isDest ? 'Select Destination on Map' : 'Select Starting Point on Map';
  const confirmBtnLabel = isDest ? 'Confirm Destination' : 'Confirm Starting Location';

  // Resolved initial coordinates
  const defaultLat = initialLocation?.latitude || 17.385044;
  const defaultLon = initialLocation?.longitude || 78.486671;

  const [position, setPosition] = useState({ lat: defaultLat, lon: defaultLon });
  const [addressDetails, setAddressDetails] = useState({
    name: initialLocation?.name || (isDest ? 'Hyderabad' : 'Starting Point'),
    formatted_address: initialLocation?.formatted_address || '',
    city: initialLocation?.city || '',
    state: initialLocation?.state || '',
    country: initialLocation?.country || 'India',
    category: initialLocation?.category || 'general',
    place_id: initialLocation?.place_id || null,
  });

  const [reverseLoading, setReverseLoading] = useState(false);
  const [modalSearchText, setModalSearchText] = useState('');
  const [modalSearchResults, setModalSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [geoLocating, setGeoLocating] = useState(false);
  const [panTarget, setPanTarget] = useState(null);

  const markerRef = useRef(null);

  // Sync initial location when modal opens
  useEffect(() => {
    if (isOpen) {
      const lat = initialLocation?.latitude || 17.385044;
      const lon = initialLocation?.longitude || 78.486671;
      setPosition({ lat, lon });
      setPanTarget([lat, lon]);
      if (initialLocation?.formatted_address) {
        setAddressDetails({
          name: initialLocation.name || 'Selected Place',
          formatted_address: initialLocation.formatted_address,
          city: initialLocation.city || '',
          state: initialLocation.state || '',
          country: initialLocation.country || 'India',
          category: initialLocation.category || 'general',
          place_id: initialLocation.place_id || null,
        });
      } else {
        triggerReverseGeocode(lat, lon);
      }
    }
  }, [isOpen, initialLocation]);

  // Reverse geocode helper
  const triggerReverseGeocode = async (lat, lon) => {
    setReverseLoading(true);
    try {
      const loc = await locationService.reverseGeocode(lat, lon);
      if (loc) {
        setAddressDetails({
          name: loc.name || `Location (${lat.toFixed(4)}, ${lon.toFixed(4)})`,
          formatted_address: loc.formatted_address || `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
          city: loc.city || '',
          state: loc.state || '',
          country: loc.country || 'India',
          category: loc.category || 'general',
          place_id: loc.place_id || `${lat.toFixed(5)},${lon.toFixed(5)}`,
        });
      }
    } catch (e) {
      console.warn('Reverse geocode error:', e);
      setAddressDetails({
        name: `Selected Coordinates`,
        formatted_address: `Latitude ${lat.toFixed(5)}, Longitude ${lon.toFixed(5)}`,
        city: '',
        state: '',
        country: '',
        category: 'coordinate',
        place_id: `${lat.toFixed(5)},${lon.toFixed(5)}`,
      });
    } finally {
      setReverseLoading(false);
    }
  };

  const handleMapClick = (lat, lon) => {
    setPosition({ lat, lon });
    triggerReverseGeocode(lat, lon);
  };

  const handleMarkerDragEnd = () => {
    const marker = markerRef.current;
    if (marker != null) {
      const latlng = marker.getLatLng();
      setPosition({ lat: latlng.lat, lon: latlng.lng });
      triggerReverseGeocode(latlng.lat, latlng.lng);
    }
  };

  // Internal quick search inside the map modal
  const handleModalSearch = async (e) => {
    e.preventDefault();
    if (!modalSearchText.trim()) return;

    setSearching(true);
    try {
      const results = await locationService.autocomplete(modalSearchText.trim(), 5);
      setModalSearchResults(results);
      if (results.length > 0) {
        const top = results[0];
        setPosition({ lat: top.latitude, lon: top.longitude });
        setPanTarget([top.latitude, top.longitude]);
        setAddressDetails({
          name: top.name,
          formatted_address: top.formatted_address,
          city: top.city || '',
          state: top.state || '',
          country: top.country || '',
          category: top.category || 'general',
          place_id: top.place_id,
        });
      }
    } catch (err) {
      console.warn('Modal search failed:', err);
    } finally {
      setSearching(false);
    }
  };

  // Use current browser GPS location
  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }
    setGeoLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        setPosition({ lat, lon });
        setPanTarget([lat, lon]);
        triggerReverseGeocode(lat, lon);
        setGeoLocating(false);
      },
      (err) => {
        console.warn('Geolocation error:', err);
        setGeoLocating(false);
        alert('Could not determine your GPS location. Please ensure location permissions are enabled.');
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  const handleConfirm = () => {
    const finalLocation = {
      name: addressDetails.name || (isDest ? 'Destination' : 'Starting Location'),
      formatted_address:
        addressDetails.formatted_address || `${position.lat.toFixed(5)}, ${position.lon.toFixed(5)}`,
      latitude: position.lat,
      longitude: position.lon,
      city: addressDetails.city || '',
      state: addressDetails.state || '',
      country: addressDetails.country || 'India',
      category: addressDetails.category || 'general',
      place_id: addressDetails.place_id || `${position.lat.toFixed(5)},${position.lon.toFixed(5)}`,
    };

    onConfirmLocation(finalLocation);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl bg-white rounded-3xl shadow-2xl border border-[#DCE6E3] overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-[#DCE6E3] flex items-center justify-between bg-[#F4F7F6]">
          <div className="flex items-center space-x-2.5">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center text-white shadow-soft ${
                isDest ? 'bg-red-500' : 'bg-[#10B981]'
              }`}
            >
              {isDest ? <MapPin className="w-5 h-5" /> : <Navigation className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-[#163B46]">{title}</h2>
              <p className="text-[11px] text-[#52636A]">
                Click anywhere on the map or drag the marker to pick the exact geographical location.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-[#829196] hover:text-[#163B46] hover:bg-white transition-colors border border-transparent hover:border-[#DCE6E3]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Search Bar & Current Location button */}
        <div className="px-6 py-3 bg-white border-b border-[#DCE6E3] flex flex-col sm:flex-row items-center gap-2.5">
          <form onSubmit={handleModalSearch} className="flex-1 w-full flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-[#829196] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={modalSearchText}
                onChange={(e) => setModalSearchText(e.target.value)}
                placeholder="Jump to place, city, landmark, or station..."
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#F4F7F6] border border-[#DCE6E3] text-xs text-[#163B46] placeholder-[#829196] focus:outline-none focus:border-[#18B8A6] focus:bg-white"
              />
            </div>
            <button
              type="submit"
              disabled={searching || !modalSearchText.trim()}
              className="px-3.5 py-2 rounded-xl bg-[#163B46] hover:bg-[#244F59] text-white text-xs font-bold transition-all disabled:opacity-50 shrink-0"
            >
              {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search'}
            </button>
          </form>

          <button
            type="button"
            onClick={handleUseCurrentLocation}
            disabled={geoLocating}
            className="w-full sm:w-auto px-3 py-2 rounded-xl bg-[#EEF3F1] hover:bg-[#DCE6E3] text-[#163B46] text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors border border-[#DCE6E3] shrink-0"
          >
            {geoLocating ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#18B8A6]" />
            ) : (
              <LocateFixed className="w-3.5 h-3.5 text-[#18B8A6]" />
            )}
            <span>My Current Location</span>
          </button>
        </div>

        {/* Leaflet Interactive Map Area */}
        <div className="relative flex-1 min-h-[380px] sm:min-h-[440px] w-full bg-[#EEF3F1]">
          <MapContainer
            center={[position.lat, position.lon]}
            zoom={13}
            scrollWheelZoom={true}
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <Marker
              position={[position.lat, position.lon]}
              icon={createPickerIcon(isDest)}
              draggable={true}
              eventHandlers={{
                dragend: handleMarkerDragEnd,
              }}
              ref={markerRef}
            />
            <MapEvents onMapClick={handleMapClick} />
            <MapPanController targetCenter={panTarget} />
          </MapContainer>

          {/* Floating Instructions Pill */}
          <div className="absolute top-3 right-3 z-[400] bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-xl border border-[#DCE6E3] shadow-soft text-[11px] font-medium text-[#52636A] pointer-events-none flex items-center space-x-1.5">
            <Compass className="w-3.5 h-3.5 text-[#18B8A6]" />
            <span>Click map or drag marker to reposition</span>
          </div>
        </div>

        {/* Location Preview & Confirmation Bottom Bar */}
        <div className="p-4 sm:p-5 border-t border-[#DCE6E3] bg-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1 max-w-xl">
            <div className="flex items-center space-x-2">
              <span
                className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider ${
                  isDest ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                }`}
              >
                {isDest ? 'Target Destination' : 'Trip Starting Point'}
              </span>
              <span className="text-[11px] text-[#829196] font-mono">
                {position.lat.toFixed(5)}, {position.lon.toFixed(5)}
              </span>
              {reverseLoading && <Loader2 className="w-3 h-3 text-[#18B8A6] animate-spin" />}
            </div>

            <div className="font-bold text-sm text-[#163B46] truncate">
              {addressDetails.name || 'Selected Map Location'}
            </div>
            <div className="text-xs text-[#52636A] truncate">
              {addressDetails.formatted_address || `${position.lat.toFixed(5)}, ${position.lon.toFixed(5)}`}
            </div>
          </div>

          <div className="flex items-center space-x-2.5 w-full sm:w-auto shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl border border-[#DCE6E3] hover:bg-[#EEF3F1] text-xs font-semibold text-[#52636A] transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className={`flex-1 sm:flex-none px-5 py-2.5 rounded-xl text-white text-xs font-extrabold shadow-soft transition-all hover:scale-[1.02] flex items-center justify-center space-x-1.5 ${
                isDest ? 'bg-red-600 hover:bg-red-700' : 'bg-[#10B981] hover:bg-[#059669]'
              }`}
            >
              <Check className="w-4 h-4" />
              <span>{confirmBtnLabel}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
