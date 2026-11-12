import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Navigation,
  Compass,
  Play,
  Pause,
  FastForward,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  MapPin,
  Utensils,
  Fuel,
  Coffee,
  Hospital,
  ChevronRight,
  ShieldAlert,
  ArrowRight,
  Route,
  Zap,
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useTrip } from '../context/TripContext';
import { useLiveTrip } from '../context/LiveTripContext';
import liveTripService from '../services/liveTripService';
import { formatCurrency, formatDistanceKm, capitalizeWords } from '../utils/formatters';

// Map Auto-Follow Component
function MapFollower({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center && center[0] && center[1]) {
      map.panTo(center, { animate: true, duration: 1.0 });
    }
  }, [center, map]);
  return null;
}

// User Live Pulsing Marker
const createUserLiveIcon = () => {
  return L.divIcon({
    className: 'live-user-marker',
    html: `
      <div style="position: relative; width: 28px; height: 28px;">
        <div style="
          position: absolute;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: rgba(24, 184, 166, 0.35);
          animation: pulse 1.8s infinite;
        "></div>
        <div style="
          position: absolute;
          top: 4px;
          left: 4px;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #18B8A6;
          border: 3px solid #ffffff;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        "></div>
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
};

const createStopIcon = (num, status = 'pending') => {
  let bg = '#163B46';
  let label = num;
  if (status === 'active') {
    bg = '#F59E0B'; // Amber pulsing
  } else if (status === 'completed') {
    bg = '#10B981'; // Green
    label = '✓';
  } else if (status === 'skipped') {
    bg = '#94A3B8'; // Slate
    label = '—';
  }

  return L.divIcon({
    className: 'custom-stop-marker',
    html: `
      <div style="
        background: ${bg};
        color: #ffffff;
        width: 30px;
        height: 30px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 800;
        font-size: 13px;
        border: 2.5px solid #ffffff;
        box-shadow: 0 3px 10px rgba(0,0,0,0.25);
      ">
        ${label}
      </div>
    `,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -16],
  });
};

const createNearbyIcon = (cat) => {
  let emoji = '📍';
  if (cat.includes('fuel')) emoji = '⛽';
  else if (cat.includes('restaurant') || cat.includes('food')) emoji = '🍽️';
  else if (cat.includes('cafe')) emoji = '☕';
  else if (cat.includes('medical') || cat.includes('pharmacy')) emoji = '🏥';

  return L.divIcon({
    className: 'nearby-marker',
    html: `
      <div style="
        background: #ffffff;
        width: 28px;
        height: 28px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        border: 2px solid #E6A23C;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      ">
        ${emoji}
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
};

export default function LiveTripPage() {
  const navigate = useNavigate();
  const { currentItinerary } = useTrip();
  const {
    isLiveActive,
    currentDayNumber,
    activeStopIndex,
    userCoords,
    isGpsLocked,
    isSimulating,
    simulationSpeed,
    liveStops,
    liveAlerts,
    liveWarnings,
    suggestedAction,
    delayMinutes,
    isRecalculating,
    completedStopIds,
    skippedStopIds,
    markStopVisited,
    skipStop,
    addManualDelay,
    startSimulation,
    pauseSimulation,
    setSimulationSpeed,
    requestDeviceGps,
    endLiveTrip,
    recalculateLive,
  } = useLiveTrip();

  const [nearbyPlaces, setNearbyPlaces] = useState([]);
  const [activeNearbyCategory, setActiveNearbyCategory] = useState(null);
  const [loadingNearby, setLoadingNearby] = useState(false);
  const [currentTimeStr, setCurrentTimeStr] = useState('');

  // Clock ticker
  useEffect(() => {
    const updateTime = () => {
      const d = new Date();
      setCurrentTimeStr(
        d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Current targeted stop
  const currentTargetStop = useMemo(() => {
    if (!liveStops || liveStops.length === 0) return null;
    return (
      liveStops.find(
        (s) =>
          !completedStopIds.includes(String(s.place_id || s.id)) &&
          !skippedStopIds.includes(String(s.place_id || s.id))
      ) || liveStops[liveStops.length - 1]
    );
  }, [liveStops, completedStopIds, skippedStopIds]);

  // Distance from user to current target
  const distanceToTargetKm = useMemo(() => {
    if (!currentTargetStop || !userCoords) return 0;
    const dLat = (currentTargetStop.latitude - userCoords.latitude) * 111.0;
    const dLon =
      (currentTargetStop.longitude - userCoords.longitude) *
      111.0 *
      Math.cos((userCoords.latitude * Math.PI) / 180.0);
    return Math.sqrt(dLat * dLat + dLon * dLon) * 1.35; // highway circuity
  }, [currentTargetStop, userCoords]);

  // Quick nearby search handler
  const handleSearchNearby = async (category) => {
    if (activeNearbyCategory === category) {
      setActiveNearbyCategory(null);
      setNearbyPlaces([]);
      return;
    }

    setActiveNearbyCategory(category);
    setLoadingNearby(true);
    try {
      const res = await liveTripService.getNearbyPlaces(
        userCoords.latitude,
        userCoords.longitude,
        category,
        6000,
        6
      );
      if (res && res.places) {
        setNearbyPlaces(res.places);
      }
    } catch (e) {
      console.warn('Nearby fetch error:', e);
    } finally {
      setLoadingNearby(false);
    }
  };

  // Add nearby place to active stops as an immediate detour
  const handleAddDetour = (place) => {
    const detourStop = {
      stop_order: activeStopIndex + 1,
      place_id: `detour_${place.place_id}`,
      name: `Detour: ${place.name}`,
      latitude: place.latitude,
      longitude: place.longitude,
      category: place.category,
      arrival_time: 'Now',
      departure_time: 'Now',
      visit_duration_mins: place.estimated_detour_mins || 20,
      travel_duration_mins: 5.0,
      travel_distance_km: place.distance_km,
      entrance_fee_per_person: 0.0,
      total_entrance_fee: 0.0,
      fee_status: 'free',
      is_rest_stop: true,
    };

    const nextStops = [...liveStops];
    nextStops.splice(activeStopIndex, 0, detourStop);
    setNearbyPlaces([]);
    setActiveNearbyCategory(null);
    recalculateLive(0, { latitude: place.latitude, longitude: place.longitude });
  };

  // Polyline coordinates from userCoords to remaining stops
  const routePolyline = useMemo(() => {
    const points = [[userCoords.latitude, userCoords.longitude]];
    (liveStops || []).forEach((s) => {
      const sId = String(s.place_id || s.id);
      if (!completedStopIds.includes(sId) && !skippedStopIds.includes(sId)) {
        points.push([s.latitude, s.longitude]);
      }
    });
    return points;
  }, [userCoords, liveStops, completedStopIds, skippedStopIds]);

  return (
    <div className="min-h-screen bg-[#F0F4F3] flex flex-col">
      {/* Top Cockpit HUD Bar */}
      <header className="bg-[#163B46] text-white px-4 sm:px-6 py-3 border-b border-[#244F59] shadow-soft-lg sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="w-3 h-3 rounded-full bg-emerald-400 animate-ping" />
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-extrabold text-sm sm:text-base tracking-tight text-white flex items-center">
                  <Navigation className="w-4 h-4 text-[#18B8A6] mr-1.5 inline animate-pulse" />
                  Live Trip Navigation
                </span>
                <span className="text-[10px] font-bold bg-[#18B8A6] text-white px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Day {currentDayNumber} Active
                </span>
              </div>
              <p className="text-[11px] text-[#A2B4BA]">
                {currentItinerary?.destination || 'Destination'} Tour • Real-Time Route Execution
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs">
            {/* Clock */}
            <div className="bg-[#0E2830] px-3 py-1.5 rounded-xl border border-[#244F59] flex items-center space-x-1.5">
              <Clock className="w-3.5 h-3.5 text-[#18B8A6]" />
              <span className="font-mono font-bold tracking-wider text-emerald-300">{currentTimeStr}</span>
            </div>

            {/* GPS Telemetry status */}
            <div className="bg-[#0E2830] px-3 py-1.5 rounded-xl border border-[#244F59] flex items-center space-x-1.5">
              <Compass className={`w-3.5 h-3.5 ${isSimulating ? 'text-amber-400' : 'text-emerald-400'}`} />
              <span className="text-[11px] font-semibold text-[#DCE6E3]">
                {isSimulating ? `Simulator (${simulationSpeed}x)` : isGpsLocked ? 'GPS Locked' : 'GPS Active'}
              </span>
            </div>

            {/* Delay pill */}
            {delayMinutes > 0 ? (
              <div className="bg-amber-950/80 border border-amber-500/50 text-amber-200 px-3 py-1.5 rounded-xl text-[11px] font-bold flex items-center space-x-1">
                <AlertTriangle className="w-3 h-3 text-amber-400" />
                <span>+{delayMinutes}m Delayed</span>
              </div>
            ) : (
              <div className="bg-emerald-950/80 border border-emerald-500/50 text-emerald-200 px-3 py-1.5 rounded-xl text-[11px] font-bold flex items-center space-x-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                <span>On Schedule</span>
              </div>
            )}

            {/* Exit button */}
            <button
              onClick={() => {
                endLiveTrip();
                navigate('/itinerary');
              }}
              className="px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs transition-colors"
            >
              Exit Live Mode
            </button>
          </div>
        </div>
      </header>

      {/* Main Live Interface Layout */}
      <main className="max-w-7xl w-full mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 flex-grow">
        {/* Left Column: Active Target Stop & Dynamic Timeline (5 cols) */}
        <section className="lg:col-span-5 space-y-5 flex flex-col justify-between">
          {/* Active Target Hero Card */}
          {currentTargetStop && (
            <div className="bg-white rounded-3xl p-5 border border-[#DCE6E3] shadow-soft-lg space-y-4 relative overflow-hidden">
              <div className="absolute top-0 right-0 left-0 h-1.5 bg-gradient-to-r from-[#18B8A6] via-[#16A36A] to-[#E6A23C]" />

              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#18B8A6] bg-[#18B8A6]/10 px-2.5 py-0.5 rounded-full border border-[#18B8A6]/20">
                  Target Stop #{currentTargetStop.stop_order}
                </span>
                <span className="text-xs font-bold text-[#52636A]">
                  ETA: <span className="text-[#163B46] font-extrabold">{currentTargetStop.arrival_time}</span>
                </span>
              </div>

              <div>
                <h2 className="text-xl font-extrabold text-[#163B46] tracking-tight leading-snug">
                  {capitalizeWords(currentTargetStop.name)}
                </h2>
                {currentTargetStop.address && (
                  <p className="text-xs text-[#52636A] mt-1 line-clamp-1">{currentTargetStop.address}</p>
                )}
              </div>

              {/* Distance & Time Counter */}
              <div className="grid grid-cols-2 gap-3 p-3.5 rounded-2xl bg-[#F4F7F6] border border-[#DCE6E3]">
                <div>
                  <span className="text-[10px] font-bold uppercase text-[#829196]">Distance to Stop</span>
                  <p className="text-lg font-extrabold text-[#163B46]">
                    {formatDistanceKm(distanceToTargetKm)}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-[#829196]">Planned Stay</span>
                  <p className="text-lg font-extrabold text-[#16A36A]">
                    {currentTargetStop.visit_duration_mins} mins
                  </p>
                </div>
              </div>

              {/* Warning/Closure Alert for Active Stop */}
              {currentTargetStop.opening_hours_warning && (
                <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200 text-xs text-amber-900 flex items-start space-x-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span className="font-semibold">{currentTargetStop.opening_hours_warning}</span>
                </div>
              )}

              {/* Primary On-The-Go Action Controls */}
              <div className="space-y-2 pt-1">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => markStopVisited(currentTargetStop.place_id || currentTargetStop.id)}
                    className="w-full py-3 px-4 rounded-2xl bg-[#10B981] hover:bg-[#059669] text-white font-extrabold text-xs shadow-soft transition-all flex items-center justify-center space-x-1.5"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Mark as Visited</span>
                  </button>

                  <button
                    onClick={() => skipStop(currentTargetStop.place_id || currentTargetStop.id)}
                    className="w-full py-3 px-4 rounded-2xl bg-white border border-[#DCE6E3] hover:bg-[#EEF3F1] text-[#52636A] font-extrabold text-xs shadow-xs transition-all flex items-center justify-center space-x-1.5"
                  >
                    <span>Skip This Stop</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${currentTargetStop.latitude},${currentTargetStop.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-2.5 px-3 rounded-2xl bg-[#18B8A6] hover:bg-[#129889] text-white font-bold text-xs text-center flex items-center justify-center space-x-1.5 shadow-soft transition-colors"
                  >
                    <Navigation className="w-3.5 h-3.5" />
                    <span>Google Maps Turn-by-Turn</span>
                  </a>

                  <button
                    onClick={() => addManualDelay(15)}
                    className="w-full py-2.5 px-3 rounded-2xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 font-bold text-xs flex items-center justify-center space-x-1.5 transition-colors"
                  >
                    <Clock className="w-3.5 h-3.5 text-amber-600" />
                    <span>+15m Late Delay</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Dynamic Suggested Action Banner */}
          {suggestedAction && (
            <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-500/10 via-[#18B8A6]/10 to-teal-500/10 border border-[#18B8A6]/20 flex items-start space-x-3">
              <Sparkles className="w-5 h-5 text-[#18B8A6] shrink-0 mt-0.5" />
              <div className="text-xs">
                <p className="font-extrabold text-[#163B46]">AI On-Trip Recommendation</p>
                <p className="text-[#52636A] mt-0.5 font-medium leading-relaxed">{suggestedAction}</p>
              </div>
            </div>
          )}

          {/* Sequential Live Schedule List */}
          <div className="bg-white rounded-3xl p-5 border border-[#DCE6E3] shadow-soft space-y-3 flex-grow flex flex-col">
            <div className="flex items-center justify-between border-b border-[#DCE6E3] pb-2.5">
              <h3 className="text-sm font-extrabold text-[#163B46] flex items-center space-x-2">
                <Route className="w-4 h-4 text-[#18B8A6]" />
                <span>Today's Recalculated Sequence</span>
              </h3>
              {isRecalculating && (
                <span className="text-[11px] text-[#18B8A6] font-bold animate-pulse">Recalculating...</span>
              )}
            </div>

            <div className="space-y-2 overflow-y-auto max-h-[340px] pr-1">
              {liveStops.map((stop, idx) => {
                const sId = String(stop.place_id || stop.id || idx);
                const isVisited = completedStopIds.includes(sId);
                const isSkipped = skippedStopIds.includes(sId);
                const isActive = currentTargetStop && String(currentTargetStop.place_id || currentTargetStop.id) === sId;

                return (
                  <div
                    key={`live-stop-${sId}`}
                    className={`p-3 rounded-2xl border transition-all flex items-center justify-between text-xs ${
                      isActive
                        ? 'bg-amber-50/80 border-amber-300 ring-2 ring-amber-400/20'
                        : isVisited
                        ? 'bg-emerald-50/60 border-emerald-200 opacity-60'
                        : isSkipped
                        ? 'bg-slate-100 border-slate-200 line-through opacity-40'
                        : 'bg-[#F4F7F6] border-[#DCE6E3]'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5">
                      <span
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-extrabold text-white shadow-xs ${
                          isActive
                            ? 'bg-amber-500 animate-pulse'
                            : isVisited
                            ? 'bg-emerald-600'
                            : isSkipped
                            ? 'bg-slate-400'
                            : 'bg-[#163B46]'
                        }`}
                      >
                        {isVisited ? '✓' : isSkipped ? '—' : stop.stop_order || idx + 1}
                      </span>
                      <div>
                        <h4 className="font-bold text-[#163B46] line-clamp-1">{stop.name}</h4>
                        <p className="text-[11px] text-[#52636A]">
                          {stop.arrival_time} - {stop.departure_time} ({stop.visit_duration_mins}m)
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-1.5">
                      {isActive && (
                        <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-amber-500 text-white">
                          En Route
                        </span>
                      )}
                      {isVisited && (
                        <span className="text-[10px] font-bold text-emerald-700">Visited</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Right Column: Live Map & Detour Controls (7 cols) */}
        <section className="lg:col-span-7 space-y-4 flex flex-col justify-between">
          {/* Quick Nearby Detour Finder Pills */}
          <div className="bg-white p-3.5 rounded-2xl border border-[#DCE6E3] shadow-soft flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold text-[#163B46] flex items-center">
              <Zap className="w-3.5 h-3.5 text-[#E6A23C] mr-1.5" />
              Quick On-Trip Detour:
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { id: 'fuel', label: 'Fuel Station', icon: Fuel, color: 'text-amber-600' },
                { id: 'restaurant', label: 'Restaurant', icon: Utensils, color: 'text-emerald-600' },
                { id: 'cafe', label: 'Cafe / Tea', icon: Coffee, color: 'text-orange-600' },
                { id: 'medical', label: 'Pharmacy', icon: Hospital, color: 'text-rose-600' },
              ].map((btn) => (
                <button
                  key={btn.id}
                  onClick={() => handleSearchNearby(btn.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-1 ${
                    activeNearbyCategory === btn.id
                      ? 'bg-[#163B46] text-white shadow-soft'
                      : 'bg-[#F4F7F6] text-[#52636A] hover:bg-[#EEF3F1] hover:text-[#163B46]'
                  }`}
                >
                  <btn.icon className={`w-3.5 h-3.5 ${activeNearbyCategory === btn.id ? 'text-white' : btn.color}`} />
                  <span>{btn.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Interactive Live Map Component */}
          <div className="h-[480px] rounded-3xl overflow-hidden border border-[#DCE6E3] shadow-soft-lg relative bg-white">
            <MapContainer
              center={[userCoords.latitude, userCoords.longitude]}
              zoom={13}
              scrollWheelZoom={true}
              style={{ width: '100%', height: '100%' }}
            >
              <MapFollower center={[userCoords.latitude, userCoords.longitude]} />

              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                maxZoom={19}
              />

              {/* Real-time Route Polyline */}
              <Polyline
                positions={routePolyline}
                pathOptions={{
                  color: '#18B8A6',
                  weight: 5,
                  opacity: 0.85,
                  dashArray: '4, 8',
                  lineCap: 'round',
                }}
              />

              {/* User Live Marker */}
              <Marker
                position={[userCoords.latitude, userCoords.longitude]}
                icon={createUserLiveIcon()}
              >
                <Popup>
                  <div className="p-1 text-xs">
                    <span className="font-extrabold text-[#18B8A6] uppercase tracking-wider text-[10px]">
                      Your Live Position
                    </span>
                    <p className="font-bold text-[#163B46] mt-0.5">
                      {isSimulating ? 'Simulated Traveler Position' : 'Live GPS Location'}
                    </p>
                  </div>
                </Popup>
              </Marker>

              {/* Itinerary Stops */}
              {liveStops.map((stop, idx) => {
                const sId = String(stop.place_id || stop.id || idx);
                const isVisited = completedStopIds.includes(sId);
                const isSkipped = skippedStopIds.includes(sId);
                const isActive = currentTargetStop && String(currentTargetStop.place_id || currentTargetStop.id) === sId;

                const status = isActive ? 'active' : isVisited ? 'completed' : isSkipped ? 'skipped' : 'pending';

                return (
                  <Marker
                    key={`map-stop-${sId}`}
                    position={[stop.latitude, stop.longitude]}
                    icon={createStopIcon(stop.stop_order || idx + 1, status)}
                  >
                    <Popup>
                      <div className="p-1 space-y-1 text-xs min-w-[180px]">
                        <span className="text-[10px] font-bold text-[#18B8A6] uppercase">
                          Stop #{stop.stop_order || idx + 1}
                        </span>
                        <h4 className="font-bold text-[#163B46]">{stop.name}</h4>
                        <p className="text-[11px] text-[#52636A]">
                          Arrival: <span className="font-bold">{stop.arrival_time}</span>
                        </p>
                        {status === 'active' && (
                          <div className="pt-1">
                            <button
                              onClick={() => markStopVisited(sId)}
                              className="w-full py-1 px-2 rounded-lg bg-emerald-600 text-white font-bold text-[10px]"
                            >
                              Mark Visited
                            </button>
                          </div>
                        )}
                      </div>
                    </Popup>
                  </Marker>
                );
              })}

              {/* Nearby Discovered Detours */}
              {nearbyPlaces.map((np) => (
                <Marker
                  key={np.place_id}
                  position={[np.latitude, np.longitude]}
                  icon={createNearbyIcon(np.category)}
                >
                  <Popup>
                    <div className="p-1 space-y-1.5 text-xs min-w-[180px]">
                      <span className="text-[10px] font-bold uppercase text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                        Nearby Service ({np.distance_km} km)
                      </span>
                      <h4 className="font-bold text-[#163B46]">{np.name}</h4>
                      <p className="text-[11px] text-[#52636A]">{np.address}</p>
                      <button
                        onClick={() => handleAddDetour(np)}
                        className="w-full py-1.5 px-2 bg-[#E6A23C] hover:bg-[#D97706] text-white font-extrabold text-[11px] rounded-xl shadow-xs transition-colors"
                      >
                        + Add Stop as Detour
                      </button>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>

          {/* GPS Simulator Cockpit Controller (Ideal for Evaluator & Test Demos) */}
          <div className="p-4 rounded-3xl bg-white border border-[#DCE6E3] shadow-soft flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center space-x-2">
              <span className="font-extrabold text-[#163B46]">GPS Test Simulator:</span>
              <span className="text-[11px] text-[#52636A]">
                Drive dynamically along route to test real-time schedule recalculations.
              </span>
            </div>

            <div className="flex items-center space-x-2">
              {isSimulating ? (
                <button
                  onClick={pauseSimulation}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold flex items-center space-x-1.5 transition-colors shadow-soft"
                >
                  <Pause className="w-3.5 h-3.5" />
                  <span>Pause Drive</span>
                </button>
              ) : (
                <button
                  onClick={startSimulation}
                  className="px-4 py-2 rounded-xl bg-[#18B8A6] hover:bg-[#129889] text-white font-bold flex items-center space-x-1.5 transition-colors shadow-soft"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Start Live Drive</span>
                </button>
              )}

              {/* Speed Buttons */}
              <div className="flex items-center space-x-1 bg-[#F4F7F6] p-1 rounded-xl border border-[#DCE6E3]">
                {[1, 2, 5, 10].map((spd) => (
                  <button
                    key={spd}
                    onClick={() => setSimulationSpeed(spd)}
                    className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all ${
                      simulationSpeed === spd
                        ? 'bg-[#163B46] text-white shadow-xs'
                        : 'text-[#52636A] hover:bg-[#EEF3F1]'
                    }`}
                  >
                    {spd}x
                  </button>
                ))}
              </div>

              {/* Real device GPS sync */}
              <button
                onClick={requestDeviceGps}
                className="px-3 py-2 rounded-xl bg-white border border-[#DCE6E3] hover:bg-[#EEF3F1] text-[#163B46] font-bold text-xs transition-colors flex items-center space-x-1"
                title="Sync with real browser GPS"
              >
                <Compass className="w-3.5 h-3.5 text-[#18B8A6]" />
                <span>Use Phone/PC GPS</span>
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

