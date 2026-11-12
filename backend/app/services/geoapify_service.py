from typing import Any, Dict, List, Optional, Tuple
import httpx
from fastapi import HTTPException, status

try:
    from app.core.config import settings
    from app.core.logger import logger
    from app.schemas.external import DestinationItem, PlaceItem
    from app.schemas.location import LocationItem
    from app.utils.cache import api_cache, execute_with_retry
except ImportError:
    from backend.app.core.config import settings
    from backend.app.core.logger import logger
    from backend.app.schemas.external import DestinationItem, PlaceItem
    from backend.app.schemas.location import LocationItem
    from backend.app.utils.cache import api_cache, execute_with_retry


class GeoapifyService:
    """Service wrapping Geoapify REST APIs for geocoding, attraction search, and place details."""

    BASE_URL_GEOCODE = "https://api.geoapify.com/v1/geocode/search"
    BASE_URL_AUTOCOMPLETE = "https://api.geoapify.com/v1/geocode/autocomplete"
    BASE_URL_REVERSE = "https://api.geoapify.com/v1/geocode/reverse"
    BASE_URL_PLACES = "https://api.geoapify.com/v2/places"
    BASE_URL_PLACE_DETAILS = "https://api.geoapify.com/v2/place-details"

    def __init__(self):
        self.api_key = settings.GEOAPIFY_API_KEY
        self.timeout = settings.EXTERNAL_API_TIMEOUT_SECONDS

    def validate_coordinates(self, latitude: float, longitude: float) -> None:
        """Validate geographic latitude and longitude bounds."""
        if not (-90.0 <= latitude <= 90.0):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid latitude: {latitude}. Must be between -90 and 90.",
            )
        if not (-180.0 <= longitude <= 180.0):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid longitude: {longitude}. Must be between -180 and 180.",
            )

    async def search_destinations(
        self,
        query: str,
        limit: int = 5,
    ) -> Tuple[List[DestinationItem], str]:
        """Geocode a destination city, region, or query string."""
        clean_query = query.strip()
        if not clean_query:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Search query cannot be empty",
            )

        cache_key = f"geoapify:destinations:{clean_query.lower()}:{limit}"
        cached = api_cache.get(cache_key)
        if cached is not None:
            logger.info(f"[CACHE HIT] Destination search for '{clean_query}'")
            return cached, "cached"

        if not self.api_key:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Geoapify API key is not configured in GEOAPIFY_API_KEY",
            )

        params = {
            "text": clean_query,
            "limit": limit,
            "apiKey": self.api_key,
            "format": "json",
        }

        async def _call():
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                res = await client.get(self.BASE_URL_GEOCODE, params=params)
                if res.status_code == 401:
                    logger.error("Geoapify API key is invalid or unauthorized")
                    raise HTTPException(
                        status_code=status.HTTP_502_BAD_GATEWAY,
                        detail="Geoapify authentication failed. Invalid API key.",
                    )
                if res.status_code == 429:
                    logger.warning("Geoapify rate limit exceeded")
                    raise HTTPException(
                        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                        detail="Geoapify rate limit reached. Please try again shortly.",
                    )
                res.raise_for_status()
                return res.json()

        data = await execute_with_retry(_call, operation_name=f"Geocode destination '{clean_query}'")
        raw_results = data.get("results", [])

        destinations: List[DestinationItem] = []
        for item in raw_results:
            lat = item.get("lat")
            lon = item.get("lon")
            if lat is None or lon is None:
                continue

            bbox_dict = None
            if "bbox" in item:
                bbox_dict = item["bbox"]

            destinations.append(
                DestinationItem(
                    name=item.get("name") or item.get("city") or clean_query,
                    formatted=item.get("formatted") or clean_query,
                    country=item.get("country"),
                    country_code=item.get("country_code"),
                    city=item.get("city"),
                    state=item.get("state"),
                    latitude=float(lat),
                    longitude=float(lon),
                    place_id=item.get("place_id"),
                    bbox=bbox_dict if isinstance(bbox_dict, dict) else None,
                )
            )

        api_cache.set(cache_key, destinations, ttl=settings.CACHE_DEFAULT_TTL_SECONDS)
        return destinations, "live"

    @staticmethod
    def _categorize_result(item: Dict[str, Any]) -> str:
        cat_raw = (item.get("category") or "").lower()
        res_type = (item.get("result_type") or "").lower()
        name_lower = (item.get("name") or "").lower()
        formatted_lower = (item.get("formatted") or "").lower()

        if "airport" in cat_raw or "airport" in name_lower or "aerodrome" in cat_raw:
            return "airport"
        if "railway" in cat_raw or "station" in cat_raw or "train" in name_lower or "station" in name_lower:
            return "station"
        if "hotel" in cat_raw or "accommodation" in cat_raw or "resort" in name_lower or "hotel" in name_lower:
            return "hotel"
        if "tourism" in cat_raw or "attraction" in cat_raw or "monument" in cat_raw or "museum" in cat_raw:
            return "attraction"
        if res_type in {"city", "administrative"} or "city" in cat_raw or "populated_place" in cat_raw:
            return "city"
        return "general"

    async def autocomplete(
        self,
        query: str,
        limit: int = 6,
    ) -> Tuple[List[LocationItem], str]:
        """Fetch live debounced autocomplete suggestions for location search."""
        clean_query = query.strip()
        if not clean_query:
            return [], "empty"

        cache_key = f"geoapify:autocomplete:{clean_query.lower()}:{limit}"
        cached = api_cache.get(cache_key)
        if cached is not None:
            return cached, "cached"

        if not self.api_key:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Geoapify API key is not configured in GEOAPIFY_API_KEY",
            )

        params = {
            "text": clean_query,
            "limit": limit,
            "apiKey": self.api_key,
            "format": "json",
        }

        async def _call():
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                res = await client.get(self.BASE_URL_AUTOCOMPLETE, params=params)
                if res.status_code == 401:
                    logger.error("Geoapify API key is invalid or unauthorized")
                    raise HTTPException(
                        status_code=status.HTTP_502_BAD_GATEWAY,
                        detail="Geoapify authentication failed. Invalid API key.",
                    )
                if res.status_code == 429:
                    logger.warning("Geoapify rate limit reached")
                    raise HTTPException(
                        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                        detail="Geoapify rate limit reached. Please try again shortly.",
                    )
                res.raise_for_status()
                return res.json()

        try:
            data = await execute_with_retry(_call, operation_name=f"Autocomplete '{clean_query}'")
        except Exception as e:
            logger.warning(f"Autocomplete error for '{clean_query}': {e}. Falling back to search_destinations.")
            dest_items, src = await self.search_destinations(clean_query, limit=limit)
            fallback_locations = [
                LocationItem(
                    place_id=d.place_id or f"{d.latitude:.5f},{d.longitude:.5f}",
                    name=d.name,
                    formatted_address=d.formatted,
                    city=d.city,
                    state=d.state,
                    country=d.country,
                    country_code=d.country_code,
                    latitude=d.latitude,
                    longitude=d.longitude,
                    category="city" if d.city else "general",
                    result_type="city",
                )
                for d in dest_items
            ]
            api_cache.set(cache_key, fallback_locations, ttl=settings.CACHE_DEFAULT_TTL_SECONDS)
            return fallback_locations, src

        results: List[LocationItem] = []
        raw_items = data.get("results", [])
        for item in raw_items:
            lat = item.get("lat")
            lon = item.get("lon")
            if lat is None or lon is None:
                continue

            name = item.get("name") or item.get("city") or item.get("formatted", clean_query).split(",")[0]
            formatted = item.get("formatted") or f"{name}, India"
            cat = self._categorize_result(item)

            results.append(
                LocationItem(
                    place_id=item.get("place_id") or f"{float(lat):.5f},{float(lon):.5f}",
                    name=name,
                    formatted_address=formatted,
                    city=item.get("city"),
                    state=item.get("state"),
                    country=item.get("country"),
                    country_code=item.get("country_code"),
                    latitude=float(lat),
                    longitude=float(lon),
                    category=cat,
                    result_type=item.get("result_type"),
                )
            )

        api_cache.set(cache_key, results, ttl=settings.CACHE_DEFAULT_TTL_SECONDS)
        return results, "live"

    async def reverse_geocode(
        self,
        latitude: float,
        longitude: float,
    ) -> Tuple[LocationItem, str]:
        """Convert latitude and longitude coordinates into a human-readable address."""
        self.validate_coordinates(latitude, longitude)
        cache_key = f"geoapify:reverse:{latitude:.5f}:{longitude:.5f}"
        cached = api_cache.get(cache_key)
        if cached is not None:
            return cached, "cached"

        if not self.api_key:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Geoapify API key is not configured in GEOAPIFY_API_KEY",
            )

        params = {
            "lat": latitude,
            "lon": longitude,
            "apiKey": self.api_key,
            "format": "json",
        }

        async def _call():
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                res = await client.get(self.BASE_URL_REVERSE, params=params)
                res.raise_for_status()
                return res.json()

        data = await execute_with_retry(
            _call, operation_name=f"Reverse geocode ({latitude}, {longitude})"
        )
        raw_results = data.get("results", [])
        if not raw_results:
            loc = LocationItem(
                place_id=f"{latitude:.5f},{longitude:.5f}",
                name=f"Location ({latitude:.4f}, {longitude:.4f})",
                formatted_address=f"Coordinates {latitude:.5f}, {longitude:.5f}",
                latitude=latitude,
                longitude=longitude,
                category="general",
                result_type="coordinate",
            )
            return loc, "fallback"

        item = raw_results[0]
        name = item.get("name") or item.get("street") or item.get("city") or f"Location ({latitude:.4f}, {longitude:.4f})"
        formatted = item.get("formatted") or f"{name}, {latitude:.4f}, {longitude:.4f}"
        cat = self._categorize_result(item)

        loc = LocationItem(
            place_id=item.get("place_id") or f"{latitude:.5f},{longitude:.5f}",
            name=name,
            formatted_address=formatted,
            city=item.get("city"),
            state=item.get("state"),
            country=item.get("country"),
            country_code=item.get("country_code"),
            latitude=float(item.get("lat", latitude)),
            longitude=float(item.get("lon", longitude)),
            category=cat,
            result_type=item.get("result_type"),
        )
        api_cache.set(cache_key, loc, ttl=settings.CACHE_DEFAULT_TTL_SECONDS)
        return loc, "live"

    def normalize_place(self, feature: Dict[str, Any]) -> Optional[PlaceItem]:
        """Convert a Geoapify GeoJSON feature into a normalized PlaceItem."""
        props = feature.get("properties", {})
        geometry = feature.get("geometry", {})
        coords = geometry.get("coordinates", [])

        # GeoJSON is [lon, lat]
        if len(coords) >= 2:
            lon, lat = float(coords[0]), float(coords[1])
        else:
            lat = props.get("lat")
            lon = props.get("lon")
            if lat is None or lon is None:
                return None
            lat, lon = float(lat), float(lon)

        name = props.get("name") or props.get("address_line1")
        if not name:
            # Skip unnamed POIs to keep quality high
            return None

        categories = props.get("categories", [])
        primary_category = categories[0] if categories else "general"

        place_id = props.get("place_id") or f"{lat:.5f},{lon:.5f}"

        # Contact and details
        contact = props.get("contact", {})
        website = props.get("website") or contact.get("website")
        phone = props.get("phone") or contact.get("phone")
        opening_hours = props.get("opening_hours")
        description = props.get("description") or props.get("wiki_and_media", {}).get("wikipedia_extracts")

        return PlaceItem(
            place_id=str(place_id),
            name=name,
            category=primary_category,
            categories=categories,
            address=props.get("formatted"),
            latitude=lat,
            longitude=lon,
            distance_meters=props.get("distance"),
            website=website,
            opening_hours=opening_hours,
            phone=phone,
            description=description,
        )

    def deduplicate_places(self, places: List[PlaceItem]) -> List[PlaceItem]:
        """Remove duplicate places based on place_id or matching name and close coordinates."""
        unique_places: List[PlaceItem] = []
        seen_ids = set()
        seen_keys = set()

        for place in places:
            if place.place_id and place.place_id in seen_ids:
                continue

            # Key by lowercase name and rounded lat/lon
            coord_key = (place.name.lower().strip(), round(place.latitude, 3), round(place.longitude, 3))
            if coord_key in seen_keys:
                continue

            seen_ids.add(place.place_id)
            seen_keys.add(coord_key)
            unique_places.append(place)

        return unique_places

    async def search_places(
        self,
        latitude: float,
        longitude: float,
        radius_meters: int = 5000,
        categories: str = "tourism.attraction",
        query: Optional[str] = None,
        limit: int = 20,
    ) -> Tuple[List[PlaceItem], str]:
        """Search points of interest (attractions, restaurants, etc.) around coordinates."""
        self.validate_coordinates(latitude, longitude)
        radius = min(max(radius_meters, 500), 50000)  # Bound between 500m and 50km
        safe_limit = min(max(limit, 1), 50)

        cache_key = f"geoapify:places:{latitude:.4f}:{longitude:.4f}:{radius}:{categories}:{query}:{safe_limit}"
        cached = api_cache.get(cache_key)
        if cached is not None:
            logger.info(f"[CACHE HIT] Places search near ({latitude}, {longitude})")
            return cached, "cached"

        if not self.api_key:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Geoapify API key is not configured in GEOAPIFY_API_KEY",
            )

        params: Dict[str, Any] = {
            "categories": categories,
            "filter": f"circle:{longitude},{latitude},{radius}",
            "bias": f"proximity:{longitude},{latitude}",
            "limit": safe_limit,
            "apiKey": self.api_key,
        }

        if query and query.strip():
            params["name"] = query.strip()

        async def _call():
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                res = await client.get(self.BASE_URL_PLACES, params=params)
                if res.status_code == 401:
                    logger.error("Geoapify API key is invalid or unauthorized")
                    raise HTTPException(
                        status_code=status.HTTP_502_BAD_GATEWAY,
                        detail="Geoapify authentication failed. Invalid API key.",
                    )
                if res.status_code == 429:
                    logger.warning("Geoapify rate limit reached")
                    raise HTTPException(
                        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                        detail="Geoapify rate limit reached. Please try again shortly.",
                    )
                res.raise_for_status()
                return res.json()

        data = await execute_with_retry(
            _call,
            operation_name=f"Search places at ({latitude}, {longitude})",
        )

        features = data.get("features", [])
        normalized = []
        for feat in features:
            item = self.normalize_place(feat)
            if item:
                normalized.append(item)

        unique_places = self.deduplicate_places(normalized)
        api_cache.set(cache_key, unique_places, ttl=settings.CACHE_DEFAULT_TTL_SECONDS)
        return unique_places, "live"

    async def search_attractions(
        self,
        latitude: float,
        longitude: float,
        radius_meters: int = 5000,
        limit: int = 20,
    ) -> Tuple[List[PlaceItem], str]:
        """Convenience method to search tourist sights, attractions, and heritage landmarks."""
        categories = "tourism.attraction,tourism.sights,entertainment.museum,heritage"
        return await self.search_places(
            latitude=latitude,
            longitude=longitude,
            radius_meters=radius_meters,
            categories=categories,
            limit=limit,
        )

    async def search_restaurants(
        self,
        latitude: float,
        longitude: float,
        radius_meters: int = 5000,
        limit: int = 20,
    ) -> Tuple[List[PlaceItem], str]:
        """Convenience method to search dining, cafes, and restaurants."""
        categories = "catering.restaurant,catering.cafe"
        return await self.search_places(
            latitude=latitude,
            longitude=longitude,
            radius_meters=radius_meters,
            categories=categories,
            limit=limit,
        )

    async def get_place_details(
        self,
        place_id: str,
    ) -> Tuple[PlaceItem, Dict[str, Any], str]:
        """Retrieve rich place details by place_id."""
        clean_id = place_id.strip()
        if not clean_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Place ID cannot be empty",
            )

        cache_key = f"geoapify:place_details:{clean_id}"
        cached = api_cache.get(cache_key)
        if cached is not None:
            logger.info(f"[CACHE HIT] Place details for ID '{clean_id}'")
            return cached[0], cached[1], "cached"

        if not self.api_key:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Geoapify API key is not configured in GEOAPIFY_API_KEY",
            )

        params = {
            "id": clean_id,
            "apiKey": self.api_key,
        }

        async def _call():
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                res = await client.get(self.BASE_URL_PLACE_DETAILS, params=params)
                if res.status_code == 404:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail=f"Place with ID '{clean_id}' was not found.",
                    )
                res.raise_for_status()
                return res.json()

        data = await execute_with_retry(_call, operation_name=f"Get place details for '{clean_id}'")
        features = data.get("features", [])
        if not features:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Place details not found for ID '{clean_id}'",
            )

        feature = features[0]
        place_item = self.normalize_place(feature)
        if place_item:
            # Retain the queried place_id for client consistency
            place_item.place_id = clean_id
        else:
            props = feature.get("properties", {})
            place_item = PlaceItem(
                place_id=clean_id,
                name=props.get("name", "Unknown Place"),
                category="general",
                address=props.get("formatted"),
                latitude=float(props.get("lat", 0.0)),
                longitude=float(props.get("lon", 0.0)),
            )

        api_cache.set(cache_key, (place_item, feature), ttl=settings.CACHE_DEFAULT_TTL_SECONDS)
        return place_item, feature, "live"


geoapify_service = GeoapifyService()
