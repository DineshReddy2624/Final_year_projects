import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Car, Clock, Navigation, AlertTriangle, Sparkles, MapPin } from 'lucide-react';
import locationService from '../services/locationService';

// Custom Pin Markers for Preview
const createPreviewPin = (isDestination = false) => {
  return L.divIcon({
    className: 'custom-preview-pin',
    html: `
      <div style="
        width: 28px;
        height: 28px;
        border-radius: 50%;
        background: ${isDestination ? '#EF4444' : '#10B981'};
        color: #ffffff;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 13px;
        box-shadow: 0 3px 10px rgba(0,0,0,0.3);
        border: 2px solid #ffffff;
      ">
        ${isDestination ? '📍' : '🚩'}
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
};

function PreviewAutoFitter({ bounds }) {
  const map = useMap();
  useEffect(() => {
    if (bounds && bounds.length >= 2) {
      try {
        map.fitBounds(bounds, { padding: [35, 35], maxZoom: 13 });
      } catch (e) {
        console.warn('Preview fitBounds error:', e);
      }
    }
  }, [bounds, map]);
  return null;
}

export default function RoutePreviewCard({
  sourceLocation,
  destinationLocation,
  transportation = 'driving-car',
}) {
  const [routeData, setRouteData] = useState(null);
  const [loading, setLoading] = useState(false);

  const canPreview =
    sourceLocation?.latitude &&
    sourceLocation?.longitude &&
    destinationLocation?.latitude &&
    destinationLocation?.longitude;

  useEffect(() => {
    if (!canPreview) {
      setRouteData(null);
      return;
    }

    let isMounted = true;
    setLoading(true);

    locationService
      .getRoutePreview({
        sourceLat: sourceLocation.latitude,
        sourceLon: sourceLocation.longitude,
        destLat: destinationLocation.latitude,
        destLon: destinationLocation.longitude,
        profile: transportation,
      })
      .then((res) => {
        if (isMounted) {
          setRouteData(res);
        }
      })
      .catch((err) => {
        console.warn('Route preview calculation error:', err);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [
    sourceLocation?.latitude,
    sourceLocation?.longitude,
    destinationLocation?.latitude,
    destinationLocation?.longitude,
    transportation,
  ]);

  if (!canPreview) return null;

  const sCoord = [sourceLocation.latitude, sourceLocation.longitude];
  const dCoord = [destinationLocation.latitude, destinationLocation.longitude];
  const bounds = [sCoord, dCoord];

  const polylineCoords =
    routeData?.geometry && routeData.geometry.length > 0 ? routeData.geometry : [sCoord, dCoord];

  return (
    <div className="rounded-2xl border border-[#DCE6E3] bg-white overflow-hidden shadow-soft animate-in fade-in duration-200">
      {/* Route Metrics Header Bar */}
      <div className="p-3.5 sm:p-4 bg-[#F4F7F6] border-b border-[#DCE6E3] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-xl bg-[#163B46] text-[#18B8A6] flex items-center justify-center shrink-0 shadow-xs">
            <Car className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-bold text-[#163B46] flex items-center space-x-1.5">
              <span>Route Distance Preview</span>
              {loading && <span className="text-[10px] text-[#18B8A6] animate-pulse">Calculating...</span>}
            </div>
            <div className="text-[11px] text-[#52636A]">
              From <strong>{sourceLocation.name}</strong> to <strong>{destinationLocation.name}</strong>
            </div>
          </div>
        </div>

        {routeData && (
          <div className="flex items-center space-x-3 text-xs">
            <div className="px-3 py-1 rounded-lg bg-white border border-[#DCE6E3] font-bold text-[#163B46] shadow-2xs">
              🛣️ {routeData.distance_km.toFixed(1)} km
            </div>
            <div className="px-3 py-1 rounded-lg bg-white border border-[#DCE6E3] font-bold text-[#163B46] shadow-2xs">
              ⏱️ {Math.floor(routeData.duration_minutes / 60)}h {Math.round(routeData.duration_minutes % 60)}m
            </div>
          </div>
        )}
      </div>

      {/* Long-Distance Stopover Alert Banner */}
      {routeData?.suggest_stopover && (
        <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-200/80 flex items-center space-x-2 text-xs text-amber-900">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <span className="flex-1">
            <strong>Long-distance journey detected ({routeData.distance_km.toFixed(0)} km).</strong> Intelligent hotel stopover recommended midway for comfortable travel.
          </span>
        </div>
      )}

      {/* Compact Interactive Leaflet Preview Map */}
      <div className="relative h-44 sm:h-52 w-full bg-[#EEF3F1]">
        <MapContainer
          center={sCoord}
          zoom={8}
          scrollWheelZoom={false}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Marker position={sCoord} icon={createPreviewPin(false)} />
          <Marker position={dCoord} icon={createPreviewPin(true)} />
          <Polyline
            positions={polylineCoords}
            pathOptions={{
              color: '#18B8A6',
              weight: 4,
              opacity: 0.85,
              lineCap: 'round',
              lineJoin: 'round',
            }}
          />
          <PreviewAutoFitter bounds={bounds} />
        </MapContainer>
      </div>
    </div>
  );
}
