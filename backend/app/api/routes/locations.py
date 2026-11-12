from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query, status

try:
    from app.core.logger import logger
    from app.schemas.external import Coordinate
    from app.schemas.location import (
        LocationAutocompleteResponse,
        LocationItem,
        ReverseGeocodeResponse,
        RoutePreviewRequest,
        RoutePreviewResponse,
    )
    from app.services.geoapify_service import geoapify_service
    from app.services.ors_service import ors_service
except ImportError:
    from backend.app.core.logger import logger
    from backend.app.schemas.external import Coordinate
    from backend.app.schemas.location import (
        LocationAutocompleteResponse,
        LocationItem,
        ReverseGeocodeResponse,
        RoutePreviewRequest,
        RoutePreviewResponse,
    )
    from backend.app.services.geoapify_service import geoapify_service
    from backend.app.services.ors_service import ors_service

router = APIRouter(prefix="/locations", tags=["Locations & Geocoding"])


@router.get(
    "/autocomplete",
    response_model=LocationAutocompleteResponse,
    status_code=status.HTTP_200_OK,
    summary="Search location suggestions via live debounced autocomplete",
    description="Provides Google Maps-style location suggestions with category tags (cities, airports, railway stations, landmarks, hotels).",
)
async def autocomplete_locations(
    q: str = Query(..., min_length=1, description="Location search text query"),
    limit: int = Query(default=6, ge=1, le=15, description="Maximum suggestions to return"),
) -> LocationAutocompleteResponse:
    clean_query = q.strip()
    if not clean_query:
        return LocationAutocompleteResponse(query=q, total=0, results=[], source="empty")

    try:
        results, source = await geoapify_service.autocomplete(clean_query, limit=limit)
        return LocationAutocompleteResponse(
            query=clean_query,
            total=len(results),
            results=results,
            source=source,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in location autocomplete for '{clean_query}': {e}", exc_info=True)
        # Attempt fallback to destination search
        try:
            dest_items, src = await geoapify_service.search_destinations(clean_query, limit=limit)
            fallback_items = [
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
            return LocationAutocompleteResponse(
                query=clean_query,
                total=len(fallback_items),
                results=fallback_items,
                source=f"fallback_{src}",
            )
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to retrieve location suggestions for '{clean_query}'.",
            )


@router.get(
    "/reverse",
    response_model=ReverseGeocodeResponse,
    status_code=status.HTTP_200_OK,
    summary="Reverse geocode map coordinates to human-readable address",
    description="Translates clicked or dragged map coordinates (lat/lon) into structured address and place name.",
)
async def reverse_geocode_location(
    lat: float = Query(..., ge=-90.0, le=90.0, description="Latitude in decimal degrees"),
    lon: float = Query(..., ge=-180.0, le=180.0, description="Longitude in decimal degrees"),
) -> ReverseGeocodeResponse:
    try:
        location_item, source = await geoapify_service.reverse_geocode(lat, lon)
        return ReverseGeocodeResponse(
            latitude=lat,
            longitude=lon,
            location=location_item,
            source=source,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in reverse geocode ({lat}, {lon}): {e}", exc_info=True)
        # Fallback coordinate item
        fallback = LocationItem(
            place_id=f"{lat:.5f},{lon:.5f}",
            name=f"Selected Location ({lat:.4f}, {lon:.4f})",
            formatted_address=f"Coordinates {lat:.5f}, {lon:.5f}",
            latitude=lat,
            longitude=lon,
            category="general",
            result_type="coordinate",
        )
        return ReverseGeocodeResponse(
            latitude=lat,
            longitude=lon,
            location=fallback,
            source="fallback",
        )


@router.post(
    "/route-preview",
    response_model=RoutePreviewResponse,
    status_code=status.HTTP_200_OK,
    summary="Calculate driving road route preview between source and destination",
    description="Computes distance in km, driving duration in hours/minutes, and Leaflet polyline geometry.",
)
async def preview_route(
    payload: RoutePreviewRequest,
) -> RoutePreviewResponse:
    # Validate coordinate distance
    dist_straight = ors_service.haversine_distance_km(
        payload.source_latitude, payload.source_longitude, payload.dest_latitude, payload.dest_longitude
    )

    profile = payload.profile or "driving-car"
    coords = [
        Coordinate(latitude=payload.source_latitude, longitude=payload.source_longitude),
        Coordinate(latitude=payload.dest_latitude, longitude=payload.dest_longitude),
    ]

    try:
        route_res = await ors_service.calculate_route(coords, profile=profile)
        road_distance_km = route_res.distance_km
        duration_mins = route_res.duration_minutes
        geometry = route_res.geometry
        source = route_res.source
    except Exception as e:
        logger.warning(f"ORS route preview failed: {e}. Calculating simulated route.")
        sim = ors_service._calculate_simulated_route(coords, profile=profile, reason=str(e))
        road_distance_km = sim.distance_km
        duration_mins = sim.duration_minutes
        geometry = sim.geometry
        source = "simulated"

    duration_hours = round(duration_mins / 60.0, 2)
    # Long distance criteria: > 300 km or > 5 hours driving
    is_long_dist = road_distance_km >= 300.0 or duration_mins >= 300.0
    suggest_stopover = is_long_dist

    return RoutePreviewResponse(
        distance_km=road_distance_km,
        duration_minutes=duration_mins,
        duration_hours=duration_hours,
        profile=profile,
        geometry=geometry,
        is_long_distance=is_long_dist,
        suggest_stopover=suggest_stopover,
        source=source,
    )

