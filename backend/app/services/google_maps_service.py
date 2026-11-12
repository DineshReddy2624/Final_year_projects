import urllib.parse
from typing import Any, Dict, List, Optional, Tuple
import httpx

try:
    from app.core.config import settings
    from app.core.logger import logger
    from app.utils.cache import api_cache as cache
except ImportError:
    from backend.app.core.config import settings
    from backend.app.core.logger import logger
    from backend.app.utils.cache import api_cache as cache


class GoogleMapsService:
    """Service wrapping Google Maps Platform APIs:
    - Google Places API (Search, Details, Coordinates, Opening Hours)
    - Google Routes / Directions API (Turn-by-turn road routes, Distances, Durations)
    - Google Maps Universal Navigation URLs
    Gracefully falls back to secondary providers (Geoapify, ORS, Haversine) when keys are unset or rate-limited.
    """

    def __init__(self):
        self.maps_api_key = settings.GOOGLE_MAPS_API_KEY
        self.places_api_key = settings.GOOGLE_PLACES_API_KEY or self.maps_api_key
        self.routes_api_key = settings.GOOGLE_ROUTES_API_KEY or self.maps_api_key
        self.timeout = settings.EXTERNAL_API_TIMEOUT_SECONDS

    def is_configured(self) -> bool:
        return bool(self.maps_api_key or self.places_api_key or self.routes_api_key)

    def build_navigation_url(
        self,
        origin_lat: float,
        origin_lon: float,
        dest_lat: float,
        dest_lon: float,
        waypoints: Optional[List[Tuple[float, float]]] = None,
        travel_mode: str = "driving",
    ) -> str:
        """Construct official Google Maps Universal Deep-Link URL for turn-by-turn navigation.
        
        Args:
            origin_lat, origin_lon: Origin coordinates
            dest_lat, dest_lon: Final destination coordinates
            waypoints: Optional intermediate waypoint coordinates [(lat, lon), ...]
            travel_mode: 'driving', 'two_wheeler', 'walking', or 'transit'
        """
        mode_map = {
            "driving": "driving",
            "driving-car": "driving",
            "two_wheeler": "two_wheeler",
            "cycling-regular": "two_wheeler",
            "walking": "walking",
            "foot-walking": "walking",
        }
        g_mode = mode_map.get(travel_mode, "driving")

        url = (
            f"https://www.google.com/maps/dir/?api=1"
            f"&origin={origin_lat:.6f},{origin_lon:.6f}"
            f"&destination={dest_lat:.6f},{dest_lon:.6f}"
        )

        if waypoints and len(waypoints) > 0:
            # Google Maps supports up to 9-10 intermediate waypoints
            sampled_wp = waypoints
            if len(sampled_wp) > 9:
                step = max(1, len(sampled_wp) // 8)
                sampled_wp = sampled_wp[::step][:8]
            wp_str = "|".join(f"{lat:.6f},{lon:.6f}" for lat, lon in sampled_wp)
            url += f"&waypoints={urllib.parse.quote(wp_str)}"

        url += f"&travelmode={g_mode}"
        return url

    def build_place_search_url(
        self,
        place_name: str,
        city: str = "",
        place_id: Optional[str] = None,
        latitude: Optional[float] = None,
        longitude: Optional[float] = None,
    ) -> str:
        """Construct Google Maps search deep-link for a single place/restaurant/hotel."""
        query = f"{place_name}, {city}".strip(", ")
        encoded_query = urllib.parse.quote(query)
        url = f"https://www.google.com/maps/search/?api=1&query={encoded_query}"
        if place_id and not place_id.startswith("db_") and not place_id.startswith("custom_"):
            url += f"&query_place_id={urllib.parse.quote(place_id)}"
        return url

    async def search_places(
        self,
        query: str,
        location: Optional[Tuple[float, float]] = None,
        radius_meters: int = 25000,
        place_type: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Search places via Google Places API (Text Search / Nearby Search) if API key available."""
        if not self.places_api_key:
            return []

        cache_key = f"gplaces:{query}:{location}:{radius_meters}:{place_type}"
        cached = cache.get(cache_key)
        if cached:
            return cached

        url = "https://maps.googleapis.com/maps/api/place/textsearch/json"
        params: Dict[str, Any] = {
            "query": query,
            "key": self.places_api_key,
        }
        if location:
            params["location"] = f"{location[0]},{location[1]}"
            params["radius"] = str(radius_meters)
        if place_type:
            params["type"] = place_type

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.get(url, params=params)
                if resp.status_code == 200:
                    data = resp.json()
                    results = []
                    for item in data.get("results", [])[:20]:
                        geom = item.get("geometry", {}).get("location", {})
                        results.append({
                            "place_id": item.get("place_id"),
                            "name": item.get("name"),
                            "latitude": geom.get("lat"),
                            "longitude": geom.get("lng"),
                            "address": item.get("formatted_address"),
                            "rating": item.get("rating"),
                            "user_ratings_total": item.get("user_ratings_total"),
                            "types": item.get("types", []),
                            "source": "google_places",
                        })
                    cache.set(cache_key, results, ttl=7200)
                    return results
        except Exception as e:
            logger.warning(f"Google Places API search failed: {e}")

        return []

    async def get_route(
        self,
        origin: Tuple[float, float],
        destination: Tuple[float, float],
        waypoints: Optional[List[Tuple[float, float]]] = None,
        travel_mode: str = "driving",
    ) -> Optional[Dict[str, Any]]:
        """Compute route using Google Directions API if key configured."""
        if not self.routes_api_key:
            return None

        mode_map = {
            "driving": "driving",
            "driving-car": "driving",
            "two_wheeler": "bicycling",  # Directions API uses bicycling or driving with avoidHighways
            "cycling-regular": "bicycling",
            "walking": "walking",
            "foot-walking": "walking",
        }
        g_mode = mode_map.get(travel_mode, "driving")

        url = "https://maps.googleapis.com/maps/api/directions/json"
        params: Dict[str, Any] = {
            "origin": f"{origin[0]},{origin[1]}",
            "destination": f"{destination[0]},{destination[1]}",
            "mode": g_mode,
            "key": self.routes_api_key,
        }
        if waypoints:
            params["waypoints"] = "|".join(f"{lat},{lon}" for lat, lon in waypoints[:8])

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.get(url, params=params)
                if resp.status_code == 200:
                    data = resp.json()
                    if data.get("routes"):
                        route = data["routes"][0]
                        total_dist_m = sum(leg.get("distance", {}).get("value", 0) for leg in route.get("legs", []))
                        total_dur_s = sum(leg.get("duration", {}).get("value", 0) for leg in route.get("legs", []))
                        overview_polyline = route.get("overview_polyline", {}).get("points")
                        return {
                            "distance_km": round(total_dist_m / 1000.0, 2),
                            "duration_hours": round(total_dur_s / 3600.0, 2),
                            "duration_minutes": round(total_dur_s / 60.0, 1),
                            "overview_polyline": overview_polyline,
                            "source": "google_routes",
                        }
        except Exception as e:
            logger.warning(f"Google Directions API route failed: {e}")

        return None


google_maps_service = GoogleMapsService()
