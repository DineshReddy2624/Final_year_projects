import React, { useState, useEffect, useMemo } from 'react';
import {
  Navigation,
  Route,
  Car,
  Footprints,
  ShieldAlert,
  Sparkles,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Clock,
  Compass,
  AlertCircle,
  CheckCircle2,
  MapPin,
  Fuel,
  Info,
} from 'lucide-react';
import locationService from '../services/locationService';
import { formatCurrency, formatDistanceKm, capitalizeWords } from '../utils/formatters';

const VEHICLES = [
  { id: 'driving-car', label: 'Car', icon: '🚗', speed: '55-80 km/h', desc: 'Highway & Tollways' },
  { id: 'cycling-regular', label: 'Two-Wheeler / Bike', icon: '🏍️', speed: '40-55 km/h', desc: 'Agile & Scenic' },
  { id: 'foot-walking', label: 'Walking', icon: '🚶', speed: '4.8 km/h', desc: 'Pedestrian & Heritage' },
];

export default function RouteAssistanceCard({
  itinerary,
  initialVehicle = 'driving-car',
  onVehicleChange = null,
}) {
  const [selectedVehicle, setSelectedVehicle] = useState(initialVehicle || 'driving-car');
  const [assistanceData, setAssistanceData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expandedLegIndex, setExpandedLegIndex] = useState(null);
  const [activeTab, setActiveTab] = useState('legs'); // 'legs' | 'tips'

  // Extract source waypoint and ordered destination waypoints from itinerary
  const { sourceWaypoint, destinationWaypoints } = useMemo(() => {
    if (!itinerary) return { sourceWaypoint: null, destinationWaypoints: [] };

    let src = null;
    if (itinerary.source_location && itinerary.source_location.latitude) {
      src = {
        name: itinerary.source_location.name || 'Origin Hub',
        latitude: itinerary.source_location.latitude,
        longitude: itinerary.source_location.longitude,
        address: itinerary.source_location.formatted_address,
        category: 'Origin Hub',
      };
    }

    const dests = [];
    (itinerary.days || []).forEach((day) => {
      (day.stops || []).forEach((stop) => {
        if (stop.latitude && stop.longitude) {
          // If no source was found yet and this is start location
          if (!src && stop.is_start_location) {
            src = {
              name: stop.name,
              latitude: stop.latitude,
              longitude: stop.longitude,
              address: stop.address,
              category: stop.category,
            };
          } else {
            dests.push({
              name: stop.name,
              latitude: stop.latitude,
              longitude: stop.longitude,
              address: stop.address,
              category: stop.category,
              stop_order: stop.stop_order,
              day_number: day.day_number,
            });
          }
        }
      });
    });

    // Fallback if source was still null
    if (!src && dests.length > 0) {
      src = dests.shift();
    }

    return { sourceWaypoint: src, destinationWaypoints: dests };
  }, [itinerary]);

  // Load route assistance whenever vehicle or waypoints change
  useEffect(() => {
    let isCancelled = false;

    const loadAssistance = async () => {
      if (!sourceWaypoint || destinationWaypoints.length === 0) return;

      setLoading(true);
      setError(null);
      try {
        const data = await locationService.getRouteAssistance({
          source: sourceWaypoint,
          destinations: destinationWaypoints,
          profile: selectedVehicle,
        });

        if (!isCancelled) {
          setAssistanceData(data);
        }
      } catch (err) {
        if (!isCancelled) {
          console.warn('Route assistance loading error:', err);
          setError('Could not calculate live assistance. Please check connectivity.');
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    };

    loadAssistance();

    return () => {
      isCancelled = true;
    };
  }, [selectedVehicle, sourceWaypoint, destinationWaypoints]);

  const handleSelectVehicle = (vId) => {
    setSelectedVehicle(vId);
    if (onVehicleChange) onVehicleChange(vId);
  };

  if (!sourceWaypoint || destinationWaypoints.length === 0) {
    return null;
  }

  const vConfig = VEHICLES.find((v) => v.id === selectedVehicle) || VEHICLES[0];

  return (
    <div className="rounded-3xl bg-white border border-[#DCE6E3] shadow-soft overflow-hidden transition-all">
      {/* Header & Vehicle Selector */}
      <div className="p-5 sm:p-6 bg-gradient-to-r from-emerald-50/80 via-teal-50/40 to-white border-b border-[#DCE6E3] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <span className="p-2 rounded-xl bg-[#16A36A] text-white shadow-xs">
                <Navigation className="w-4 h-4" />
              </span>
              <h3 className="text-lg font-extrabold text-[#163B46]">
                Route Assistance: Source to All Destinations
              </h3>
            </div>
            <p className="text-xs text-[#52636A]">
              Step-by-step navigation, corridor advice, and live Google Maps guidance tailored for your selected vehicle.
            </p>
          </div>

          {/* Master Multi-Stop Navigation Button */}
          {assistanceData?.full_circuit_google_maps_url && (
            <a
              href={assistanceData.full_circuit_google_maps_url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2.5 rounded-2xl bg-[#16A36A] hover:bg-[#128254] text-white text-xs font-bold shadow-soft flex items-center justify-center space-x-2 transition-all shrink-0 hover:scale-[1.02]"
              title="Launch complete multi-destination navigation in Google Maps app"
            >
              <span>Launch All in Google Maps</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>

        {/* Vehicle Mode Switcher */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-xs font-bold text-[#52636A] mr-1 flex items-center">
            <Route className="w-3.5 h-3.5 mr-1 text-[#18B8A6]" />
            Select Vehicle:
          </span>
          <div className="flex flex-wrap gap-1.5 p-1 rounded-2xl bg-white/90 border border-[#DCE6E3] shadow-2xs">
            {VEHICLES.map((v) => {
              const isSelected = selectedVehicle === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => handleSelectVehicle(v.id)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center space-x-2 transition-all ${
                    isSelected
                      ? 'bg-[#163B46] text-white shadow-soft ring-2 ring-[#163B46]/20'
                      : 'text-[#52636A] hover:text-[#163B46] hover:bg-[#EEF3F1]'
                  }`}
                >
                  <span className="text-base">{v.icon}</span>
                  <span>{v.label}</span>
                  <span className={`text-[10px] hidden md:inline px-1.5 py-0.2 rounded-md ${isSelected ? 'bg-white/20 text-white' : 'bg-[#EEF3F1] text-[#829196]'}`}>
                    {v.speed}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Route Stats Overview Bar */}
        {assistanceData && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 text-xs">
            <div className="p-3 rounded-2xl bg-white border border-emerald-100 shadow-2xs space-y-0.5">
              <span className="text-[10px] text-[#829196] uppercase font-bold tracking-wider block">Total Road Circuit</span>
              <div className="text-sm font-black text-[#163B46]">
                {assistanceData.total_distance_km} km
              </div>
              <span className="text-[10px] text-emerald-700 font-semibold">{assistanceData.vehicle_label}</span>
            </div>

            <div className="p-3 rounded-2xl bg-white border border-emerald-100 shadow-2xs space-y-0.5">
              <span className="text-[10px] text-[#829196] uppercase font-bold tracking-wider block">Estimated Travel Time</span>
              <div className="text-sm font-black text-[#16A36A]">
                ~{assistanceData.total_duration_display}
              </div>
              <span className="text-[10px] text-[#52636A]">@ ~{assistanceData.speed_kmh} km/h avg</span>
            </div>

            <div className="p-3 rounded-2xl bg-white border border-emerald-100 shadow-2xs space-y-0.5">
              <span className="text-[10px] text-[#829196] uppercase font-bold tracking-wider block">Sequential Legs</span>
              <div className="text-sm font-black text-[#163B46]">
                {assistanceData.legs.length} Waypoint Legs
              </div>
              <span className="text-[10px] text-[#52636A]">Across all {assistanceData.total_stops_count} stops</span>
            </div>

            <div className="p-3 rounded-2xl bg-white border border-emerald-100 shadow-2xs space-y-0.5">
              <span className="text-[10px] text-[#829196] uppercase font-bold tracking-wider block">Start Point</span>
              <div className="text-xs font-black text-[#163B46] truncate" title={sourceWaypoint.name}>
                🚩 {sourceWaypoint.name}
              </div>
              <span className="text-[10px] text-[#16A36A] font-semibold">Origin departure</span>
            </div>
          </div>
        )}
      </div>

      {/* Assistance Sub-Navigation Tabs */}
      <div className="px-6 py-2.5 bg-[#F9FBFA] border-b border-[#DCE6E3] flex items-center justify-between text-xs">
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => setActiveTab('legs')}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
              activeTab === 'legs'
                ? 'bg-white text-[#163B46] border border-[#DCE6E3] shadow-xs'
                : 'text-[#52636A] hover:text-[#163B46]'
            }`}
          >
            Sequential Leg Directions ({assistanceData?.legs?.length || 0})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('tips')}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
              activeTab === 'tips'
                ? 'bg-white text-[#163B46] border border-[#DCE6E3] shadow-xs'
                : 'text-[#52636A] hover:text-[#163B46]'
            }`}
          >
            Vehicle Safety & Road Advisories
          </button>
        </div>

        <span className="text-[11px] text-[#829196] hidden sm:inline">
          Click any leg to open turn-by-turn Google Maps
        </span>
      </div>

      {/* Main Tab Content */}
      <div className="p-5 sm:p-6 space-y-3">
        {loading && (
          <div className="py-8 text-center text-xs text-[#52636A] space-y-2">
            <div className="w-6 h-6 border-2 border-[#18B8A6] border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="font-semibold">Calculating vehicle route assistance for {vConfig.label}...</p>
          </div>
        )}

        {error && (
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {!loading && assistanceData && activeTab === 'legs' && (
          <div className="space-y-3">
            {assistanceData.legs.map((leg, idx) => {
              const isExpanded = expandedLegIndex === idx;
              return (
                <div
                  key={`leg-${leg.leg_index}`}
                  className="rounded-2xl border border-[#DCE6E3] bg-[#FDFEFE] hover:bg-white hover:border-[#18B8A6]/40 transition-all shadow-2xs overflow-hidden"
                >
                  <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start space-x-3 flex-1 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center text-[#16A36A] font-extrabold text-xs shrink-0 mt-0.5">
                        {leg.leg_index}
                      </div>

                      <div className="space-y-1 flex-1 min-w-0">
                        <div className="flex items-center space-x-2">
                          <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 truncate">
                            {leg.road_corridor}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-[#163B46] font-bold">
                          <span className="truncate max-w-[200px]" title={leg.from_name}>{leg.from_name}</span>
                          <span className="text-[#18B8A6] font-extrabold">➔</span>
                          <span className="text-[#16A36A] truncate max-w-[200px]" title={leg.to_name}>{leg.to_name}</span>
                        </div>

                        <p className="text-[11px] text-[#52636A] leading-relaxed">
                          {leg.guidance_notes}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-3 self-end sm:self-center shrink-0">
                      <div className="text-right">
                        <span className="text-xs font-black text-[#163B46] block">{leg.distance_km} km</span>
                        <span className="text-[11px] font-semibold text-[#16A36A]">~{leg.duration_display}</span>
                      </div>

                      <a
                        href={leg.google_maps_leg_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3.5 py-2 rounded-xl bg-[#F4F7F6] hover:bg-[#16A36A] text-[#163B46] hover:text-white border border-[#DCE6E3] hover:border-transparent text-xs font-bold shadow-2xs flex items-center space-x-1.5 transition-all"
                        title="Start turn-by-turn navigation for this leg in Google Maps"
                      >
                        <span>Navigate Leg</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!loading && assistanceData && activeTab === 'tips' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200 space-y-2.5">
              <div className="flex items-center space-x-2 text-emerald-900 font-bold text-xs uppercase tracking-wider">
                <CheckCircle2 className="w-4 h-4 text-[#16A36A]" />
                <span>{vConfig.label} Preparedness Tips</span>
              </div>
              <ul className="space-y-2 text-xs text-[#26383D]">
                {assistanceData.vehicle_tips.map((tip, tIdx) => (
                  <li key={tIdx} className="flex items-start space-x-2">
                    <span className="text-[#16A36A] font-bold mt-0.5">•</span>
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200 space-y-2.5">
              <div className="flex items-center space-x-2 text-amber-900 font-bold text-xs uppercase tracking-wider">
                <ShieldAlert className="w-4 h-4 text-amber-600" />
                <span>Safety & Road Advisories</span>
              </div>
              <ul className="space-y-2 text-xs text-[#26383D]">
                {assistanceData.safety_advisories.map((adv, aIdx) => (
                  <li key={aIdx} className="flex items-start space-x-2">
                    <span className="text-amber-600 font-bold mt-0.5">!</span>
                    <span>{adv}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
