import React, { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { MapPin, Utensils, Clock, DollarSign, Navigation, Calendar, Layers, Car, Bike, Footprints, ExternalLink, RefreshCw, Compass } from 'lucide-react';
import { formatCurrency, capitalizeWords } from '../utils/formatters';
import locationService from '../services/locationService';

// Map Auto-Fitter Helper Component
function ChangeView({ bounds }) {
  const map = useMap();
  useEffect(() => {
    if (bounds && bounds.length > 0) {
      try {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
      } catch (e) {
        console.warn('Map fitBounds error:', e);
      }
    }
  }, [bounds, map]);
  return null;
}

// Custom HTML DivIcons with sequence numbers and styling
const createNumberIcon = (number, color = '#18B8A6') => {
  return L.divIcon({
    className: 'custom-map-marker',
    html: `
      <div style="
        background-color: ${color};
        color: #ffffff;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 700;
        font-size: 13px;
        box-shadow: 0 4px 14px rgba(22, 59, 70, 0.25);
        border: 2.5px solid #ffffff;
      ">
        ${number}
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -18],
  });
};

const createRestaurantIcon = () => {
  return L.divIcon({
    className: 'custom-map-marker-restaurant',
    html: `
      <div style="
        background-color: #16A36A;
        color: #ffffff;
        width: 28px;
        height: 28px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 13px;
        box-shadow: 0 4px 10px rgba(22, 59, 70, 0.2);
        border: 2.5px solid #ffffff;
      ">
        🍽️
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
  });
};

const createOriginIcon = (isReturn = false) => {
  return L.divIcon({
    className: 'custom-map-marker-origin',
    html: `
      <div style="
        background: ${isReturn ? 'linear-gradient(135deg, #163B46, #0D2228)' : 'linear-gradient(135deg, #10B981, #059669)'};
        color: #ffffff;
        width: 34px;
        height: 34px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 15px;
        box-shadow: 0 4px 14px rgba(16, 185, 129, 0.45);
        border: 2.5px solid #ffffff;
      ">
        ${isReturn ? '🏁' : '🚩'}
      </div>
    `,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -18],
  });
};

const createRestStopIcon = () => {
  return L.divIcon({
    className: 'custom-map-marker-rest-stop',
    html: `
      <div style="
        background: linear-gradient(135deg, #F59E0B, #D97706);
        color: #ffffff;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 15px;
        box-shadow: 0 4px 12px rgba(217, 119, 6, 0.4);
        border: 2.5px solid #ffffff;
      ">
        ☕
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -18],
  });
};

const createStopoverHotelIcon = () => {
  return L.divIcon({
    className: 'custom-map-marker-stopover-hotel',
    html: `
      <div style="
        background: linear-gradient(135deg, #F97316, #C2410C);
        color: #ffffff;
        width: 34px;
        height: 34px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
        box-shadow: 0 4px 14px rgba(249, 115, 22, 0.45);
        border: 2.5px solid #ffffff;
      ">
        🏨
      </div>
    `,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -18],
  });
};

const createDestinationHotelIcon = () => {
  return L.divIcon({
    className: 'custom-map-marker-dest-hotel',
    html: `
      <div style="
        background: linear-gradient(135deg, #6366F1, #4338CA);
        color: #ffffff;
        width: 34px;
        height: 34px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
        box-shadow: 0 4px 14px rgba(99, 102, 241, 0.45);
        border: 2.5px solid #ffffff;
      ">
        🏨
      </div>
    `,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -18],
  });
};

const DAY_COLORS = ['#18B8A6', '#163B46', '#244F59', '#16A36A', '#E6A23C', '#0284C7'];

// 100% Free & Open-Source Tile Providers (No API Key Required)
const TILE_PROVIDERS = {
  osm: {
    id: 'osm',
    name: 'OpenStreetMap',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
    maxZoom: 19,
  },
  humanitarian: {
    id: 'humanitarian',
    name: 'Humanitarian',
    url: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors, <a href="https://www.hotosm.org/" target="_blank" rel="noreferrer">HOT</a>',
    maxZoom: 19,
  },
  topo: {
    id: 'topo',
    name: 'Topographic',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors, <a href="https://opentopomap.org" target="_blank" rel="noreferrer">OpenTopoMap</a>',
    maxZoom: 17,
  },
};

export default function MapComponent({
  itinerary,
  standalonePlaces = [],
  center = [17.3850, 78.4867],
  zoom = 12,
  height = '500px',
  selectedDay = null, // null means all days
  onDayChange = null,
  initialVehicle = 'driving-car',
  onVehicleChange = null,
  showVehicleSelector = true,
}) {
  const [activeDayFilter, setActiveDayFilter] = useState(selectedDay || 'all');
  const [activeTileKey, setActiveTileKey] = useState('osm');
  const [selectedVehicle, setSelectedVehicle] = useState(initialVehicle || itinerary?.transportation || 'driving-car');
  const [vehicleRouteMetrics, setVehicleRouteMetrics] = useState(null);
  const [recalculatingRoute, setRecalculatingRoute] = useState(false);
  const activeTile = TILE_PROVIDERS[activeTileKey] || TILE_PROVIDERS.osm;

  useEffect(() => {
    if (selectedDay !== undefined && selectedDay !== null) {
      setActiveDayFilter(selectedDay);
    }
  }, [selectedDay]);

  const handleDayFilterSelect = (val) => {
    setActiveDayFilter(val);
    if (onDayChange) {
      onDayChange(val);
    }
  };

  // Live Road Route Recalculation on Vehicle Mode Switch
  const handleVehicleSelect = async (vehicleMode) => {
    setSelectedVehicle(vehicleMode);
    if (onVehicleChange) onVehicleChange(vehicleMode);

    // Identify Source & Destination coordinates from itinerary or stops
    let sLat = null, sLon = null, dLat = null, dLon = null;
    if (itinerary?.source_location?.latitude && itinerary?.source_location?.longitude) {
      sLat = itinerary.source_location.latitude;
      sLon = itinerary.source_location.longitude;
    } else if (allStops.length > 0 && allStops[0].latitude) {
      sLat = allStops[0].latitude;
      sLon = allStops[0].longitude;
    }

    if (itinerary?.destination_accommodation?.latitude && itinerary?.destination_accommodation?.longitude) {
      dLat = itinerary.destination_accommodation.latitude;
      dLon = itinerary.destination_accommodation.longitude;
    } else if (allStops.length > 1) {
      // Find final destination or last stop
      const lastStop = allStops[allStops.length - 1];
      dLat = lastStop.latitude;
      dLon = lastStop.longitude;
    }

    if (sLat && sLon && dLat && dLon) {
      setRecalculatingRoute(true);
      try {
        const preview = await locationService.getRoutePreview({
          sourceLat: sLat,
          sourceLon: sLon,
          destLat: dLat,
          destLon: dLon,
          profile: vehicleMode,
        });
        if (preview && preview.geometry) {
          setVehicleRouteMetrics({
            profile: vehicleMode,
            distance_km: preview.distance_km,
            duration_hours: preview.duration_hours,
            duration_minutes: preview.duration_minutes,
            geometry: preview.geometry,
          });
        }
      } catch (err) {
        console.warn('Vehicle route preview error:', err);
      } finally {
        setRecalculatingRoute(false);
      }
    }
  };

  // Parse stops from itinerary days
  const { allStops, mealBreaks, dayPolylines } = useMemo(() => {
    if (!itinerary || !itinerary.days) {
      return { allStops: [], mealBreaks: [], dayPolylines: [] };
    }

    const stopsList = [];
    const mealsList = [];
    const polylinesList = [];

    itinerary.days.forEach((day, dayIndex) => {
      const color = DAY_COLORS[dayIndex % DAY_COLORS.length];
      const dayCoordinates = [];

      // Process stops (including source origin and round-trip return)
      (day.stops || []).forEach((stop) => {
        if (stop.latitude && stop.longitude) {
          stopsList.push({
            ...stop,
            dayNumber: day.day_number,
            color,
          });
          dayCoordinates.push([stop.latitude, stop.longitude]);
        }
      });

      // Process meal breaks if coordinates exist
      (day.meal_breaks || []).forEach((meal) => {
        if (meal.latitude && meal.longitude) {
          mealsList.push({
            ...meal,
            dayNumber: day.day_number,
          });
        }
      });

      // Process route geometry (either [[lat, lon], ...] or space-delimited string)
      let polylinePoints = [];
      if (day.geometry && Array.isArray(day.geometry) && day.geometry.length > 0) {
        day.geometry.forEach((item) => {
          if (Array.isArray(item) && item.length === 2) {
            const lat = parseFloat(item[0]);
            const lon = parseFloat(item[1]);
            if (!isNaN(lat) && !isNaN(lon)) {
              polylinePoints.push([lat, lon]);
            }
          } else if (typeof item === 'string') {
            const parts = item.trim().split(/\s+/);
            for (let i = 0; i < parts.length - 1; i += 2) {
              const lat = parseFloat(parts[i]);
              const lon = parseFloat(parts[i + 1]);
              if (!isNaN(lat) && !isNaN(lon)) {
                polylinePoints.push([lat, lon]);
              }
            }
          }
        });
      }

      // If backend geometry was straight point-to-point, fallback to full stop coordinates (Source -> POIs -> Return)
      if (polylinePoints.length < 2) {
        polylinePoints = dayCoordinates;
      }

      if (polylinePoints.length >= 2) {
        polylinesList.push({
          dayNumber: day.day_number,
          points: polylinePoints,
          color,
        });
      }
    });

    return { allStops: stopsList, mealBreaks: mealsList, dayPolylines: polylinesList };
  }, [itinerary]);

  // Filter stops and polylines based on active day filter
  const visibleStops = useMemo(() => {
    if (activeDayFilter === 'all') return allStops;
    return allStops.filter((s) => s.dayNumber === parseInt(activeDayFilter, 10));
  }, [allStops, activeDayFilter]);

  const visiblePolylines = useMemo(() => {
    if (activeDayFilter === 'all') return dayPolylines;
    return dayPolylines.filter((p) => p.dayNumber === parseInt(activeDayFilter, 10));
  }, [dayPolylines, activeDayFilter]);

  const visibleMeals = useMemo(() => {
    if (activeDayFilter === 'all') return mealBreaks;
    return mealBreaks.filter((m) => m.dayNumber === parseInt(activeDayFilter, 10));
  }, [mealBreaks, activeDayFilter]);

  // Compute bounding box for visible elements
  const mapBounds = useMemo(() => {
    const points = [];
    visibleStops.forEach((s) => points.push([s.latitude, s.longitude]));
    visibleMeals.forEach((m) => points.push([m.latitude, m.longitude]));
    standalonePlaces.forEach((p) => {
      if (p.latitude && p.longitude) points.push([p.latitude, p.longitude]);
    });
    return points.length > 0 ? points : null;
  }, [visibleStops, visibleMeals, standalonePlaces]);

  // Resolved Center
  const resolvedCenter = useMemo(() => {
    if (visibleStops.length > 0) {
      return [visibleStops[0].latitude, visibleStops[0].longitude];
    }
    if (standalonePlaces.length > 0) {
      return [standalonePlaces[0].latitude, standalonePlaces[0].longitude];
    }
    return center;
  }, [visibleStops, standalonePlaces, center]);

  return (
    <div className="relative rounded-2xl overflow-hidden border border-[#DCE6E3] shadow-soft-md bg-white flex flex-col">
      {/* Top Filter & Vehicle Controls */}
      <div className="bg-white px-4 py-3 border-b border-[#DCE6E3] flex flex-wrap items-center justify-between gap-3 text-xs z-20">
        <div className="flex flex-wrap items-center gap-2">
          {/* Day Filter */}
          {itinerary?.days && itinerary.days.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5 mr-2">
              <span className="text-[#52636A] font-medium flex items-center mr-1">
                <Calendar className="w-3.5 h-3.5 mr-1 text-[#18B8A6]" />
                Day:
              </span>
              <button
                type="button"
                onClick={() => handleDayFilterSelect('all')}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  activeDayFilter === 'all'
                    ? 'bg-[#18B8A6] text-white shadow-soft'
                    : 'bg-[#F4F7F6] text-[#52636A] hover:bg-[#EEF3F1] hover:text-[#163B46]'
                }`}
              >
                All Days
              </button>
              {itinerary.days.map((day, idx) => (
                <button
                  key={day.day_number}
                  type="button"
                  onClick={() => handleDayFilterSelect(String(day.day_number))}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center space-x-1.5 ${
                    activeDayFilter === String(day.day_number)
                      ? 'bg-[#163B46] text-white shadow-soft'
                      : 'bg-[#F4F7F6] text-[#52636A] hover:bg-[#EEF3F1] hover:text-[#163B46]'
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: DAY_COLORS[idx % DAY_COLORS.length] }}
                  />
                  <span>Day {day.day_number}</span>
                </button>
              ))}
            </div>
          )}

          {/* Vehicle Selector (Car / Bike / Walk) */}
          {showVehicleSelector && (
            <div className="flex items-center space-x-1 bg-[#F4F7F6] p-1 rounded-xl border border-[#DCE6E3]">
              <span className="text-[11px] font-bold text-[#52636A] px-2 flex items-center">
                <Navigation className="w-3.5 h-3.5 mr-1 text-[#18B8A6]" />
                Vehicle:
              </span>
              <button
                type="button"
                onClick={() => handleVehicleSelect('driving-car')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center space-x-1 transition-all ${
                  selectedVehicle === 'driving-car'
                    ? 'bg-[#18B8A6] text-white shadow-xs'
                    : 'text-[#52636A] hover:text-[#163B46] hover:bg-[#E5ECE9]'
                }`}
                title="Driving Car Road Route"
              >
                <span>🚗</span>
                <span>Car</span>
              </button>
              <button
                type="button"
                onClick={() => handleVehicleSelect('cycling-regular')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center space-x-1 transition-all ${
                  selectedVehicle === 'cycling-regular'
                    ? 'bg-[#18B8A6] text-white shadow-xs'
                    : 'text-[#52636A] hover:text-[#163B46] hover:bg-[#E5ECE9]'
                }`}
                title="Two-Wheeler / Bike Route"
              >
                <span>🏍️</span>
                <span>Bike</span>
              </button>
              <button
                type="button"
                onClick={() => handleVehicleSelect('foot-walking')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center space-x-1 transition-all ${
                  selectedVehicle === 'foot-walking'
                    ? 'bg-[#18B8A6] text-white shadow-xs'
                    : 'text-[#52636A] hover:text-[#163B46] hover:bg-[#E5ECE9]'
                }`}
                title="Walking Route"
              >
                <span>🚶</span>
                <span>Walk</span>
              </button>
            </div>
          )}
        </div>

        {/* Live Route Metric Badge */}
        {vehicleRouteMetrics ? (
          <div className="flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold shadow-xs">
            <span>{selectedVehicle === 'driving-car' ? '🚗 Car' : selectedVehicle === 'cycling-regular' ? '🏍️ Bike' : '🚶 Walk'} Best Route:</span>
            <span className="text-emerald-700 font-extrabold">{vehicleRouteMetrics.distance_km} km</span>
            <span>•</span>
            <span className="text-[#163B46]">
              ~{vehicleRouteMetrics.duration_hours >= 1 ? `${vehicleRouteMetrics.duration_hours} hrs` : `${vehicleRouteMetrics.duration_minutes} mins`}
            </span>
            {recalculatingRoute && <RefreshCw className="w-3 h-3 animate-spin text-emerald-600" />}
          </div>
        ) : (
          <div className="hidden sm:flex flex-wrap items-center gap-3 text-[11px] text-[#52636A] font-medium">
            <span className="flex items-center">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 mr-1.5" /> 🚩 Source / Return
            </span>
            <span className="flex items-center">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 mr-1.5" /> ☕ Rest Break
            </span>
            <span className="flex items-center">
              <span className="w-2.5 h-2.5 rounded-full bg-orange-500 mr-1.5" /> 🏨 Midway Hotel
            </span>
            <span className="flex items-center">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 mr-1.5" /> 🏨 Dest Hotel
            </span>
            <span className="flex items-center">
              <span className="w-2.5 h-2.5 rounded-full bg-[#18B8A6] mr-1.5" /> Attraction
            </span>
            <span className="flex items-center">
              <span className="w-2.5 h-2.5 rounded-full bg-[#16A36A] mr-1.5" /> Dining
            </span>
          </div>
        )}
      </div>

      {/* Map Container */}
      <div style={{ height }} className="w-full relative z-10">
        {/* Floating Open-Source Tile Switcher */}
        <div className="absolute top-3 right-3 z-[1000] bg-white/95 backdrop-blur-md rounded-xl p-1 shadow-soft border border-[#DCE6E3] hidden sm:flex items-center space-x-1 text-[11px] font-semibold text-[#52636A]">
          <Layers className="w-3.5 h-3.5 text-[#18B8A6] ml-1.5 mr-0.5 shrink-0" />
          <button
            type="button"
            onClick={() => setActiveTileKey('osm')}
            className={`px-2 py-1 rounded-lg transition-all ${
              activeTileKey === 'osm'
                ? 'bg-[#18B8A6] text-white shadow-xs font-bold'
                : 'hover:bg-[#EEF3F1] hover:text-[#163B46]'
            }`}
          >
            OSM Standard
          </button>
          <button
            type="button"
            onClick={() => setActiveTileKey('humanitarian')}
            className={`px-2 py-1 rounded-lg transition-all ${
              activeTileKey === 'humanitarian'
                ? 'bg-[#18B8A6] text-white shadow-xs font-bold'
                : 'hover:bg-[#EEF3F1] hover:text-[#163B46]'
            }`}
          >
            Humanitarian
          </button>
          <button
            type="button"
            onClick={() => setActiveTileKey('topo')}
            className={`px-2 py-1 rounded-lg transition-all ${
              activeTileKey === 'topo'
                ? 'bg-[#18B8A6] text-white shadow-xs font-bold'
                : 'hover:bg-[#EEF3F1] hover:text-[#163B46]'
            }`}
          >
            Topographic
          </button>
        </div>

        <MapContainer
          center={resolvedCenter}
          zoom={zoom}
          scrollWheelZoom={true}
          style={{ width: '100%', height: '100%' }}
        >
          <ChangeView bounds={mapBounds} />

          {/* 100% Free & Open-Source Tile Layer (No API Key Required) */}
          <TileLayer
            key={activeTileKey}
            attribution={activeTile.attribution}
            url={activeTile.url}
            maxZoom={activeTile.maxZoom}
          />

          {/* Active Vehicle-Recalculated Best Road Route */}
          {vehicleRouteMetrics?.geometry && (
            <Polyline
              key={`polyline-vehicle-${vehicleRouteMetrics.profile}`}
              positions={vehicleRouteMetrics.geometry}
              pathOptions={{
                color: '#0EA5E9',
                weight: 6,
                opacity: 0.9,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          )}

          {/* Route Polylines */}
          {visiblePolylines.map((poly, idx) => (
            <Polyline
              key={`polyline-day-${poly.dayNumber}-${idx}`}
              positions={poly.points}
              pathOptions={{
                color: poly.color,
                weight: 4,
                opacity: 0.85,
                dashArray: '3, 6',
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          ))}

          {/* Sequential Itinerary Stops */}
          {visibleStops.map((stop, index) => {
            const isStart = stop.is_start_location;
            const isEnd = stop.is_end_location;
            const isRestStop = stop.is_rest_stop;
            const isHotelStay = stop.is_hotel_stay;
            const isStopover = stop.is_stopover;

            let markerIcon;
            if (isStart) {
              markerIcon = createOriginIcon(false);
            } else if (isEnd) {
              markerIcon = createOriginIcon(true);
            } else if (isRestStop) {
              markerIcon = createRestStopIcon();
            } else if (isHotelStay) {
              markerIcon = isStopover ? createStopoverHotelIcon() : createDestinationHotelIcon();
            } else {
              markerIcon = createNumberIcon(stop.stop_order || index + 1, stop.color);
            }

            return (
              <Marker
                key={`stop-${stop.place_id || stop.id || index}`}
                position={[stop.latitude, stop.longitude]}
                icon={markerIcon}
              >
                <Popup>
                  <div className="space-y-2 p-1 text-[#26383D] min-w-[220px]">
                    <div className="flex items-center justify-between border-b border-[#DCE6E3] pb-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#18B8A6]">
                        {isStart
                          ? 'Trip Origin / Source Hub'
                          : isEnd
                          ? 'Destination Return Hub'
                          : isRestStop
                          ? '☕ Highway Rest Break'
                          : isHotelStay
                          ? isStopover
                            ? '🏨 Midway Stopover Hotel'
                            : '🏨 Destination Hotel'
                          : `Day ${stop.dayNumber} • Stop #${stop.stop_order || index + 1}`}
                      </span>
                      <span className="text-[10px] text-[#52636A] capitalize">
                        {isStart
                          ? 'Origin'
                          : isEnd
                          ? 'Return'
                          : isRestStop
                          ? 'Rest Stop'
                          : isHotelStay
                          ? 'Accommodation'
                          : stop.category || 'Sight'}
                      </span>
                    </div>

                    <h4 className="text-sm font-bold text-[#163B46] leading-tight">
                      {isStart ? '🚩 ' : isEnd ? '🏁 ' : isRestStop ? '☕ ' : isHotelStay ? '🏨 ' : ''}
                      {capitalizeWords(stop.name)}
                    </h4>

                    {stop.address && (
                      <p className="text-[11px] text-[#52636A] line-clamp-2">{stop.address}</p>
                    )}

                    {isRestStop && (
                      <div className="p-1.5 bg-amber-50 rounded-lg border border-amber-200 text-[10px] text-amber-800">
                        Recommended 30-min refreshment break to prevent driver fatigue.
                      </div>
                    )}

                    {isHotelStay && (
                      <div className="p-1.5 bg-indigo-50/70 rounded-lg border border-indigo-200 text-[10px] text-indigo-900 flex items-center justify-between">
                        <span>{isStopover ? 'Midway corridor stopover' : 'Primary destination lodging'}</span>
                        {stop.total_entrance_fee > 0 && (
                          <span className="font-bold text-emerald-700">{formatCurrency(stop.total_entrance_fee)}/nt</span>
                        )}
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-1.5 pt-1 text-[11px] text-[#26383D]">
                      <div className="flex items-center space-x-1">
                        <Clock className="w-3 h-3 text-[#E6A23C]" />
                        <span>
                          {isStart
                            ? `Depart: ${stop.departure_time || '09:00'}`
                            : isEnd
                            ? `Arrive: ${stop.arrival_time}`
                            : `${stop.arrival_time} - ${stop.departure_time}`}
                        </span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <DollarSign className="w-3 h-3 text-[#16A36A]" />
                        <span>
                          {isStart || isEnd
                            ? 'Circuit Hub'
                            : isHotelStay
                            ? stop.total_entrance_fee > 0
                              ? `${formatCurrency(stop.total_entrance_fee)}/night`
                              : 'Included in Budget'
                            : isRestStop
                            ? 'Refreshments'
                            : stop.total_entrance_fee > 0
                            ? formatCurrency(stop.total_entrance_fee)
                            : 'Free'}
                        </span>
                      </div>
                    </div>

                    <div className="pt-2 text-center border-t border-[#DCE6E3]">
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${stop.latitude},${stop.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center space-x-1 text-[11px] text-[#18B8A6] hover:text-[#129889] font-semibold"
                      >
                        <Navigation className="w-3 h-3" />
                        <span>Open in Google Maps</span>
                      </a>
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}

          {/* Scheduled Meal Stops */}
          {visibleMeals.map((meal, idx) => {
            const gmapsUrl =
              meal.google_maps_url ||
              `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                meal.name + (meal.address ? `, ${meal.address}` : '')
              )}`;

            return (
              <Marker
                key={`meal-${meal.id || idx}`}
                position={[meal.latitude, meal.longitude]}
                icon={createRestaurantIcon()}
              >
                <Popup>
                  <div className="space-y-1.5 text-[#26383D] min-w-[210px] p-1">
                    <div className="flex items-center justify-between border-b border-[#DCE6E3] pb-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#16A36A]">
                        🍽️ Day {meal.dayNumber} • Dining Break
                      </span>
                      <span className="text-[10px] text-[#52636A] font-semibold capitalize">
                        {meal.meal_type || 'Meal'}
                      </span>
                    </div>

                    <h4 className="text-xs font-bold text-[#163B46]">{meal.name}</h4>

                    {meal.cuisine && (
                      <div className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                        🍲 {meal.cuisine}
                      </div>
                    )}

                    {meal.address && (
                      <p className="text-[11px] text-[#52636A] line-clamp-2">{meal.address}</p>
                    )}

                    <div className="grid grid-cols-2 gap-1 text-[11px] text-[#52636A] pt-1">
                      <div>⏰ {meal.scheduled_start} - {meal.scheduled_end}</div>
                      <div className="text-right text-[#16A36A] font-bold">
                        {formatCurrency(meal.estimated_cost || (meal.estimated_cost_per_person || 350))}
                      </div>
                    </div>

                    <div className="pt-2 text-center border-t border-[#DCE6E3]">
                      <a
                        href={gmapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center space-x-1.5 w-full py-1.5 px-3 rounded-lg bg-[#16A36A] hover:bg-[#128254] text-white text-[11px] font-bold shadow-xs transition-colors"
                        title="Open restaurant details only in Google Maps"
                      >
                        <span>Open in Google Maps</span>
                        <ExternalLink className="w-3.5 h-3.5 ml-1" />
                      </a>
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}

          {/* Standalone POIs (e.g. from Recommendations view) */}
          {standalonePlaces.map((poi, idx) => (
            <Marker
              key={`place-${poi.place_id || poi.id || idx}`}
              position={[poi.latitude, poi.longitude]}
              icon={createNumberIcon(idx + 1, '#18B8A6')}
            >
              <Popup>
                <div className="space-y-1.5 text-[#26383D] min-w-[200px]">
                  <span className="text-[10px] font-bold uppercase text-[#18B8A6]">
                    Recommended Attraction #{idx + 1}
                  </span>
                  <h4 className="text-xs font-bold text-[#163B46]">{poi.name}</h4>
                  <p className="text-[11px] text-[#52636A]">{poi.address || poi.category}</p>
                  {poi.final_score && (
                    <div className="text-[11px] text-[#18B8A6] font-semibold">
                      Score: {(poi.final_score * 100).toFixed(0)}% Match
                    </div>
                  )}
                  {poi.entrance_fee !== undefined && (
                    <div className="text-[11px] text-[#16A36A] font-medium">
                      Admission: {poi.entrance_fee > 0 ? formatCurrency(poi.entrance_fee) : 'Free / Included'}
                    </div>
                  )}
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}
