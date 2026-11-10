import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Compass,
  MapPin,
  Clock,
  DollarSign,
  TrendingUp,
  CheckCircle2,
  Calendar,
  Bookmark,
  Sparkles,
  Info,
  Map as MapIcon,
  Sliders,
  Check,
  Plus,
} from 'lucide-react';
import { useTrip } from '../context/TripContext';
import recommendationService from '../services/recommendationService';
import itineraryService from '../services/itineraryService';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import AttractionImage from '../components/AttractionImage';
import { formatCurrency, formatDurationMins, formatDistanceKm, getCategoryBadgeColor, capitalizeWords } from '../utils/formatters';

export default function RecommendationsPage() {
  const navigate = useNavigate();
  const {
    tripPlan,
    recommendations,
    setRecommendations,
    selectedAttractions,
    toggleAttractionSelection,
    selectAllAttractions,
    clearSelectedAttractions,
    savedPlaces,
    toggleSavePlace,
    isPlaceSaved,
    setCurrentItinerary,
  } = useTrip();

  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);

  // Auto-fetch if recommendations are empty
  useEffect(() => {
    const fetchRecs = async () => {
      if (recommendations.length === 0) {
        setLoading(true);
        setError(null);
        try {
          const res = await recommendationService.getRecommendations({
            destination: tripPlan.destination || 'Hyderabad',
            interests: tripPlan.interests || ['Historical Places', 'Food', 'Culture'],
            budget: tripPlan.budget || 5000,
            availableDurationDays: 2,
            transportation: tripPlan.transportation || 'driving-car',
            dailyTouringHours: tripPlan.dailyAvailableHours || 8.0,
            limit: 12,
          });
          setRecommendations(res.recommendations || []);
          // By default, select the top 6 POIs
          if (selectedAttractions.length === 0 && res.recommendations?.length > 0) {
            selectAllAttractions(res.recommendations.slice(0, 6));
          }
        } catch (err) {
          setError(err.message || 'Could not load POI recommendations.');
        } finally {
          setLoading(false);
        }
      }
    };

    fetchRecs();
  }, [tripPlan.destination]);

  // Handle generating itinerary with the currently selected POIs
  const handleGenerateItinerary = async () => {
    if (selectedAttractions.length === 0) {
      setError('Please select at least one attraction to schedule in your itinerary.');
      return;
    }

    setGenerating(true);
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
        selectedAttractions: selectedAttractions,
        fuelType: tripPlan.fuelType || 'petrol',
        mileageKmpl: tripPlan.mileageKmpl || 14.0,
        fuelPricePerLitre: tripPlan.fuelPricePerLitre || 105.0,
      });

      setCurrentItinerary(itin);
      navigate('/itinerary');
    } catch (err) {
      setError(err.message || 'Itinerary generation failed. Please check constraints.');
    } finally {
      setGenerating(false);
    }
  };

  const isSelected = (poi) => {
    return selectedAttractions.some((p) => (p.place_id || p.id) === (poi.place_id || poi.id));
  };

  const totalSelectedFee = selectedAttractions.reduce(
    (acc, curr) => acc + (curr.entrance_fee || 0),
    0
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 mb-2">
            <span className="px-3 py-1 rounded-full bg-[#18B8A6]/10 text-[#129889] text-xs font-bold border border-[#18B8A6]/20">
              Scoring Engine Active
            </span>
            <span className="text-xs text-[#829196]">•</span>
            <span className="text-xs font-semibold text-[#52636A]">{tripPlan.destination || 'Hyderabad'}</span>
          </div>
          <h1 className="text-3xl font-extrabold text-[#163B46] tracking-tight">
            Recommended Attractions
          </h1>
          <p className="text-sm text-[#52636A] mt-1 max-w-2xl leading-relaxed">
            Ranked using multi-criteria optimization balancing preferences, distance, dwell times, and costs. Select the attractions you want to incorporate into your day-by-day itinerary.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => navigate('/plan')}
            className="px-4 py-2.5 rounded-xl bg-white border border-[#DCE6E3] text-xs font-semibold text-[#26383D] hover:bg-[#EEF3F1] hover:border-[#829196] transition-colors shadow-sm"
          >
            Adjust Criteria
          </button>
          <button
            onClick={() => navigate('/map')}
            className="px-4 py-2.5 rounded-xl bg-white border border-[#DCE6E3] text-xs font-semibold text-[#18B8A6] hover:bg-[#EEF3F1] hover:border-[#18B8A6] transition-colors flex items-center space-x-1.5 shadow-sm"
          >
            <MapIcon className="w-4 h-4" />
            <span>Map View</span>
          </button>
        </div>
      </div>

      {error && <ErrorMessage message={error} onRetry={() => setError(null)} />}

      {/* Sticky Selection Toolbar */}
      <div className="sticky top-20 z-30 p-4 rounded-2xl bg-white/95 border border-[#DCE6E3] backdrop-blur-md shadow-soft flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center space-x-4 text-xs">
          <div className="flex items-center space-x-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#18B8A6] animate-pulse" />
            <span className="font-bold text-[#163B46] text-sm">
              {selectedAttractions.length} of {recommendations.length} Selected
            </span>
          </div>
          <span className="text-[#DCE6E3] hidden sm:inline">|</span>
          <span className="text-[#52636A] hidden sm:inline">
            Estimated Admission: <strong className="text-[#16A36A] font-bold">{formatCurrency(totalSelectedFee)}</strong>
          </span>
        </div>

        <div className="flex items-center space-x-2.5 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => selectAllAttractions(recommendations)}
            className="flex-1 sm:flex-none px-3.5 py-2 rounded-xl bg-[#EEF3F1] hover:bg-[#DCE6E3] text-[#26383D] text-xs font-semibold transition-colors"
          >
            Select All
          </button>
          <button
            type="button"
            onClick={clearSelectedAttractions}
            className="flex-1 sm:flex-none px-3.5 py-2 rounded-xl bg-[#EEF3F1] hover:bg-[#DCE6E3] text-[#52636A] text-xs font-semibold transition-colors"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={handleGenerateItinerary}
            disabled={generating || selectedAttractions.length === 0}
            className="flex-1 sm:flex-none px-6 py-2.5 rounded-xl bg-[#18B8A6] hover:bg-[#129889] text-white font-bold text-xs shadow-soft transition-all flex items-center justify-center space-x-2 disabled:opacity-50"
          >
            {generating ? (
              <LoadingSpinner size="sm" label="" />
            ) : (
              <>
                <Calendar className="w-4 h-4" />
                <span>Build Itinerary ({selectedAttractions.length})</span>
              </>
            )}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="min-h-[40vh] flex items-center justify-center">
          <LoadingSpinner label="Scoring candidate tourist attractions across multi-dimensional criteria..." />
        </div>
      ) : recommendations.length === 0 ? (
        <div className="p-12 text-center rounded-3xl bg-white border border-[#DCE6E3] shadow-soft space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-[#EEF3F1] flex items-center justify-center mx-auto text-[#18B8A6]">
            <Compass className="w-7 h-7" />
          </div>
          <h3 className="text-lg font-bold text-[#163B46]">No Attractions Found</h3>
          <p className="text-xs sm:text-sm text-[#52636A] max-w-md mx-auto">
            Try adjusting your search radius, destination name, or travel budget in the trip configuration.
          </p>
          <button
            onClick={() => navigate('/plan')}
            className="px-5 py-2.5 rounded-xl bg-[#18B8A6] hover:bg-[#129889] text-white text-xs font-bold shadow-soft transition-colors"
          >
            Modify Preferences
          </button>
        </div>
      ) : (
        /* POI Cards Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {recommendations.map((poi, idx) => {
            const selected = isSelected(poi);
            const saved = isPlaceSaved(poi.place_id || poi.id);
            const scorePercent = Math.round((poi.final_score || 0.8) * 100);

            return (
              <div
                key={poi.place_id || poi.id || idx}
                className={`rounded-2xl overflow-hidden bg-white border transition-all duration-200 flex flex-col justify-between shadow-soft hover:shadow-md ${
                  selected
                    ? 'border-[#18B8A6] ring-2 ring-[#18B8A6]/30'
                    : 'border-[#DCE6E3] hover:border-[#829196]/40'
                }`}
              >
                {/* Photo & Badge Overlay */}
                <div className="relative h-48 overflow-hidden bg-[#EEF3F1]">
                  <AttractionImage
                    name={poi.name}
                    city={tripPlan.destination || poi.city}
                    attractionId={poi.place_id || poi.id}
                    initialUrl={poi.image_url}
                    initialAttribution={poi.image_attribution}
                    aspectRatio="h-48"
                    alt={poi.name}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/15 pointer-events-none" />

                  {/* Top floating controls */}
                  <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
                    <span
                      className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border shadow-sm backdrop-blur-md ${getCategoryBadgeColor(
                        poi.category
                      )}`}
                    >
                      {capitalizeWords(poi.category)}
                    </span>

                    <button
                      type="button"
                      onClick={() => toggleSavePlace(poi)}
                      title={saved ? 'Bookmarked' : 'Bookmark for later'}
                      className={`p-2 rounded-full backdrop-blur-md transition-all shadow-sm ${
                        saved
                          ? 'bg-[#18B8A6] text-white'
                          : 'bg-white/90 text-[#52636A] hover:text-[#163B46] hover:bg-white'
                      }`}
                    >
                      <Bookmark className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Bottom score banner */}
                  <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-white/95 backdrop-blur-md border border-[#DCE6E3] shadow-sm">
                      <TrendingUp className="w-3.5 h-3.5 text-[#18B8A6]" />
                      <span className="font-extrabold text-[#163B46]">
                        {scorePercent}% Match <span className="font-normal text-[#52636A]">(#{poi.rank || idx + 1})</span>
                      </span>
                    </div>

                    {poi.distance_km !== undefined && (
                      <span className="text-[11px] font-medium text-white px-2.5 py-1 rounded-lg bg-black/50 backdrop-blur-md">
                        {formatDistanceKm(poi.distance_km)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Body Content */}
                <div className="p-5 space-y-4 flex-1 flex flex-col justify-between">
                  <div className="space-y-2.5">
                    <h3 className="text-base font-bold text-[#163B46] leading-snug">{capitalizeWords(poi.name)}</h3>

                    {poi.address && (
                      <p className="text-xs text-[#52636A] line-clamp-1 flex items-center">
                        <MapPin className="w-3.5 h-3.5 mr-1 text-[#829196] flex-shrink-0" />
                        <span>{poi.address}</span>
                      </p>
                    )}

                    {/* Engine Generated Reason / Explanation */}
                    {poi.explanation && (
                      <div className="p-3 rounded-xl bg-[#EEF3F1] border border-[#DCE6E3] text-xs text-[#26383D] leading-relaxed flex items-start space-x-2">
                        <Sparkles className="w-4 h-4 text-[#18B8A6] flex-shrink-0 mt-0.5" />
                        <span className="italic">{poi.explanation}</span>
                      </div>
                    )}

                    {/* Quick Metric Grid */}
                    <div className="grid grid-cols-2 gap-2 pt-1 text-xs text-[#52636A]">
                      <div className="flex items-center space-x-1.5 bg-[#F4F7F6] p-2 rounded-lg border border-[#DCE6E3]/60">
                        <Clock className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                        <span className="truncate">
                          {formatDurationMins(poi.estimated_duration_mins || 90)}
                        </span>
                      </div>

                      <div className="flex items-center space-x-1.5 bg-[#F4F7F6] p-2 rounded-lg border border-[#DCE6E3]/60">
                        <DollarSign className="w-3.5 h-3.5 text-[#16A36A] flex-shrink-0" />
                        <span className="truncate font-semibold text-[#16A36A]">
                          {poi.entrance_fee > 0 ? formatCurrency(poi.entrance_fee) : 'Free Entry'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Selection Button */}
                  <div className="pt-3 border-t border-[#DCE6E3]">
                    <button
                      type="button"
                      onClick={() => toggleAttractionSelection(poi)}
                      className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-2 ${
                        selected
                          ? 'bg-[#18B8A6] hover:bg-[#129889] text-white shadow-soft'
                          : 'bg-[#EEF3F1] hover:bg-[#DCE6E3] text-[#163B46] border border-[#DCE6E3]'
                      }`}
                    >
                      {selected ? (
                        <>
                          <Check className="w-4 h-4 stroke-[3]" />
                          <span>Selected for Itinerary</span>
                        </>
                      ) : (
                        <>
                          <Plus className="w-4 h-4" />
                          <span>Select Attraction</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
