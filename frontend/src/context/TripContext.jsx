import React, { createContext, useContext, useState, useEffect } from 'react';

const TripContext = createContext(null);

export const TripProvider = ({ children }) => {
  // Default dates: 7 days from now for 2 days
  const getDefaultDates = () => {
    const today = new Date();
    const start = new Date(today);
    start.setDate(today.getDate() + 7);
    const end = new Date(start);
    end.setDate(start.getDate() + 1);

    return {
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0],
    };
  };

  const initialDates = getDefaultDates();

  const [tripPlan, setTripPlan] = useState(() => {
    try {
      const saved = localStorage.getItem('travelsense_active_plan');
      return saved
        ? JSON.parse(saved)
        : {
            destination: 'Hyderabad',
            source: 'Hyderabad Airport (RGIA)',
            roundTrip: true,
            startDate: initialDates.startDate,
            endDate: initialDates.endDate,
            travelersCount: 1,
            budget: 5000,
            transportation: 'driving-car',
            fuelType: 'petrol',
            mileageKmpl: 14.0,
            fuelPricePerLitre: 105.0,
            pace: 'relaxed',
            dailyAvailableHours: 8.0,
            interests: ['Historical Places', 'Food', 'Culture'],
            userQuery: '',
            accommodationType: 'standard',
            includeAccommodation: true,
            maxDailyDrivingHours: 5.5,
            enableStopoverRecommendation: true,
            roomsNeeded: 1,
            preferredStopoverTown: null,
            selectedStopoverHotelId: null,
            selectedDestinationHotelId: null,
          };
    } catch {
      return {
        destination: 'Hyderabad',
        source: 'Hyderabad Airport (RGIA)',
        roundTrip: true,
        startDate: initialDates.startDate,
        endDate: initialDates.endDate,
        travelersCount: 1,
        budget: 5000,
        transportation: 'driving-car',
        fuelType: 'petrol',
        mileageKmpl: 14.0,
        fuelPricePerLitre: 105.0,
        pace: 'relaxed',
        dailyAvailableHours: 8.0,
        interests: ['Historical Places', 'Food', 'Culture'],
        userQuery: '',
        accommodationType: 'standard',
        includeAccommodation: true,
        maxDailyDrivingHours: 5.5,
        enableStopoverRecommendation: true,
        roomsNeeded: 1,
        preferredStopoverTown: null,
        selectedStopoverHotelId: null,
        selectedDestinationHotelId: null,
      };
    }
  });

  const [recommendations, setRecommendations] = useState(() => {
    try {
      const saved = localStorage.getItem('travelsense_recommendations');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [selectedAttractions, setSelectedAttractions] = useState(() => {
    try {
      const saved = localStorage.getItem('travelsense_selected_pois');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [currentItinerary, setCurrentItinerary] = useState(() => {
    try {
      const saved = localStorage.getItem('travelsense_current_itinerary');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [savedPlaces, setSavedPlaces] = useState(() => {
    try {
      const saved = localStorage.getItem('travelsense_saved_places');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [savedTrips, setSavedTrips] = useState(() => {
    try {
      const saved = localStorage.getItem('travelsense_saved_trips');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Sync to localStorage
  useEffect(() => {
    localStorage.setItem('travelsense_active_plan', JSON.stringify(tripPlan));
  }, [tripPlan]);

  useEffect(() => {
    localStorage.setItem('travelsense_recommendations', JSON.stringify(recommendations));
  }, [recommendations]);

  useEffect(() => {
    localStorage.setItem('travelsense_selected_pois', JSON.stringify(selectedAttractions));
  }, [selectedAttractions]);

  useEffect(() => {
    if (currentItinerary) {
      localStorage.setItem('travelsense_current_itinerary', JSON.stringify(currentItinerary));
    }
  }, [currentItinerary]);

  useEffect(() => {
    localStorage.setItem('travelsense_saved_places', JSON.stringify(savedPlaces));
  }, [savedPlaces]);

  useEffect(() => {
    localStorage.setItem('travelsense_saved_trips', JSON.stringify(savedTrips));
  }, [savedTrips]);

  const updatePlan = (newPlan) => {
    setTripPlan((prev) => ({ ...prev, ...newPlan }));
  };

  const toggleAttractionSelection = (poi) => {
    setSelectedAttractions((prev) => {
      const exists = prev.some((p) => (p.place_id || p.id) === (poi.place_id || poi.id));
      if (exists) {
        return prev.filter((p) => (p.place_id || p.id) !== (poi.place_id || poi.id));
      } else {
        return [...prev, poi];
      }
    });
  };

  const selectAllAttractions = (pois) => {
    setSelectedAttractions(pois);
  };

  const clearSelectedAttractions = () => {
    setSelectedAttractions([]);
  };

  const toggleSavePlace = (poi) => {
    setSavedPlaces((prev) => {
      const exists = prev.some((p) => (p.place_id || p.id) === (poi.place_id || poi.id));
      if (exists) {
        return prev.filter((p) => (p.place_id || p.id) !== (poi.place_id || poi.id));
      } else {
        return [...prev, poi];
      }
    });
  };

  const isPlaceSaved = (poiId) => {
    return savedPlaces.some((p) => (p.place_id || p.id) === poiId);
  };

  const saveCurrentTrip = (itinerary) => {
    if (!itinerary) return;
    setSavedTrips((prev) => {
      const filtered = prev.filter((t) => t.itinerary_id !== itinerary.itinerary_id);
      return [itinerary, ...filtered];
    });
  };

  return (
    <TripContext.Provider
      value={{
        tripPlan,
        updatePlan,
        recommendations,
        setRecommendations,
        selectedAttractions,
        setSelectedAttractions,
        toggleAttractionSelection,
        selectAllAttractions,
        clearSelectedAttractions,
        currentItinerary,
        setCurrentItinerary,
        savedPlaces,
        toggleSavePlace,
        isPlaceSaved,
        savedTrips,
        saveCurrentTrip,
      }}
    >
      {children}
    </TripContext.Provider>
  );
};

export const useTrip = () => {
  const context = useContext(TripContext);
  if (!context) {
    throw new Error('useTrip must be used within a TripProvider');
  }
  return context;
};

export default TripContext;

