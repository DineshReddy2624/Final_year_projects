import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Compass,
  Calendar,
  Clock,
  MapPin,
  Route,
  DollarSign,
  CloudSun,
  Sparkles,
  FileText,
  Map as MapIcon,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Car,
  Utensils,
  Share2,
  Download,
  Info,
  Fuel,
  Navigation,
  RotateCcw,
  Hotel,
  Coffee,
  Bed,
  ShieldAlert,
  ExternalLink,
} from 'lucide-react';
import { useTrip } from '../context/TripContext';
import itineraryService from '../services/itineraryService';
import pdfExportService from '../services/pdfExportService';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import AttractionImage from '../components/AttractionImage';
import {
  formatCurrency,
  formatDurationMins,
  formatDistanceKm,
  formatDateDisplay,
  getCategoryBadgeColor,
  formatFeasibilityStatus,
  capitalizeWords,
} from '../utils/formatters';

export default function ItineraryPage() {
  const navigate = useNavigate();
  const {
    tripPlan,
    currentItinerary,
    setCurrentItinerary,
    selectedAttractions,
    saveCurrentTrip,
  } = useTrip();

  const [activeDayTab, setActiveDayTab] = useState(1);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState(null);

  // Auto-generate if not loaded
  useEffect(() => {
    const autoGen = async () => {
      if (!currentItinerary) {
        setRegenerating(true);
        setError(null);
        try {
          const itin = await itineraryService.generateItinerary({
            destination: tripPlan.destination || 'Hyderabad',
            startDate: tripPlan.startDate,
            endDate: tripPlan.endDate,
            travelersCount: tripPlan.travelersCount || 1,
            budget: tripPlan.budget || 5000,
            dailyAvailableHours: tripPlan.dailyAvailableHours || 8.0,
            transportation: tripPlan.transportation || 'driving-car',
            pace: tripPlan.pace || 'relaxed',
            selectedAttractions: selectedAttractions.length > 0 ? selectedAttractions : null,
          });
          setCurrentItinerary(itin);
          saveCurrentTrip(itin);
        } catch (err) {
          setError(err.message || 'Could not automatically generate itinerary.');
        } finally {
          setRegenerating(false);
        }
      }
    };

    autoGen();
  }, [currentItinerary]);

  const handleRegenerate = async () => {
    setRegenerating(true);
    setError(null);
    try {
      const itin = await itineraryService.generateItinerary({
        destination: tripPlan.destination,
        source: tripPlan.source || 'Hyderabad Airport (RGIA)',
        roundTrip: tripPlan.roundTrip !== undefined ? tripPlan.roundTrip : true,
        startDate: tripPlan.startDate,
        endDate: tripPlan.endDate,
        travelersCount: tripPlan.travelersCount,
        budget: tripPlan.budget,
        dailyAvailableHours: tripPlan.dailyAvailableHours,
        transportation: tripPlan.transportation,
        pace: tripPlan.pace,
        selectedAttractions: selectedAttractions.length > 0 ? selectedAttractions : null,
        fuelType: tripPlan.fuelType || 'petrol',
        mileageKmpl: tripPlan.mileageKmpl || 14.0,
        fuelPricePerLitre: tripPlan.fuelPricePerLitre || 105.0,
        accommodationType: tripPlan.accommodationType || 'standard',
        includeAccommodation: tripPlan.includeAccommodation !== undefined ? tripPlan.includeAccommodation : true,
        maxDailyDrivingHours: tripPlan.maxDailyDrivingHours || 5.5,
        enableStopoverRecommendation: tripPlan.enableStopoverRecommendation !== undefined ? tripPlan.enableStopoverRecommendation : true,
        roomsNeeded: tripPlan.roomsNeeded || 1,
      });
      setCurrentItinerary(itin);
      saveCurrentTrip(itin);
    } catch (err) {
      setError(err.message || 'Failed to regenerate itinerary.');
    } finally {
      setRegenerating(false);
    }
  };

  const handleExportPdf = () => {
    if (currentItinerary) {
      pdfExportService.generateItineraryPdf(currentItinerary);
    }
  };

  if (regenerating && !currentItinerary) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <LoadingSpinner
          size="lg"
          label="Synthesizing multi-day schedule, 2-Opt routes & weather allocations..."
        />
      </div>
    );
  }

  if (!currentItinerary) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-white border border-[#DCE6E3] shadow-soft flex items-center justify-center mx-auto text-[#18B8A6]">
          <Compass className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold text-[#163B46]">No Itinerary Generated Yet</h2>
        <p className="text-sm text-[#52636A] max-w-md mx-auto">
          Configure your travel dates and preferences to let our engine construct an optimal schedule.
        </p>
        <button
          onClick={() => navigate('/plan')}
          className="px-6 py-3 rounded-xl bg-[#18B8A6] hover:bg-[#129889] text-white font-bold text-xs shadow-soft transition-colors"
        >
          Go to Trip Planner
        </button>
      </div>
    );
  }

  const itin = currentItinerary;
  const budget = itin.budget_summary || {};
  const categoryExpenses = budget.by_category || budget.category_breakdown || {};
  const activeDay = itin.days?.find((d) => d.day_number === activeDayTab) || itin.days?.[0];
  const vehicleMetrics = itin.vehicle_metrics || budget.vehicle_metrics;
  const isCarTrip = (itin.transportation || tripPlan.transportation) === 'driving-car';

  const feasibilityStatus = itin.feasibility_status || 'feasible';
  const isFeasible = feasibilityStatus.toLowerCase() === 'feasible';
  const isWarning = feasibilityStatus.toLowerCase().includes('warning');

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {/* --- Top Header & Action Controls --- */}
      <div className="p-8 rounded-3xl bg-white border border-[#DCE6E3] shadow-soft flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center space-x-2">
            <span className="px-3 py-1 rounded-full bg-[#18B8A6]/10 text-[#129889] text-xs font-bold border border-[#18B8A6]/20">
              {itin.total_days}-Day Tour Plan
            </span>
            <span className="text-xs text-[#829196]">•</span>
            <span
              className={`inline-flex items-center space-x-1.5 text-[11px] font-bold px-3 py-0.5 rounded-full border shadow-2xs ${
                isFeasible
                  ? 'bg-emerald-50 text-[#16A36A] border-emerald-200'
                  : isWarning
                  ? 'bg-amber-50 text-[#D97706] border-amber-200'
                  : 'bg-rose-50 text-rose-600 border-rose-200'
              }`}
            >
              {isFeasible ? (
                <CheckCircle2 className="w-3 h-3 text-[#16A36A] shrink-0" />
              ) : (
                <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
              )}
              <span>{formatFeasibilityStatus(feasibilityStatus)}</span>
            </span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-extrabold text-[#163B46] tracking-tight">
            {itin.destination} Travel Itinerary
          </h1>

          <p className="text-xs sm:text-sm text-[#52636A] flex flex-wrap items-center gap-2">
            <span>
              {formatDateDisplay(itin.start_date)} — {formatDateDisplay(itin.end_date)}
            </span>
            <span className="text-[#829196]">•</span>
            <span>{itin.travelers_count} traveler{itin.travelers_count > 1 ? 's' : ''}</span>
            <span className="text-[#829196]">•</span>
            <span>Total Road: <strong className="text-[#163B46]">{formatDistanceKm(itin.total_distance_km)}</strong></span>
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          <button
            onClick={handleRegenerate}
            disabled={regenerating}
            className="px-4 py-2.5 rounded-xl bg-white hover:bg-[#EEF3F1] text-[#26383D] text-xs font-semibold border border-[#DCE6E3] shadow-sm transition-colors flex items-center space-x-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${regenerating ? 'animate-spin' : ''}`} />
            <span>Regenerate</span>
          </button>

          <button
            onClick={() => navigate('/map')}
            className="px-4 py-2.5 rounded-xl bg-white hover:bg-[#EEF3F1] text-[#18B8A6] text-xs font-semibold border border-[#DCE6E3] shadow-sm transition-colors flex items-center space-x-1.5"
          >
            <MapIcon className="w-3.5 h-3.5" />
            <span>Map View</span>
          </button>

          <button
            onClick={handleExportPdf}
            className="px-5 py-2.5 rounded-xl bg-[#18B8A6] hover:bg-[#129889] text-white text-xs font-bold shadow-soft transition-all flex items-center space-x-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export PDF</span>
          </button>
        </div>
      </div>

      {error && <ErrorMessage message={error} onRetry={handleRegenerate} />}

      {/* --- Intelligent Journey Assessment Banner (Phase 6) --- */}
      {itin.journey_assessment && (
        <div className="p-6 rounded-3xl bg-gradient-to-r from-amber-500/10 via-amber-400/5 to-white border border-amber-300 shadow-soft space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center space-x-2.5">
              <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-xs">
                <Route className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wider ${
                      itin.journey_assessment.classification_badge === 'long_journey'
                        ? 'bg-amber-100 text-amber-900 border border-amber-300'
                        : itin.journey_assessment.classification_badge === 'very_long_journey'
                        ? 'bg-rose-100 text-rose-900 border border-rose-300'
                        : 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                    }`}
                  >
                    {itin.journey_assessment.journey_classification}
                  </span>
                  <span className="text-xs font-bold text-[#163B46]">
                    {itin.journey_assessment.source_name} → {itin.journey_assessment.destination_name}
                  </span>
                </div>
                <p className="text-xs text-[#52636A] mt-0.5">
                  Actual road distance: <strong>{itin.journey_assessment.total_road_distance_km} km</strong> • Continuous driving: <strong>~{itin.journey_assessment.total_driving_duration_hours} hrs</strong> (threshold: {itin.journey_assessment.max_continuous_driving_hours}h)
                </p>
              </div>
            </div>

            {itin.journey_assessment.is_overnight_stop_recommended && (
              <span className="px-3.5 py-1.5 rounded-xl bg-amber-500 text-white text-xs font-extrabold shadow-xs flex items-center space-x-1.5 shrink-0">
                <Hotel className="w-4 h-4" />
                <span>Overnight Midway Stopover Advised</span>
              </span>
            )}
          </div>

          <div className="p-3.5 rounded-2xl bg-white/90 border border-amber-200 text-xs text-[#26383D] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-start sm:items-center space-x-2">
              <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5 sm:mt-0" />
              <span>
                <strong>Driver Fatigue Advisory:</strong> {itin.journey_assessment.driver_fatigue_warning || 'Comfortable drive with scheduled rest breaks every ~130 km.'}
              </span>
            </div>
            {itin.journey_assessment.recommended_stopover_towns?.length > 0 && (
              <div className="flex items-center space-x-1.5 shrink-0 text-[11px] font-bold text-amber-900">
                <span>Recommended Stopover Hubs:</span>
                <span className="bg-amber-100 px-2.5 py-0.5 rounded-lg border border-amber-300">
                  {itin.journey_assessment.recommended_stopover_towns.join(', ')}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- Curated Hotel Accommodations Section (Phase 6 Engine) --- */}
      {(itin.stopover_accommodation || itin.destination_accommodation || itin.accommodation_summary) && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Hotel className="w-5 h-5 text-amber-600" />
              <h2 className="text-xl font-bold text-[#163B46]">Curated Hotel Accommodations & Rest Stops</h2>
            </div>
            {itin.accommodation_summary && (
              <span className="text-xs font-bold text-[#16A36A] bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                Total Lodging: {formatCurrency(itin.accommodation_summary.total_accommodation_cost)} ({itin.accommodation_summary.total_nights_stayed} Nights)
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Midway Stopover Hotel Card */}
            {itin.stopover_accommodation && (
              <div className="p-6 rounded-3xl bg-white border-2 border-amber-300 shadow-soft space-y-4 relative overflow-hidden">
                <div className="flex items-center justify-between">
                  <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-900 text-xs font-black uppercase tracking-wider border border-amber-300 flex items-center space-x-1">
                    <Hotel className="w-3.5 h-3.5 text-amber-700 mr-1" />
                    <span>Midway Stopover Stay ({itin.stopover_accommodation.stopover_town || 'Transit Hub'})</span>
                  </span>
                  <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-lg border border-amber-200">
                    Day 1 Overnight
                  </span>
                </div>

                <div className="flex gap-4">
                  <div className="w-24 h-24 rounded-2xl overflow-hidden shrink-0 bg-amber-50 border border-amber-200">
                    <img
                      src={itin.stopover_accommodation.image_url || 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=400&auto=format&fit=crop&q=80'}
                      alt={itin.stopover_accommodation.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="space-y-1 flex-1">
                    <h3 className="text-base font-extrabold text-[#163B46]">{itin.stopover_accommodation.name}</h3>
                    <p className="text-xs text-[#52636A] flex items-center">
                      <MapPin className="w-3.5 h-3.5 mr-1 text-amber-600 shrink-0" />
                      <span className="truncate">{itin.stopover_accommodation.address}</span>
                    </p>
                    <div className="flex items-center space-x-2 pt-1 text-xs">
                      <span className="font-black text-amber-800 text-sm">
                        {formatCurrency(itin.stopover_accommodation.estimated_nightly_price)}
                        <span className="text-[10px] font-normal text-[#829196]"> / night</span>
                      </span>
                      <span className="text-[#829196]">•</span>
                      <span className="text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.2 rounded text-[11px]">
                        ★ {itin.stopover_accommodation.rating || 4.2} ({itin.stopover_accommodation.review_count || 280} reviews)
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] text-[#52636A] bg-amber-50/50 p-3 rounded-xl border border-amber-100">
                  <div>
                    <span className="text-[#829196] block uppercase tracking-wider text-[9px]">Corridor Distance:</span>
                    <span className="font-bold text-[#163B46]">{itin.stopover_accommodation.distance_from_route_km} km from highway</span>
                  </div>
                  <div>
                    <span className="text-[#829196] block uppercase tracking-wider text-[9px]">Rooms & Duration:</span>
                    <span className="font-bold text-[#163B46]">{itin.stopover_accommodation.rooms_needed} Room(s) • {itin.stopover_accommodation.nights} Night</span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {itin.stopover_accommodation.amenities?.map((amenity, idx) => (
                    <span key={idx} className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-[#F4F7F6] text-[#26383D] border border-[#DCE6E3]">
                      ✓ {amenity}
                    </span>
                  ))}
                </div>

                <div className="pt-2 flex items-center justify-between border-t border-[#DCE6E3]">
                  <div>
                    <span className="text-[10px] text-[#829196] block">Total Stay Expense:</span>
                    <span className="text-sm font-black text-[#16A36A]">{formatCurrency(itin.stopover_accommodation.total_stay_cost)}</span>
                  </div>
                  {itin.stopover_accommodation.booking_url && (
                    <a
                      href={itin.stopover_accommodation.booking_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs flex items-center space-x-1.5 shadow-soft transition-all"
                    >
                      <span>Reserve on Google Hotels</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Destination Accommodation Card */}
            {itin.destination_accommodation && (
              <div className="p-6 rounded-3xl bg-white border-2 border-indigo-200 shadow-soft space-y-4 relative overflow-hidden">
                <div className="flex items-center justify-between">
                  <span className="px-3 py-1 rounded-full bg-indigo-100 text-indigo-900 text-xs font-black uppercase tracking-wider border border-indigo-300 flex items-center space-x-1">
                    <Bed className="w-3.5 h-3.5 text-indigo-700 mr-1" />
                    <span>Destination Stay ({itin.destination_accommodation.city || itin.destination})</span>
                  </span>
                  <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-lg border border-indigo-200">
                    {itin.destination_accommodation.nights} Night(s) Stay
                  </span>
                </div>

                <div className="flex gap-4">
                  <div className="w-24 h-24 rounded-2xl overflow-hidden shrink-0 bg-indigo-50 border border-indigo-200">
                    <img
                      src={itin.destination_accommodation.image_url || 'https://images.unsplash.com/photo-1590490360182-c33d57733427?w=400&auto=format&fit=crop&q=80'}
                      alt={itin.destination_accommodation.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="space-y-1 flex-1">
                    <h3 className="text-base font-extrabold text-[#163B46]">{itin.destination_accommodation.name}</h3>
                    <p className="text-xs text-[#52636A] flex items-center">
                      <MapPin className="w-3.5 h-3.5 mr-1 text-indigo-600 shrink-0" />
                      <span className="truncate">{itin.destination_accommodation.address}</span>
                    </p>
                    <div className="flex items-center space-x-2 pt-1 text-xs">
                      <span className="font-black text-indigo-900 text-sm">
                        {formatCurrency(itin.destination_accommodation.estimated_nightly_price)}
                        <span className="text-[10px] font-normal text-[#829196]"> / night</span>
                      </span>
                      <span className="text-[#829196]">•</span>
                      <span className="text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.2 rounded text-[11px]">
                        ★ {itin.destination_accommodation.rating || 4.3} ({itin.destination_accommodation.review_count || 410} reviews)
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] text-[#52636A] bg-indigo-50/50 p-3 rounded-xl border border-indigo-100">
                  <div>
                    <span className="text-[#829196] block uppercase tracking-wider text-[9px]">Check-in / Out:</span>
                    <span className="font-bold text-[#163B46]">14:00 Check-in • 11:00 Check-out</span>
                  </div>
                  <div>
                    <span className="text-[#829196] block uppercase tracking-wider text-[9px]">Rooms & Configuration:</span>
                    <span className="font-bold text-[#163B46]">{itin.destination_accommodation.rooms_needed} Room(s) • {itin.destination_accommodation.room_type || 'Double Room'}</span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {itin.destination_accommodation.amenities?.map((amenity, idx) => (
                    <span key={idx} className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-[#F4F7F6] text-[#26383D] border border-[#DCE6E3]">
                      ✓ {amenity}
                    </span>
                  ))}
                </div>

                <div className="pt-2 flex items-center justify-between border-t border-[#DCE6E3]">
                  <div>
                    <span className="text-[10px] text-[#829196] block">Total Destination Stay:</span>
                    <span className="text-sm font-black text-[#16A36A]">{formatCurrency(itin.destination_accommodation.total_stay_cost)}</span>
                  </div>
                  {itin.destination_accommodation.booking_url && (
                    <a
                      href={itin.destination_accommodation.booking_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center space-x-1.5 shadow-soft transition-all"
                    >
                      <span>Reserve on Google Hotels</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- Financial & Algorithmic Summary Grid --- */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card 1: Budget Ledger */}
        <div className="p-6 rounded-2xl bg-white border border-[#DCE6E3] shadow-soft space-y-4 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#829196] uppercase tracking-wider">
                Budget & Expenses
              </span>
              <DollarSign className="w-4 h-4 text-[#16A36A]" />
            </div>

            <div>
              <span className="text-xs text-[#52636A]">Total Estimated Cost:</span>
              <p className="text-2xl font-black text-[#16A36A]">
                {formatCurrency(budget.estimated_total_cost || 0)}
              </p>
              <span className="text-[11px] text-[#829196]">
                Target Budget: {formatCurrency(budget.total_budget || tripPlan.budget)}
              </span>
            </div>

            {budget.is_budget_exceeded ? (
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
                <span>Budget exceeded by {formatCurrency(budget.budget_overrun || 0)}</span>
              </div>
            ) : (
              <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-[#16A36A] text-xs flex items-center space-x-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#16A36A] shrink-0" />
                <span>Remaining: {formatCurrency(budget.remaining_budget || 0)}</span>
              </div>
            )}
          </div>

          <div className="space-y-2 pt-3 border-t border-[#DCE6E3] text-xs text-[#52636A]">
            <div className="flex justify-between items-center">
              <span className="flex items-center space-x-1.5">
                <Car className="w-3.5 h-3.5 text-[#829196]" />
                <span>Road Transit:</span>
              </span>
              <span className="font-semibold text-[#26383D]">
                {formatCurrency(categoryExpenses.transportation || 0)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="flex items-center space-x-1.5">
                <MapPin className="w-3.5 h-3.5 text-[#829196]" />
                <span>Entrance Fees:</span>
              </span>
              <span className="font-semibold text-[#26383D]">
                {formatCurrency(categoryExpenses.entrance_fees || 0)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="flex items-center space-x-1.5">
                <Utensils className="w-3.5 h-3.5 text-[#829196]" />
                <span>Dining Allocations:</span>
              </span>
              <span className="font-semibold text-[#26383D]">
                {formatCurrency(categoryExpenses.food || 0)}
              </span>
            </div>
            {(categoryExpenses.stopover_accommodation > 0 || categoryExpenses.destination_accommodation > 0 || categoryExpenses.accommodation > 0) && (
              <>
                {categoryExpenses.stopover_accommodation > 0 && (
                  <div className="flex justify-between items-center text-amber-800 font-medium">
                    <span className="flex items-center space-x-1.5">
                      <Hotel className="w-3.5 h-3.5 text-amber-600" />
                      <span>Stopover Hotel Stay:</span>
                    </span>
                    <span className="font-semibold">
                      {formatCurrency(categoryExpenses.stopover_accommodation)}
                    </span>
                  </div>
                )}
                {categoryExpenses.destination_accommodation > 0 && (
                  <div className="flex justify-between items-center text-indigo-900 font-medium">
                    <span className="flex items-center space-x-1.5">
                      <Bed className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Destination Hotel Stay:</span>
                    </span>
                    <span className="font-semibold">
                      {formatCurrency(categoryExpenses.destination_accommodation)}
                    </span>
                  </div>
                )}
                {!categoryExpenses.stopover_accommodation && !categoryExpenses.destination_accommodation && categoryExpenses.accommodation > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="flex items-center space-x-1.5">
                      <Hotel className="w-3.5 h-3.5 text-[#829196]" />
                      <span>Accommodation:</span>
                    </span>
                    <span className="font-semibold text-[#26383D]">
                      {formatCurrency(categoryExpenses.accommodation)}
                    </span>
                  </div>
                )}
              </>
            )}
            <div className="flex justify-between items-center">
              <span className="flex items-center space-x-1.5">
                <Info className="w-3.5 h-3.5 text-[#829196]" />
                <span>Contingency Buffer (8%):</span>
              </span>
              <span className="font-semibold text-[#26383D]">
                {formatCurrency(categoryExpenses.contingency_buffer || 0)}
              </span>
            </div>
          </div>
        </div>

        {/* Card 2: Algorithmic Utility Score U(I) */}
        <div className="p-6 rounded-2xl bg-white border border-[#DCE6E3] shadow-soft space-y-4 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#829196] uppercase tracking-wider">
                Optimization Utility
              </span>
              <Sparkles className="w-4 h-4 text-[#18B8A6]" />
            </div>

            <div>
              <span className="text-xs text-[#52636A]">Objective Score U(I):</span>
              <p className="text-2xl font-black text-[#163B46]">
                {((itin.utility?.overall_utility_score || 0.72) * 100).toFixed(1)} / 100
              </p>
              <span className="text-[11px] text-[#829196]">Multi-criteria optimization index</span>
            </div>

            <div className="p-3 rounded-xl bg-[#F4F7F6] border border-[#DCE6E3] text-xs font-mono text-[#163B46] leading-relaxed break-all">
              {(
                itin.utility?.formula_summary ||
                'U(I) = 0.30(R) + 0.20(W) + 0.15(T) + 0.15(Dv) - 0.10(Tr) - 0.10(C)'
              ).replace(/^U\(T\)/, 'U(I)')}
            </div>
          </div>

          <p className="text-xs text-[#52636A] leading-relaxed pt-2 border-t border-[#DCE6E3]">
            Balances POI quality (R), weather favorability (W), temporal efficiency (T), theme diversity (Dv), while penalizing transit friction (Tr) and cost overrun (C).
          </p>
        </div>

        {/* Card 3: Pacing & Route Efficiency */}
        <div className="p-6 rounded-2xl bg-white border border-[#DCE6E3] shadow-soft space-y-4 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#829196] uppercase tracking-wider">
                Routing Performance
              </span>
              <Route className="w-4 h-4 text-[#163B46]" />
            </div>

            <div>
              <span className="text-xs text-[#52636A]">Total Visiting Sequence:</span>
              <p className="text-2xl font-black text-[#163B46]">
                {itin.days?.reduce(
                  (sum, d) =>
                    sum + (d.stops?.filter((s) => !s.is_start_location && !s.is_end_location).length || 0),
                  0
                ) || 0}{' '}
                Stops
              </p>
              <span className="text-[11px] text-[#829196]">
                Across {itin.total_days} scheduled days
              </span>
            </div>

            <div className="space-y-2.5 pt-2 border-t border-[#DCE6E3] text-xs">
              <div className="flex items-center justify-between text-[#52636A]">
                <span>Algorithm:</span>
                <span className="font-semibold text-[#163B46] px-2 py-0.5 rounded-md bg-[#F4F7F6] border border-[#DCE6E3]">
                  2-Opt Local Search TSP
                </span>
              </div>
              <div className="flex items-center justify-between text-[#52636A]">
                <span>Road Circuity:</span>
                <span className="font-semibold text-[#163B46]">1.35x Geodesic Ratio</span>
              </div>
              <div className="flex items-center justify-between text-[#52636A]">
                <span>Operating Hours:</span>
                <span className="font-semibold text-[#16A36A] flex items-center space-x-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#16A36A]" />
                  <span>Strictly Enforced</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* --- Car Fuel, Distance & Vehicle Telemetry Engine Card --- */}
      {isCarTrip && (
        <div className="p-6 rounded-3xl bg-gradient-to-r from-emerald-50/90 via-teal-50/50 to-white border border-emerald-200 shadow-soft space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-emerald-200/60 pb-3">
            <div className="flex items-center space-x-2.5">
              <div className="w-9 h-9 rounded-xl bg-[#16A36A] text-white flex items-center justify-center shadow-xs">
                <Fuel className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-[#163B46]">
                  Car Travel & Petrol Telemetry
                </h3>
                <p className="text-xs text-[#52636A]">
                  2-Opt road optimization connects Source origin, intermediate attractions, and round-trip return.
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-bold flex items-center space-x-1.5">
                <RotateCcw className="w-3.5 h-3.5 text-[#16A36A]" />
                <span>Round-Trip Circuit</span>
              </span>
              <span className="px-3 py-1 rounded-full bg-white text-[#163B46] border border-[#DCE6E3] text-xs font-semibold">
                Petrol @ ₹{vehicleMetrics?.fuel_price_per_litre || 105}/L
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3.5 text-xs">
            <div className="p-3.5 rounded-2xl bg-white border border-emerald-100/80 shadow-2xs space-y-1">
              <span className="text-[10px] text-[#829196] block uppercase tracking-wider font-semibold">
                Origin / Source:
              </span>
              <p className="font-extrabold text-[#163B46] text-xs truncate" title={itin.source_location?.name || tripPlan.source}>
                {itin.source_location?.name || tripPlan.source || 'Hyderabad Airport'}
              </p>
              <span className="text-[10px] text-[#16A36A] font-medium flex items-center">
                <Navigation className="w-3 h-3 mr-1" /> Starts & returns here
              </span>
            </div>

            <div className="p-3.5 rounded-2xl bg-white border border-emerald-100/80 shadow-2xs space-y-1">
              <span className="text-[10px] text-[#829196] block uppercase tracking-wider font-semibold">
                Total Road Distance:
              </span>
              <p className="font-black text-[#163B46] text-base">
                {formatDistanceKm(vehicleMetrics?.total_distance_km || itin.total_distance_km || 0)}
              </p>
              <span className="text-[10px] text-[#52636A]">
                Across {itin.total_days} scheduled days
              </span>
            </div>

            <div className="p-3.5 rounded-2xl bg-white border border-emerald-100/80 shadow-2xs space-y-1">
              <span className="text-[10px] text-[#829196] block uppercase tracking-wider font-semibold">
                Petrol Volume Needed:
              </span>
              <p className="font-black text-[#16A36A] text-base">
                {vehicleMetrics?.estimated_fuel_litres || ((itin.total_distance_km || 10) / 14).toFixed(1)} Litres
              </p>
              <span className="text-[10px] text-[#52636A]">
                @ {vehicleMetrics?.mileage_kmpl || 14} km/L economy
              </span>
            </div>

            <div className="p-3.5 rounded-2xl bg-white border border-emerald-100/80 shadow-2xs space-y-1">
              <span className="text-[10px] text-[#829196] block uppercase tracking-wider font-semibold">
                Estimated Fuel Expense:
              </span>
              <p className="font-black text-[#16A36A] text-base">
                {formatCurrency(vehicleMetrics?.estimated_fuel_cost || ((itin.total_distance_km || 10) / 14) * 105)}
              </p>
              <span className="text-[10px] text-[#52636A]">
                Direct petrol cost
              </span>
            </div>

            <div className="p-3.5 rounded-2xl bg-white border border-emerald-100/80 shadow-2xs space-y-1 col-span-2 sm:col-span-4 lg:col-span-1">
              <span className="text-[10px] text-[#829196] block uppercase tracking-wider font-semibold">
                Parking & Tolls Buffer:
              </span>
              <p className="font-black text-[#163B46] text-base">
                {formatCurrency(vehicleMetrics?.parking_and_tolls_estimate || (itin.total_days * 150 + (itin.total_attractions_scheduled || 6) * 50))}
              </p>
              <span className="text-[10px] text-[#52636A]">
                Site parking & toll passes
              </span>
            </div>
          </div>
        </div>
      )}

      {/* --- Day Selector Tabs --- */}
      {itin.days && itin.days.length > 1 && (
        <div className="flex items-center space-x-2.5 overflow-x-auto pb-1 scrollbar-none">
          {itin.days.map((day) => {
            const isActive = activeDayTab === day.day_number;
            const stopCount =
              day.stops?.filter((s) => !s.is_start_location && !s.is_end_location).length || 0;
            return (
              <button
                key={day.day_number}
                onClick={() => setActiveDayTab(day.day_number)}
                className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center space-x-2 shrink-0 ${
                  isActive
                    ? 'bg-[#18B8A6] text-white shadow-soft ring-2 ring-[#18B8A6]/20'
                    : 'bg-white text-[#52636A] hover:text-[#163B46] hover:bg-[#EEF3F1] border border-[#DCE6E3]'
                }`}
              >
                <span>Day {day.day_number}</span>
                <span className={`text-[11px] ${isActive ? 'text-white/80' : 'text-[#829196]'}`}>
                  ({formatDateDisplay(day.date)})
                </span>
                <span
                  className={`ml-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    isActive ? 'bg-white/20 text-white' : 'bg-[#EEF3F1] text-[#52636A]'
                  }`}
                >
                  {stopCount} {stopCount === 1 ? 'stop' : 'stops'}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* --- Active Day Schedule & Timeline --- */}
      {activeDay && (
        <div className="space-y-6">
          {/* Day Banner & Weather Summary */}
          <div className="p-6 rounded-2xl bg-white border border-[#DCE6E3] shadow-soft flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <span className="text-xs font-bold text-[#18B8A6] uppercase tracking-wider">
                Day {activeDay.day_number} Schedule
              </span>
              <h3 className="text-xl font-bold text-[#163B46] mt-1">
                {capitalizeWords(activeDay.theme || `Exploration of ${itin.destination}`)}
              </h3>
              <p className="text-xs text-[#52636A] mt-0.5">
                {formatDateDisplay(activeDay.date)} •{' '}
                {activeDay.stops?.filter((s) => !s.is_start_location && !s.is_end_location).length || 0}{' '}
                Attractions • {formatDistanceKm(activeDay.daily_distance_km)} road travel
              </p>
            </div>

            {/* Weather Pill */}
            {activeDay.weather && (
              <div className="px-4 py-2.5 rounded-xl bg-[#F4F7F6] border border-[#DCE6E3] text-xs flex items-center space-x-3 shrink-0">
                <CloudSun className="w-5 h-5 text-amber-500 shrink-0" />
                <div>
                  <div className="font-bold text-[#163B46] flex items-center space-x-1.5">
                    <span>{activeDay.weather.condition || 'Mainly Clear'}</span>
                    {activeDay.weather.temperature_celsius !== undefined &&
                      activeDay.weather.temperature_celsius !== null && (
                        <span className="text-[11px] text-[#829196]">
                          ({Math.round(activeDay.weather.temperature_celsius)}°C)
                        </span>
                      )}
                  </div>
                  <div className="text-[11px] text-[#52636A] flex items-center space-x-1">
                    <span>Precipitation: {activeDay.weather.precipitation_mm ?? 0} mm</span>
                    <span>•</span>
                    <span
                      className={`font-semibold ${
                        activeDay.weather.is_outdoor_favorable ? 'text-[#16A36A]' : 'text-amber-600'
                      }`}
                    >
                      {activeDay.weather.is_outdoor_favorable ? 'Favorable' : 'Caution'}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Sequential Stops Timeline */}
          <div className="relative pl-6 sm:pl-8 space-y-6 before:content-[''] before:absolute before:left-3 before:top-4 before:bottom-4 before:w-0.5 before:bg-[#DCE6E3]">
            {activeDay.stops?.map((stop, sIdx) => {
              const isStart = stop.is_start_location;
              const isEnd = stop.is_end_location;

              if (isStart) {
                return (
                  <div key={stop.place_id || `start_${sIdx}`} className="relative group">
                    <div className="absolute -left-6 sm:-left-8 top-1.5 w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-extrabold flex items-center justify-center ring-4 ring-white shadow-sm">
                      🚩
                    </div>
                    <div className="p-4 sm:p-5 rounded-2xl bg-emerald-50/80 border border-emerald-200/80 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-100 text-[#16A36A] flex items-center justify-center font-bold text-sm shrink-0">
                          <Navigation className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-200/60 text-emerald-900 uppercase tracking-wider">
                              Trip Origin / Departure Hub
                            </span>
                            <span className="text-sm font-bold text-[#163B46]">
                              {stop.name}
                            </span>
                          </div>
                          <p className="text-xs text-[#52636A] mt-0.5">
                            {stop.address || 'Starting point & source departure'} • Road circuit begins here
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2 text-xs px-3 py-1.5 rounded-xl bg-white border border-emerald-200 text-[#163B46] font-bold shrink-0">
                        <Clock className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Depart {stop.departure_time || '09:00'}</span>
                      </div>
                    </div>
                  </div>
                );
              }

              if (isEnd) {
                return (
                  <div key={stop.place_id || `end_${sIdx}`} className="relative group">
                    <div className="absolute -left-6 sm:-left-8 top-1.5 w-6 h-6 rounded-full bg-[#163B46] text-white text-xs font-extrabold flex items-center justify-center ring-4 ring-white shadow-sm">
                      🏁
                    </div>
                    <div className="p-4 sm:p-5 rounded-2xl bg-[#EEF3F1] border border-[#DCE6E3] shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-xl bg-[#163B46] text-white flex items-center justify-center font-bold text-sm shrink-0">
                          <RotateCcw className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-[#16A36A] uppercase tracking-wider">
                              Destination Return Completed
                            </span>
                            <span className="text-sm font-bold text-[#163B46]">
                              {stop.name}
                            </span>
                          </div>
                          <p className="text-xs text-[#52636A] mt-0.5">
                            +{formatDistanceKm(stop.travel_distance_km)} return leg ({Math.round(stop.travel_duration_mins)} mins drive) • Returned to Source safely
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2 text-xs px-3 py-1.5 rounded-xl bg-white border border-[#DCE6E3] text-[#163B46] font-bold shrink-0">
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#16A36A]" />
                        <span>Arrived {stop.arrival_time}</span>
                      </div>
                    </div>
                  </div>
                );
              }

              if (stop.is_rest_stop) {
                return (
                  <div key={stop.place_id || `rest_${sIdx}`} className="relative group">
                    <div className="absolute -left-6 sm:-left-8 top-1.5 w-6 h-6 rounded-full bg-amber-500 text-white text-xs font-extrabold flex items-center justify-center ring-4 ring-white shadow-sm">
                      ☕
                    </div>
                    <div className="p-4 sm:p-5 rounded-2xl bg-amber-50/80 border border-amber-200/90 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-sm shrink-0">
                          <Coffee className="w-5 h-5 text-amber-700" />
                        </div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-200/70 text-amber-900 uppercase tracking-wider">
                              Highway Rest & Refreshment Break
                            </span>
                            <span className="text-sm font-bold text-[#163B46]">{stop.name}</span>
                          </div>
                          <p className="text-xs text-[#52636A] mt-0.5">
                            +{formatDistanceKm(stop.travel_distance_km)} highway transit leg ({Math.round(stop.travel_duration_mins)} mins drive) • Restrooms, refreshments, and vehicle break
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2 text-xs px-3 py-1.5 rounded-xl bg-white border border-amber-200 text-amber-900 font-bold shrink-0">
                        <Clock className="w-3.5 h-3.5 text-amber-600" />
                        <span>{stop.arrival_time} — {stop.departure_time} ({stop.visit_duration_mins}m)</span>
                      </div>
                    </div>
                  </div>
                );
              }

              if (stop.is_hotel_stay) {
                const isStopover = stop.hotel_category === 'stopover_hotel';
                return (
                  <div key={stop.place_id || `hotel_${sIdx}`} className="relative group">
                    <div className={`absolute -left-6 sm:-left-8 top-1.5 w-6 h-6 rounded-full text-white text-xs font-extrabold flex items-center justify-center ring-4 ring-white shadow-sm ${
                      isStopover ? 'bg-amber-600' : 'bg-indigo-600'
                    }`}>
                      🏨
                    </div>
                    <div className={`p-4 sm:p-5 rounded-2xl shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                      isStopover ? 'bg-amber-50/90 border border-amber-200' : 'bg-indigo-50/90 border border-indigo-200'
                    }`}>
                      <div className="flex items-center space-x-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 ${
                          isStopover ? 'bg-amber-200/60 text-amber-900' : 'bg-indigo-200/60 text-indigo-900'
                        }`}>
                          <Hotel className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                              isStopover ? 'bg-amber-200 text-amber-900' : 'bg-indigo-200 text-indigo-900'
                            }`}>
                              {isStopover ? 'Midway Stopover Accommodation' : 'Destination Hotel Accommodation'}
                            </span>
                            <span className="text-sm font-bold text-[#163B46]">{stop.name}</span>
                          </div>
                          <p className="text-xs text-[#52636A] mt-0.5">
                            {stop.address || stop.hotel_details?.address || 'Secure on-site parking & comfortable accommodation'} • Overnight stay
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2 text-xs px-3 py-1.5 rounded-xl bg-white border border-[#DCE6E3] text-[#163B46] font-bold shrink-0">
                        <Clock className="w-3.5 h-3.5 text-amber-600" />
                        <span>Arrived {stop.arrival_time}</span>
                      </div>
                    </div>
                  </div>
                );
              }

              const visibleStops = activeDay.stops.filter((s) => !s.is_start_location && !s.is_end_location);
              const visibleIndex = visibleStops.findIndex((s) => s.place_id === stop.place_id);

              return (
                <div key={stop.place_id || sIdx} className="relative group">
                  {/* Timeline Stop Badge */}
                  <div className="absolute -left-6 sm:-left-8 top-1.5 w-6 h-6 rounded-full bg-[#18B8A6] text-white text-xs font-extrabold flex items-center justify-center ring-4 ring-white shadow-sm">
                    {visibleIndex >= 0 ? visibleIndex + 1 : sIdx + 1}
                  </div>

                  {/* Stop Card */}
                  <div className="p-6 rounded-2xl bg-white border border-[#DCE6E3] hover:border-[#829196]/40 shadow-soft transition-all space-y-4">
                    <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center border-b border-[#DCE6E3] pb-3">
                      <div className="w-20 h-20 sm:w-24 sm:h-20 rounded-xl overflow-hidden shrink-0 shadow-sm border border-[#DCE6E3] bg-[#EEF3F1]">
                        <AttractionImage
                          name={stop.name}
                          city={tripPlan.destination || itin?.destination}
                          attractionId={stop.place_id}
                          initialUrl={stop.image_url}
                          initialAttribution={stop.image_attribution}
                          aspectRatio="h-full"
                          alt={stop.name}
                          showAttribution={false}
                          className="w-full h-full object-cover"
                        />
                      </div>

                      <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <div className="flex items-center space-x-2">
                            <h4 className="text-base font-bold text-[#163B46]">
                              {capitalizeWords(stop.name)}
                            </h4>
                            <span
                              className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${getCategoryBadgeColor(
                                stop.category
                              )}`}
                            >
                              {capitalizeWords(stop.category || 'Sight')}
                            </span>
                          </div>
                          {stop.address && (
                            <p className="text-xs text-[#52636A] mt-0.5 flex items-center">
                              <MapPin className="w-3.5 h-3.5 mr-1 text-[#829196] shrink-0" />
                              <span className="truncate">{stop.address}</span>
                            </p>
                          )}
                        </div>

                        {/* Timestamps Pill */}
                        <div className="flex items-center space-x-2 text-xs px-3 py-1.5 rounded-xl bg-[#F4F7F6] border border-[#DCE6E3] text-[#26383D] shrink-0">
                          <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          <span className="font-bold text-[#163B46]">
                            {stop.arrival_time} — {stop.departure_time}
                          </span>
                          <span className="px-1.5 py-0.5 rounded-md bg-white text-[11px] font-semibold text-[#52636A] border border-[#DCE6E3]/60">
                            {stop.visit_duration_mins}m visit
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Operational Details Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div>
                        <span className="text-[10px] text-[#829196] block uppercase tracking-wider">
                          Entrance Fee:
                        </span>
                        <p className="font-semibold text-[#16A36A] mt-0.5">
                          {stop.total_entrance_fee > 0
                            ? formatCurrency(stop.total_entrance_fee)
                            : 'Free / Included'}
                        </p>
                      </div>

                      <div>
                        <span className="text-[10px] text-[#829196] block uppercase tracking-wider">
                          Operating Hours:
                        </span>
                        <p className="font-semibold text-[#26383D] mt-0.5">
                          {stop.opening_hours || 'Verified Daylight'}
                        </p>
                      </div>

                      <div>
                        <span className="text-[10px] text-[#829196] block uppercase tracking-wider">
                          Transit Leg:
                        </span>
                        <p className="font-semibold text-[#18B8A6] mt-0.5">
                          {formatDistanceKm(stop.travel_distance_km)} ({formatDurationMins(stop.travel_duration_mins)})
                        </p>
                      </div>

                      <div>
                        <span className="text-[10px] text-[#829196] block uppercase tracking-wider">
                          Venue Type:
                        </span>
                        <p className="font-semibold text-[#26383D] mt-0.5">
                          {stop.is_outdoor ? 'Outdoor Venue' : 'Indoor / Museum'}
                        </p>
                      </div>
                    </div>

                    {/* Warnings / Notes if unverified */}
                    {stop.opening_hours_warning && (
                      <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center space-x-2">
                        <Info className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span>{stop.opening_hours_warning}</span>
                      </div>
                    )}
                  </div>

                  {/* Scheduled Dining / Meal Breaks */}
                  {activeDay.meal_breaks?.map((meal, mIdx) => {
                    const shouldRenderMeal =
                      visibleIndex === 1 || (visibleStops.length === 1 && visibleIndex === 0);
                    if (shouldRenderMeal) {
                      return (
                        <div
                          key={`meal-${meal.id || mIdx}`}
                          className="my-4 p-4 rounded-xl bg-emerald-50/70 border border-emerald-200 text-[#163B46] flex items-center justify-between text-xs shadow-sm"
                        >
                          <div className="flex items-center space-x-3">
                            <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center text-[#16A36A] font-bold shrink-0">
                              <Utensils className="w-4 h-4" />
                            </div>
                            <div>
                              <h5 className="font-bold text-[#163B46]">🍽️ Dining: {meal.name}</h5>
                              <p className="text-[11px] text-[#52636A]">
                                Scheduled {meal.scheduled_start} — {meal.scheduled_end} ({meal.duration_mins} mins)
                              </p>
                            </div>
                          </div>
                          <span className="font-bold text-[#16A36A]">
                            {formatCurrency(meal.estimated_cost || 0)}
                          </span>
                        </div>
                      );
                    }
                    return null;
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
