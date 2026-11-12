import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Compass,
  Calendar,
  MapPin,
  Users,
  DollarSign,
  Car,
  Footprints,
  Bike,
  Sparkles,
  ArrowRight,
  Clock,
  Sliders,
  CheckCircle2,
  AlertCircle,
  Wand2,
  Fuel,
  Navigation,
  RotateCcw,
  Hotel,
  Bed,
  Coffee,
  ShieldAlert,
  ArrowUpDown,
} from 'lucide-react';
import { useTrip } from '../context/TripContext';
import recommendationService from '../services/recommendationService';
import itineraryService from '../services/itineraryService';
import aiService from '../services/aiService';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import LocationSearchInput from '../components/LocationSearchInput';
import MapLocationPickerModal from '../components/MapLocationPickerModal';
import RoutePreviewCard from '../components/RoutePreviewCard';
import { formatCurrency } from '../utils/formatters';

const POPULAR_DESTINATIONS = ['Hyderabad', 'Bengaluru', 'Jaipur', 'Goa', 'Delhi', 'Mumbai'];

const POPULAR_ORIGINS = {
  hyderabad: [
    'Rajampet, Y.S.R. Kadapa, Andhra Pradesh',
    'Hyderabad Airport (RGIA)',
    'Secunderabad Railway Station',
    'Banjara Hills',
    'Tirupati, Andhra Pradesh',
    'Charminar Area',
  ],
  bengaluru: [
    'Kempegowda Int. Airport (BLR)',
    'Bangalore City Railway Station (KSR)',
    'Indiranagar',
    'Koramangala',
  ],
  jaipur: [
    'Jaipur International Airport',
    'Jaipur Junction',
    'MI Road / City Palace Area',
  ],
  goa: [
    'Goa Dabolim Airport',
    'Mopa Manohar Airport',
    'Panaji Central',
  ],
  delhi: [
    'Indira Gandhi Int. Airport (DEL)',
    'New Delhi Railway Station (NDLS)',
    'Connaught Place',
  ],
  mumbai: [
    'Mumbai Airport (BOM)',
    'CSMT Station',
    'Bandra West',
  ],
};

const AVAILABLE_INTERESTS = [
  'Historical Places',
  'Food',
  'Photography',
  'Culture',
  'Nature',
  'Shopping',
  'Architecture',
  'Museums',
];

export default function PlanTripPage() {
  const navigate = useNavigate();
  const { tripPlan, updatePlan, setRecommendations, setCurrentItinerary } = useTrip();

  // Natural language extraction state
  const [nlQuery, setNlQuery] = useState(tripPlan.userQuery || '');
  const [extracting, setExtracting] = useState(false);
  const [extractionResult, setExtractionResult] = useState(null);

  // Form states
  const [destination, setDestination] = useState(tripPlan.destination || 'Hyderabad');
  const [source, setSource] = useState(tripPlan.source || 'Hyderabad Airport (RGIA)');
  const [sourceLocation, setSourceLocation] = useState(
    tripPlan.sourceLocation || {
      name: tripPlan.source || 'Hyderabad Airport (RGIA)',
      formatted_address: 'Rajiv Gandhi International Airport, Shamshabad, Hyderabad, Telangana, India',
      latitude: 17.2403,
      longitude: 78.4294,
      category: 'airport',
    }
  );
  const [destinationLocation, setDestinationLocation] = useState(
    tripPlan.destinationLocation || {
      name: tripPlan.destination || 'Hyderabad',
      formatted_address: 'Hyderabad, Telangana, India',
      latitude: 17.385044,
      longitude: 78.486671,
      category: 'city',
    }
  );

  // Map Picker Modal state
  const [mapModalOpen, setMapModalOpen] = useState(false);
  const [mapModalTarget, setMapModalTarget] = useState('source'); // 'source' or 'destination'

  const [roundTrip, setRoundTrip] = useState(tripPlan.roundTrip !== undefined ? tripPlan.roundTrip : true);
  const [startDate, setStartDate] = useState(tripPlan.startDate);
  const [endDate, setEndDate] = useState(tripPlan.endDate);
  const [travelersCount, setTravelersCount] = useState(tripPlan.travelersCount || 1);
  const [budget, setBudget] = useState(tripPlan.budget || 5000);
  const [transportation, setTransportation] = useState(tripPlan.transportation || 'driving-car');
  const [fuelType, setFuelType] = useState(tripPlan.fuelType || 'petrol');
  const [mileageKmpl, setMileageKmpl] = useState(tripPlan.mileageKmpl || 14.0);
  const [fuelPricePerLitre, setFuelPricePerLitre] = useState(tripPlan.fuelPricePerLitre || 105.0);
  const [pace, setPace] = useState(tripPlan.pace || 'relaxed');
  const [dailyHours, setDailyHours] = useState(tripPlan.dailyAvailableHours || 8.0);
  const [interests, setInterests] = useState(tripPlan.interests || ['Historical Places', 'Food', 'Culture']);

  const handleSwapLocations = () => {
    const prevSource = source;
    const prevDest = destination;
    const prevSourceLoc = sourceLocation;
    const prevDestLoc = destinationLocation;

    setSource(prevDest);
    setDestination(prevSource);
    setSourceLocation(prevDestLoc);
    setDestinationLocation(prevSourceLoc);
  };

  const handleOpenMapPicker = (target) => {
    setMapModalTarget(target);
    setMapModalOpen(true);
  };

  const handleModalConfirmLocation = (loc) => {
    if (mapModalTarget === 'destination') {
      setDestination(loc.name);
      setDestinationLocation(loc);
    } else {
      setSource(loc.name);
      setSourceLocation(loc);
    }
  };

  // Accommodation & Long-Distance Stopover States (Phase 6)
  const [accommodationType, setAccommodationType] = useState(tripPlan.accommodationType || 'standard');
  const [includeAccommodation, setIncludeAccommodation] = useState(
    tripPlan.includeAccommodation !== undefined ? tripPlan.includeAccommodation : true
  );
  const [maxDailyDrivingHours, setMaxDailyDrivingHours] = useState(tripPlan.maxDailyDrivingHours || 5.5);
  const [enableStopoverRecommendation, setEnableStopoverRecommendation] = useState(
    tripPlan.enableStopoverRecommendation !== undefined ? tripPlan.enableStopoverRecommendation : true
  );
  const [roomsNeeded, setRoomsNeeded] = useState(tripPlan.roomsNeeded || 1);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Auto-calculate trip duration in days
  const durationDays = React.useMemo(() => {
    if (!startDate || !endDate) return 1;
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return Math.max(1, isNaN(diffDays) ? 1 : diffDays);
  }, [startDate, endDate]);

  // Handle Natural Language Extraction via backend AI
  const handleExtractPreferences = async (textToExtract) => {
    const query = textToExtract || nlQuery;
    if (!query.trim()) return;

    setExtracting(true);
    setError(null);
    try {
      const res = await aiService.extractPreferences(query.trim());
      setExtractionResult(res);

      const p = res.preferences;
      if (p.destination) setDestination(p.destination);
      if (p.budget) setBudget(p.budget);
      if (p.travel_style) setPace(p.travel_style);
      if (p.transportation) setTransportation(p.transportation);
      if (p.travelers_count) setTravelersCount(p.travelers_count);

      if (p.interests && p.interests.length > 0) {
        const mapped = p.interests.map((item) => {
          if (item === 'history') return 'Historical Places';
          if (item === 'food') return 'Food';
          if (item === 'photography') return 'Photography';
          if (item === 'culture') return 'Culture';
          if (item === 'nature') return 'Nature';
          if (item === 'shopping') return 'Shopping';
          return item.charAt(0).toUpperCase() + item.slice(1);
        });
        setInterests([...new Set(mapped)]);
      }

      if (p.duration_days) {
        const start = new Date();
        start.setDate(start.getDate() + 7);
        const end = new Date(start);
        end.setDate(start.getDate() + (p.duration_days - 1));
        setStartDate(start.toISOString().split('T')[0]);
        setEndDate(end.toISOString().split('T')[0]);
      }
    } catch (err) {
      setError(err.message || 'Could not extract preferences from text.');
    } finally {
      setExtracting(false);
    }
  };

  useEffect(() => {
    if (tripPlan.userQuery && !extractionResult) {
      handleExtractPreferences(tripPlan.userQuery);
    }
  }, []);

  const toggleInterest = (interest) => {
    setInterests((prev) =>
      prev.includes(interest) ? prev.filter((i) => i !== interest) : [...prev, interest]
    );
  };

  const syncPlanContext = () => {
    updatePlan({
      destination,
      source,
      sourceLocation,
      destinationLocation,
      roundTrip,
      fuelType,
      mileageKmpl,
      fuelPricePerLitre,
      startDate,
      endDate,
      travelersCount,
      budget,
      transportation,
      pace,
      dailyAvailableHours: dailyHours,
      interests,
      accommodationType,
      includeAccommodation,
      maxDailyDrivingHours,
      enableStopoverRecommendation,
      roomsNeeded,
    });
  };

  const handleDiscoverRecommendations = async () => {
    if (!destination.trim()) {
      setError('Please select or specify a destination.');
      return;
    }

    syncPlanContext();
    setLoading(true);
    setError(null);

    try {
      const data = await recommendationService.getRecommendations({
        destination,
        interests,
        budget,
        availableDurationDays: durationDays,
        transportation,
        dailyTouringHours: dailyHours,
        limit: 12,
      });

      setRecommendations(data.recommendations || []);
      navigate('/recommendations');
    } catch (err) {
      setError(err.message || 'Failed to retrieve POI recommendations.');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateItineraryDirect = async () => {
    if (!destination.trim()) {
      setError('Please select or specify a destination.');
      return;
    }

    syncPlanContext();
    setLoading(true);
    setError(null);

    try {
      const itin = await itineraryService.generateItinerary({
        destination,
        source,
        startLocation: sourceLocation,
        destinationLocation: destinationLocation,
        roundTrip,
        startDate,
        endDate,
        travelersCount,
        budget,
        dailyAvailableHours: dailyHours,
        transportation,
        pace,
        fuelType,
        mileageKmpl,
        fuelPricePerLitre,
        accommodationType,
        includeAccommodation,
        maxDailyDrivingHours,
        enableStopoverRecommendation,
        roomsNeeded,
      });

      setCurrentItinerary(itin);
      navigate('/itinerary');
    } catch (err) {
      setError(err.message || 'Failed to generate itinerary. You can discover recommendations first.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10">
      {/* Top Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-[#18B8A6]/10 text-[#129889] border border-[#18B8A6]/25 text-xs font-bold uppercase tracking-wider">
          <Sliders className="w-3.5 h-3.5" />
          <span>Trip Customization & Planning</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-[#163B46]">
          Configure Your Perfect Travel Itinerary
        </h1>
        <p className="text-xs sm:text-sm text-[#52636A] max-w-2xl mx-auto">
          Tailor your destinations, budget, and travel pacing. You can fill out the form manually or let our AI assistant extract your requirements instantly.
        </p>
      </div>

      {error && <ErrorMessage message={error} onRetry={() => setError(null)} />}

      {/* --- Natural Language AI Extractor Banner --- */}
      <div className="p-6 sm:p-8 rounded-3xl bg-white border border-[#DCE6E3] shadow-soft-md relative overflow-hidden">
        <div className="flex items-center space-x-2.5 mb-3">
          <div className="w-9 h-9 rounded-xl bg-[#EEF3F1] border border-[#DCE6E3] flex items-center justify-center text-[#18B8A6]">
            <Wand2 className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[#163B46]">Natural-Language AI Auto-Fill</h3>
            <p className="text-[11px] text-[#52636A]">
              Type or speak your travel desires in plain English to automatically populate all parameters below.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="relative">
            <textarea
              rows={2}
              value={nlQuery}
              onChange={(e) => setNlQuery(e.target.value)}
              placeholder="e.g. I want a relaxed 2-day trip to Hyderabad. I like historical places and good food. My budget is ₹5,000."
              className="w-full p-3.5 rounded-xl bg-[#F4F7F6] border border-[#DCE6E3] text-xs sm:text-sm text-[#26383D] placeholder-[#829196] focus:outline-none focus:border-[#18B8A6] focus:bg-white resize-none transition-colors"
            />
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            {/* Quick Prompts */}
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[#52636A]">
              <span className="text-[#829196] font-medium">Quick Fill:</span>
              <button
                type="button"
                onClick={() => {
                  const q = 'Plan a relaxed 5-day road trip from Rajampet, Y.S.R. Kadapa, Andhra Pradesh to Hyderabad for 2 travelers with ₹50,000 budget by car.';
                  setNlQuery(q);
                  setDestination('Hyderabad');
                  setDestinationLocation({
                    name: 'Hyderabad',
                    formatted_address: 'Hyderabad, Telangana, India',
                    latitude: 17.385044,
                    longitude: 78.486671,
                    category: 'city',
                  });
                  setSource('Rajampet, Y.S.R. Kadapa, Andhra Pradesh');
                  setSourceLocation({
                    name: 'Rajampet',
                    formatted_address: 'Rajampet, Y.S.R. Kadapa, Andhra Pradesh, India',
                    latitude: 14.239177,
                    longitude: 79.175167,
                    category: 'city',
                  });
                  setTravelersCount(2);
                  setBudget(50000);
                  setTransportation('driving-car');
                  setPace('relaxed');
                  setMileageKmpl(14.0);
                  setFuelPricePerLitre(105.0);
                  setAccommodationType('standard');
                  setIncludeAccommodation(true);
                  setMaxDailyDrivingHours(5.5);
                  setEnableStopoverRecommendation(true);
                  setStartDate('2026-11-17');
                  setEndDate('2026-11-21');
                }}
                className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-bold transition-colors shadow-2xs"
              >
                Rajampet → Hyderabad 5-Day (₹50k Long Drive)
              </button>
              <button
                type="button"
                onClick={() => {
                  const q = 'I want a relaxed 2-day trip to Hyderabad. I like historical places and good food. My budget is ₹5,000.';
                  setNlQuery(q);
                  handleExtractPreferences(q);
                }}
                className="px-2.5 py-1 rounded-lg bg-[#EEF3F1] hover:bg-[#DCE6E3] text-[#163B46] border border-[#DCE6E3] font-medium transition-colors"
              >
                Hyderabad 2-Day History (₹5k)
              </button>
              <button
                type="button"
                onClick={() => {
                  const q = 'A fast packed 3 days walking tour in Bengaluru with Rs 6000 for 2 people';
                  setNlQuery(q);
                  handleExtractPreferences(q);
                }}
                className="px-2.5 py-1 rounded-lg bg-[#EEF3F1] hover:bg-[#DCE6E3] text-[#163B46] border border-[#DCE6E3] font-medium transition-colors"
              >
                Bengaluru 3-Day Walking (₹6k)
              </button>
            </div>

            <button
              type="button"
              onClick={() => handleExtractPreferences()}
              disabled={extracting || !nlQuery.trim()}
              className="px-4 py-2 rounded-xl bg-[#18B8A6] hover:bg-[#129889] text-white font-bold text-xs flex items-center space-x-1.5 shadow-soft transition-all disabled:opacity-50"
            >
              {extracting ? (
                <LoadingSpinner size="sm" label="" />
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Parse with AI</span>
                </>
              )}
            </button>
          </div>

          {/* Extraction Confirmation Pill */}
          {extractionResult && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between text-xs text-[#16A36A]">
              <div className="flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-[#16A36A] flex-shrink-0" />
                <span>
                  Extracted via <strong>{extractionResult.source}</strong> ({(extractionResult.confidence * 100).toFixed(0)}% confidence). Parameters applied to form below.
                </span>
              </div>
              {extractionResult.preferences?.needs_clarification && (
                <span className="text-[11px] text-[#E6A23C] font-semibold">
                  Note: Some criteria need user confirmation.
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* --- Structured Form Card --- */}
      <div className="p-8 sm:p-10 rounded-3xl bg-white border border-[#DCE6E3] shadow-soft-lg space-y-8">
        {/* =============================================================== */}
        {/* SECTION 1 & 2: GOOGLE MAPS STYLE SOURCE & DESTINATION SELECTION */}
        {/* =============================================================== */}
        <div className="p-6 sm:p-7 rounded-3xl bg-[#F4F7F6]/90 border border-[#DCE6E3] space-y-5 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#DCE6E3]/70 pb-3">
            <div>
              <h3 className="text-sm font-extrabold text-[#163B46] uppercase tracking-wider flex items-center">
                <Compass className="w-4 h-4 mr-2 text-[#18B8A6]" />
                1 & 2. Trip Route & Location Selection
              </h3>
              <p className="text-[11px] text-[#52636A]">
                Search address, city, landmark, airport, or station. Both points can be searched or selected directly on the interactive map.
              </p>
            </div>

            {/* Round-Trip Circuit Toggle */}
            <label className="inline-flex items-center space-x-2 text-xs font-semibold text-[#163B46] cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={roundTrip}
                onChange={(e) => setRoundTrip(e.target.checked)}
                className="w-4 h-4 text-[#18B8A6] rounded focus:ring-[#18B8A6] border-[#DCE6E3]"
              />
              <span className="flex items-center space-x-1">
                <RotateCcw className="w-3.5 h-3.5 text-[#18B8A6]" />
                <span>Round-Trip (Return to Origin)</span>
              </span>
            </label>
          </div>

          {/* Location Search Inputs Row with Swap Button */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr,auto,1fr] items-start gap-3 relative">
            {/* Source Location (Starting Point) */}
            <LocationSearchInput
              label="Starting Point / From"
              placeholder="Search starting location, address, city, station, or airport..."
              value={source}
              selectedLocation={sourceLocation}
              onChangeText={(txt) => setSource(txt)}
              onSelectLocation={(loc) => {
                setSourceLocation(loc);
                if (loc?.name) setSource(loc.name);
              }}
              onOpenMapPicker={() => handleOpenMapPicker('source')}
              isDestination={false}
              quickPicks={POPULAR_ORIGINS[destination.toLowerCase()] || POPULAR_ORIGINS.hyderabad}
              required={true}
            />

            {/* Location Swap Button */}
            <div className="flex items-center justify-center pt-2 sm:pt-6 lg:pt-7">
              <button
                type="button"
                onClick={handleSwapLocations}
                title="Swap Starting Point & Destination"
                className="w-10 h-10 rounded-2xl bg-white border border-[#DCE6E3] hover:border-[#18B8A6] hover:bg-[#EEF3F1] text-[#163B46] shadow-soft flex items-center justify-center transition-all hover:scale-105 active:rotate-180 duration-200"
              >
                <ArrowUpDown className="w-4 h-4 text-[#18B8A6]" />
              </button>
            </div>

            {/* Destination Location (Target Point) */}
            <LocationSearchInput
              label="Destination / To"
              placeholder="Search destination city, attraction, address, or landmark..."
              value={destination}
              selectedLocation={destinationLocation}
              onChangeText={(txt) => setDestination(txt)}
              onSelectLocation={(loc) => {
                setDestinationLocation(loc);
                if (loc?.name) setDestination(loc.name);
              }}
              onOpenMapPicker={() => handleOpenMapPicker('destination')}
              isDestination={true}
              quickPicks={POPULAR_DESTINATIONS}
              required={true}
            />
          </div>

          {/* Interactive Road Route Preview Card */}
          <RoutePreviewCard
            sourceLocation={sourceLocation}
            destinationLocation={destinationLocation}
            transportation={transportation}
          />
        </div>

        {/* Section 3: Dates & Duration */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-bold text-[#163B46] uppercase tracking-wider flex items-center">
              <Calendar className="w-3.5 h-3.5 mr-1.5 text-[#18B8A6]" />
              3. Start Date
            </label>
            <input
              type="date"
              required
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-[#F4F7F6] border border-[#DCE6E3] focus:border-[#18B8A6] focus:bg-white text-sm text-[#26383D] focus:outline-none transition-all"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-[#163B46] uppercase tracking-wider flex items-center justify-between">
              <span className="flex items-center">
                <Calendar className="w-3.5 h-3.5 mr-1.5 text-[#18B8A6]" />
                End Date
              </span>
              <span className="text-[11px] text-[#18B8A6] font-bold lowercase">
                ({durationDays} day{durationDays > 1 ? 's' : ''})
              </span>
            </label>
            <input
              type="date"
              required
              value={endDate}
              min={startDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-[#F4F7F6] border border-[#DCE6E3] focus:border-[#18B8A6] focus:bg-white text-sm text-[#26383D] focus:outline-none transition-all"
            />
          </div>
        </div>

        {/* Section 4: Travelers & Budget */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-bold text-[#163B46] uppercase tracking-wider flex items-center">
              <Users className="w-3.5 h-3.5 mr-1.5 text-[#18B8A6]" />
              4. Number of Travelers
            </label>
            <div className="flex items-center space-x-2 bg-[#F4F7F6] border border-[#DCE6E3] p-1.5 rounded-xl">
              {[1, 2, 3, 4, 6].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => setTravelersCount(num)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    travelersCount === num
                      ? 'bg-[#163B46] text-white shadow-soft'
                      : 'text-[#52636A] hover:text-[#163B46] hover:bg-white'
                  }`}
                >
                  {num} {num === 1 ? 'Solo' : num === 2 ? 'Couple' : `${num}`}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-[#163B46] uppercase tracking-wider flex items-center justify-between">
              <span className="flex items-center">
                <DollarSign className="w-3.5 h-3.5 mr-1.5 text-[#16A36A]" />
                Total Budget (INR)
              </span>
              <span className="text-[11px] text-[#16A36A] font-bold">
                {formatCurrency(budget)}
              </span>
            </label>
            <input
              type="number"
              min="1000"
              step="500"
              value={budget}
              onChange={(e) => setBudget(parseFloat(e.target.value) || 0)}
              className="w-full px-4 py-2.5 rounded-xl bg-[#F4F7F6] border border-[#DCE6E3] focus:border-[#18B8A6] focus:bg-white text-sm text-[#26383D] focus:outline-none transition-all"
            />
          </div>
        </div>

        {/* Section 5: Transportation & Pacing */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Transport */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-[#163B46] uppercase tracking-wider">
              5. Transportation
            </label>
            <div className="grid grid-cols-3 gap-1.5 bg-[#F4F7F6] p-1.5 rounded-xl border border-[#DCE6E3]">
              {[
                { id: 'driving-car', label: 'Car', icon: Car },
                { id: 'foot-walking', label: 'Walk', icon: Footprints },
                { id: 'cycling-regular', label: 'Bike', icon: Bike },
              ].map((m) => {
                const Icon = m.icon;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setTransportation(m.id)}
                    className={`py-2 px-1 rounded-lg text-[11px] font-bold flex flex-col items-center justify-center space-y-1 transition-all ${
                      transportation === m.id
                        ? 'bg-[#18B8A6] text-white shadow-soft'
                        : 'text-[#52636A] hover:bg-white hover:text-[#163B46]'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{m.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Travel Pace */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-[#163B46] uppercase tracking-wider">
              5. Pacing Style
            </label>
            <div className="grid grid-cols-3 gap-1.5 bg-[#F4F7F6] p-1.5 rounded-xl border border-[#DCE6E3]">
              {[
                { id: 'relaxed', label: 'Relaxed' },
                { id: 'moderate', label: 'Moderate' },
                { id: 'packed', label: 'Packed' },
              ].map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPace(p.id)}
                  className={`py-2 px-1 rounded-lg text-[11px] font-bold capitalize transition-all ${
                    pace === p.id
                      ? 'bg-[#163B46] text-white shadow-soft'
                      : 'text-[#52636A] hover:bg-white hover:text-[#163B46]'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Daily Touring Hours */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-[#163B46] uppercase tracking-wider flex items-center justify-between">
              <span>6. Touring Hours</span>
              <span className="text-[11px] text-[#18B8A6] font-bold">{dailyHours}h/day</span>
            </label>
            <div className="grid grid-cols-3 gap-1.5 bg-[#F4F7F6] p-1.5 rounded-xl border border-[#DCE6E3]">
              {[6.0, 8.0, 10.0].map((hrs) => (
                <button
                  key={hrs}
                  type="button"
                  onClick={() => setDailyHours(hrs)}
                  className={`py-2 px-1 rounded-lg text-[11px] font-bold transition-all ${
                    dailyHours === hrs
                      ? 'bg-[#163B46] text-white shadow-soft'
                      : 'text-[#52636A] hover:bg-white hover:text-[#163B46]'
                  }`}
                >
                  {hrs}h/day
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Car Petrol & Vehicle Telemetry Live Estimator Card */}
        {transportation === 'driving-car' && (
          <div className="p-5 rounded-2xl bg-emerald-50/80 border border-emerald-200/90 space-y-3 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-emerald-200/60 pb-2.5">
              <div className="flex items-center space-x-2 text-xs font-bold text-[#16A36A]">
                <Fuel className="w-4 h-4 text-[#16A36A]" />
                <span>Car Fuel, Petrol Distance & Telemetry Engine</span>
              </div>
              <span className="text-[11px] font-bold text-emerald-800 bg-white/80 px-2.5 py-0.5 rounded-full border border-emerald-200">
                Mileage: {mileageKmpl} km/L • Petrol @ ₹{fuelPricePerLitre}/L
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-2.5 rounded-xl bg-white border border-emerald-100 flex items-center space-x-2.5">
                <Navigation className="w-4 h-4 text-[#18B8A6] shrink-0" />
                <div>
                  <span className="text-[10px] text-[#829196] block uppercase tracking-wider">Starting Point:</span>
                  <span className="font-bold text-[#163B46] truncate block">{source || 'Hyderabad Airport'}</span>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-white border border-emerald-100 flex items-center space-x-2.5">
                <RotateCcw className="w-4 h-4 text-[#16A36A] shrink-0" />
                <div>
                  <span className="text-[10px] text-[#829196] block uppercase tracking-wider">Circuit Routing:</span>
                  <span className="font-bold text-[#16A36A]">{roundTrip ? 'Starts & Ends at Source' : 'One-Way Tour'}</span>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-white border border-emerald-100 flex items-center space-x-2.5">
                <CheckCircle2 className="w-4 h-4 text-[#16A36A] shrink-0" />
                <div>
                  <span className="text-[10px] text-[#829196] block uppercase tracking-wider">Daily Quota:</span>
                  <span className="font-bold text-[#163B46]">At least 3 Places/Day</span>
                </div>
              </div>
            </div>

            <p className="text-[11px] text-[#52636A] leading-relaxed">
              Based on your car travel mode, our engine determines the road distance, fuel consumption in litres, petrol costs, and adds parking & highway toll buffers. The 2-Opt road optimizer connects each attraction to ensure your trip gets completed seamlessly.
            </p>
          </div>
        )}

        {/* Section 6: Intelligent Distance Assessment & Hotel Recommendations (Phase 6 Engine) */}
        <div className="p-5 rounded-2xl bg-amber-50/70 border border-amber-200/90 space-y-4 shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-amber-200/60 pb-2.5">
            <div className="flex items-center space-x-2 text-xs font-bold text-amber-900">
              <Hotel className="w-4 h-4 text-amber-600" />
              <span>Intelligent Distance Assessment & Hotel Recommendation Engine</span>
            </div>
            <label className="inline-flex items-center space-x-2 text-xs font-semibold text-amber-900 cursor-pointer">
              <input
                type="checkbox"
                checked={enableStopoverRecommendation}
                onChange={(e) => setEnableStopoverRecommendation(e.target.checked)}
                className="w-4 h-4 text-amber-600 rounded focus:ring-amber-500 border-amber-300"
              />
              <span>Auto-Recommend Midway Stopover Hotels (&gt;5.5h drives)</span>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Accommodation Tier */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#163B46] uppercase tracking-wider flex items-center">
                <Bed className="w-3.5 h-3.5 mr-1 text-amber-600" />
                Hotel Category
              </label>
              <select
                value={accommodationType}
                onChange={(e) => setAccommodationType(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-white border border-amber-200 text-xs font-semibold text-[#163B46] focus:outline-none focus:border-amber-500"
              >
                <option value="budget">Budget Hotel (₹1,400 - ₹2,200/nt)</option>
                <option value="standard">Standard Hotel (₹2,800 - ₹4,500/nt)</option>
                <option value="premium">Premium Hotel (₹5,000 - ₹8,000/nt)</option>
                <option value="luxury">Luxury Hotel (₹8,500 - ₹16,000/nt)</option>
                <option value="homestay">Homestay (₹1,800 - ₹3,200/nt)</option>
                <option value="resort">Resort (₹6,000 - ₹14,000/nt)</option>
                <option value="hostel">Hostel (₹750 - ₹1,400/nt)</option>
              </select>
            </div>

            {/* Max Daily Continuous Driving Hours */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#163B46] uppercase tracking-wider flex items-center justify-between">
                <span className="flex items-center">
                  <Clock className="w-3.5 h-3.5 mr-1 text-amber-600" />
                  Max Driving Hours
                </span>
                <span className="text-[11px] font-bold text-amber-700">{maxDailyDrivingHours}h limit</span>
              </label>
              <div className="flex items-center space-x-1.5 bg-white p-1 rounded-xl border border-amber-200">
                {[4.0, 5.5, 7.0, 8.0].map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setMaxDailyDrivingHours(h)}
                    className={`flex-1 py-1 rounded-lg text-[11px] font-bold transition-all ${
                      maxDailyDrivingHours === h
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'text-[#52636A] hover:bg-amber-50'
                    }`}
                  >
                    {h}h{h === 5.5 ? ' ⭐' : ''}
                  </button>
                ))}
              </div>
            </div>

            {/* Rooms Count */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#163B46] uppercase tracking-wider flex items-center justify-between">
                <span>Rooms Required</span>
                <span className="text-[11px] text-[#829196]">
                  {roomsNeeded} Room{roomsNeeded > 1 ? 's' : ''}
                </span>
              </label>
              <div className="flex items-center space-x-1.5 bg-white p-1 rounded-xl border border-amber-200">
                {[1, 2, 3, 4].map((rm) => (
                  <button
                    key={rm}
                    type="button"
                    onClick={() => setRoomsNeeded(rm)}
                    className={`flex-1 py-1 rounded-lg text-[11px] font-bold transition-all ${
                      roomsNeeded === rm
                        ? 'bg-[#163B46] text-white shadow-xs'
                        : 'text-[#52636A] hover:bg-amber-50'
                    }`}
                  >
                    {rm} {rm === 1 ? 'Room' : 'Rooms'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <p className="text-[11px] text-amber-900/80 leading-relaxed">
            When driving duration exceeds comfortable thresholds (e.g. Rajampet → Hyderabad ~8.5h), the engine automatically classifies the trip as <strong>Result B: Long Journey</strong> and recommends verified midway stopover hotels (e.g. in Kurnool or Nandyal) along with highway refreshment rest stops every ~130 km.
          </p>
        </div>

        {/* Section 7: Interests Selection */}
        <div className="space-y-3">
          <label className="text-xs font-bold text-[#163B46] uppercase tracking-wider flex items-center justify-between">
            <span>7. Tourism Interests & Themes (Factor P)</span>
            <span className="text-[11px] text-[#829196] font-normal">
              {interests.length} selected
            </span>
          </label>
          <div className="flex flex-wrap gap-2">
            {AVAILABLE_INTERESTS.map((interest) => {
              const selected = interests.includes(interest);
              return (
                <button
                  key={interest}
                  type="button"
                  onClick={() => toggleInterest(interest)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                    selected
                      ? 'bg-[#18B8A6]/15 text-[#129889] border-[#18B8A6] shadow-soft'
                      : 'bg-[#F4F7F6] text-[#52636A] border-[#DCE6E3] hover:bg-[#EEF3F1] hover:text-[#163B46]'
                  }`}
                >
                  {interest}
                </button>
              );
            })}
          </div>
        </div>

        {/* Actions Bar */}
        <div className="pt-6 border-t border-[#DCE6E3] flex flex-col sm:flex-row items-center justify-between gap-4">
          <button
            type="button"
            onClick={handleDiscoverRecommendations}
            disabled={loading}
            className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-[#EEF3F1] hover:bg-[#DCE6E3] text-[#163B46] font-bold text-xs sm:text-sm border border-[#DCE6E3] transition-all flex items-center justify-center space-x-2 shadow-soft disabled:opacity-50"
          >
            <span>Browse Recommendations First</span>
            <ArrowRight className="w-4 h-4 text-[#18B8A6]" />
          </button>

          <button
            type="button"
            onClick={handleGenerateItineraryDirect}
            disabled={loading}
            className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-[#18B8A6] hover:bg-[#129889] text-white font-bold text-xs sm:text-sm shadow-soft hover:shadow-soft-md transition-all hover:scale-[1.02] flex items-center justify-center space-x-2 disabled:opacity-50"
          >
            {loading ? (
              <LoadingSpinner size="sm" label="" />
            ) : (
              <>
                <Calendar className="w-4 h-4" />
                <span>Generate Itinerary Directly</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Interactive Map Picker Modal */}
      <MapLocationPickerModal
        isOpen={mapModalOpen}
        onClose={() => setMapModalOpen(false)}
        targetField={mapModalTarget}
        initialLocation={mapModalTarget === 'destination' ? destinationLocation : sourceLocation}
        onConfirmLocation={handleModalConfirmLocation}
      />
    </div>
  );
}
