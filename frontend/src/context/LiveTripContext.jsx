import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useTrip } from './TripContext';
import liveTripService from '../services/liveTripService';

const LiveTripContext = createContext(null);

export function LiveTripProvider({ children }) {
  const { currentItinerary } = useTrip();

  const [isLiveActive, setIsLiveActive] = useState(() => {
    return localStorage.getItem('travelsense_live_active') === 'true';
  });
  const [currentDayNumber, setCurrentDayNumber] = useState(() => {
    return parseInt(localStorage.getItem('travelsense_live_day') || '1', 10);
  });
  const [activeStopIndex, setActiveStopIndex] = useState(() => {
    return parseInt(localStorage.getItem('travelsense_live_active_stop_idx') || '0', 10);
  });
  const [completedStopIds, setCompletedStopIds] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('travelsense_live_completed') || '[]');
    } catch {
      return [];
    }
  });
  const [skippedStopIds, setSkippedStopIds] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('travelsense_live_skipped') || '[]');
    } catch {
      return [];
    }
  });
  const [delayMinutes, setDelayMinutes] = useState(0);

  // Live GPS Coordinates
  const [userCoords, setUserCoords] = useState({ latitude: 17.385, longitude: 78.4867 });
  const [isGpsLocked, setIsGpsLocked] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationSpeed, setSimulationSpeed] = useState(1);

  // Recalculated state
  const [liveStops, setLiveStops] = useState([]);
  const [liveAlerts, setLiveAlerts] = useState([]);
  const [liveWarnings, setLiveWarnings] = useState([]);
  const [suggestedAction, setSuggestedAction] = useState(null);
  const [isRecalculating, setIsRecalculating] = useState(false);

  const simulationTimerRef = useRef(null);

  // Persist key state
  useEffect(() => {
    localStorage.setItem('travelsense_live_active', String(isLiveActive));
    localStorage.setItem('travelsense_live_day', String(currentDayNumber));
    localStorage.setItem('travelsense_live_active_stop_idx', String(activeStopIndex));
    localStorage.setItem('travelsense_live_completed', JSON.stringify(completedStopIds));
    localStorage.setItem('travelsense_live_skipped', JSON.stringify(skippedStopIds));
  }, [isLiveActive, currentDayNumber, activeStopIndex, completedStopIds, skippedStopIds]);

  // Sync initial day stops from current itinerary
  useEffect(() => {
    if (currentItinerary && currentItinerary.days) {
      const activeDay = currentItinerary.days.find((d) => d.day_number === currentDayNumber);
      if (activeDay && activeDay.stops) {
        setLiveStops(activeDay.stops);
        if (activeDay.stops[0]) {
          setUserCoords({
            latitude: activeDay.stops[0].latitude,
            longitude: activeDay.stops[0].longitude,
          });
        }
      }
    }
  }, [currentItinerary, currentDayNumber]);

  // Request real device GPS
  const requestDeviceGps = useCallback(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setUserCoords({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          });
          setIsGpsLocked(true);
        },
        (err) => {
          console.warn('Geolocation access denied or unavailable:', err);
          setIsGpsLocked(false);
        },
        { enableHighAccuracy: true, timeout: 8000 }
      );
    }
  }, []);

  // Live on-the-fly Schedule Recalculation
  const recalculateLive = useCallback(
    async (extraDelay = 0, customCoords = null) => {
      if (!liveStops || liveStops.length === 0) return;
      setIsRecalculating(true);

      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const coords = customCoords || userCoords;

      try {
        const res = await liveTripService.recalculateSchedule({
          itinerary_id: currentItinerary?.itinerary_id,
          day_number: currentDayNumber,
          current_time: timeStr,
          current_latitude: coords.latitude,
          current_longitude: coords.longitude,
          active_stop_index: activeStopIndex,
          completed_stop_ids: completedStopIds,
          skipped_stop_ids: skippedStopIds,
          remaining_stops: liveStops,
          delay_minutes: extraDelay,
          transportation: currentItinerary?.transportation || 'driving-car',
        });

        if (res && res.updated_stops) {
          setLiveStops(res.updated_stops);
          setLiveAlerts(res.alerts || []);
          setLiveWarnings(res.warnings || []);
          setSuggestedAction(res.suggested_action);
        }
      } catch (err) {
        console.warn('Live recalculation error:', err);
      } finally {
        setIsRecalculating(false);
      }
    },
    [liveStops, userCoords, activeStopIndex, completedStopIds, skippedStopIds, currentDayNumber, currentItinerary]
  );

  // Start live trip execution
  const startLiveTrip = (dayNum = 1) => {
    setCurrentDayNumber(dayNum);
    setIsLiveActive(true);
    setActiveStopIndex(0);
    setCompletedStopIds([]);
    setSkippedStopIds([]);
    setDelayMinutes(0);
    requestDeviceGps();
  };

  const endLiveTrip = () => {
    setIsLiveActive(false);
    setIsSimulating(false);
    if (simulationTimerRef.current) {
      clearInterval(simulationTimerRef.current);
    }
  };

  const markStopVisited = (stopId) => {
    const idStr = String(stopId);
    if (!completedStopIds.includes(idStr)) {
      const nextCompleted = [...completedStopIds, idStr];
      setCompletedStopIds(nextCompleted);

      // Advance active stop
      const nextIdx = Math.min(activeStopIndex + 1, liveStops.length - 1);
      setActiveStopIndex(nextIdx);

      // Move user position to this stop
      const targetStop = liveStops.find((s) => String(s.place_id || s.id) === idStr);
      if (targetStop) {
        setUserCoords({ latitude: targetStop.latitude, longitude: targetStop.longitude });
      }

      recalculateLive(delayMinutes);
    }
  };

  const skipStop = (stopId) => {
    const idStr = String(stopId);
    if (!skippedStopIds.includes(idStr)) {
      setSkippedStopIds([...skippedStopIds, idStr]);
      const nextIdx = Math.min(activeStopIndex + 1, liveStops.length - 1);
      setActiveStopIndex(nextIdx);
      recalculateLive(delayMinutes);
    }
  };

  const addManualDelay = (mins) => {
    const newDelay = delayMinutes + mins;
    setDelayMinutes(newDelay);
    recalculateLive(newDelay);
  };

  // GPS Simulation Loop
  const startSimulation = () => {
    setIsSimulating(true);
  };

  const pauseSimulation = () => {
    setIsSimulating(false);
    if (simulationTimerRef.current) {
      clearInterval(simulationTimerRef.current);
    }
  };

  useEffect(() => {
    if (!isSimulating || !liveStops || liveStops.length === 0) {
      if (simulationTimerRef.current) clearInterval(simulationTimerRef.current);
      return;
    }

    const targetStop = liveStops[activeStopIndex];
    if (!targetStop) return;

    simulationTimerRef.current = setInterval(() => {
      setUserCoords((prev) => {
        const dLat = targetStop.latitude - prev.latitude;
        const dLon = targetStop.longitude - prev.longitude;
        const dist = Math.sqrt(dLat * dLat + dLon * dLon);

        if (dist < 0.002) {
          // Arrived at target stop in simulation!
          return { latitude: targetStop.latitude, longitude: targetStop.longitude };
        }

        const step = 0.0015 * simulationSpeed;
        return {
          latitude: prev.latitude + (dLat / dist) * step,
          longitude: prev.longitude + (dLon / dist) * step,
        };
      });
    }, 1000);

    return () => {
      if (simulationTimerRef.current) clearInterval(simulationTimerRef.current);
    };
  }, [isSimulating, activeStopIndex, liveStops, simulationSpeed]);

  return (
    <LiveTripContext.Provider
      value={{
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
        startLiveTrip,
        endLiveTrip,
        markStopVisited,
        skipStop,
        addManualDelay,
        startSimulation,
        pauseSimulation,
        setSimulationSpeed,
        requestDeviceGps,
        recalculateLive,
      }}
    >
      {children}
    </LiveTripContext.Provider>
  );
}

export function useLiveTrip() {
  const context = useContext(LiveTripContext);
  if (!context) {
    throw new Error('useLiveTrip must be used within a LiveTripProvider');
  }
  return context;
}

export default LiveTripContext;

